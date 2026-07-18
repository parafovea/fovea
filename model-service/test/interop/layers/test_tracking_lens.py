"""GetPut and scale-rule tests for the tracking layers lens.

The lens makes the canonical layers records authoritative: each per-frame mask is
a child annotation carrying the exact ``coco-rle`` in ``annotation.spatial``,
parented under the object's track annotation; the object id is the parent label,
the frame rate is ``media.videoInfo.frameRate`` (scaled by 100), and the frame
number / occlusion / confidence ride on child features. There is no verbatim
complement, and the per-frame/per-response processing time is dropped as
telemetry, so the laws hold over quantized, telemetry-free results.
"""

from __future__ import annotations

import numpy as np
import pytest

pytest.importorskip("lairs")
pytest.importorskip("panproto")
pytest.importorskip("pycocotools")

import didactic.api as dx
from hypothesis import strategies as st
from lairs.records import annotation, expression, media
from pycocotools import mask as coco_mask

from src.application.dto.tracking import (
    TrackingFrameDTO,
    TrackingMaskDTO,
    TrackObjectsResponseDTO,
)
from src.infrastructure.adapters.outbound.layers.lenses.tracking import (
    TRACKING_LAYERS,
    TrackingLayersLens,
)

_LAYER_NSID = "pub.layers.annotation.annotationLayer"


def _rle(height: int, width: int, box: tuple[int, int, int, int]) -> dict:
    """Build a clean, JSON-able COCO RLE for a filled rectangle in a mask."""
    x, y, w, h = box
    mask = np.zeros((height, width), dtype=np.uint8, order="F")
    mask[y : y + h, x : x + w] = 1
    encoded = coco_mask.encode(np.asfortranarray(mask))
    return {
        "size": [int(encoded["size"][0]), int(encoded["size"][1])],
        "counts": encoded["counts"].decode("ascii"),
    }


def _dto() -> TrackObjectsResponseDTO:
    """A deterministic two-object, two-frame tracking result.

    Confidences sit on the integer 0..1000 grid and timestamps on the integer
    millisecond grid, so the quantized projection round-trips.
    """
    frame0 = TrackingFrameDTO(
        frame_number=0,
        timestamp=0.0,
        processing_time=0.0,
        masks=[
            TrackingMaskDTO(
                object_id=1,
                mask_rle=_rle(20, 30, (3, 4, 6, 5)),
                confidence=0.9,
                is_occluded=False,
            ),
            TrackingMaskDTO(
                object_id=2,
                mask_rle=_rle(20, 30, (15, 2, 8, 9)),
                confidence=0.45,
                is_occluded=True,
            ),
        ],
    )
    frame1 = TrackingFrameDTO(
        frame_number=5,
        timestamp=0.167,
        processing_time=0.0,
        masks=[
            TrackingMaskDTO(
                object_id=1,
                mask_rle=_rle(20, 30, (4, 5, 6, 5)),
                confidence=0.8,
                is_occluded=False,
            ),
        ],
    )
    return TrackObjectsResponseDTO(
        id="track-abc",
        video_id="video-0",
        frames=[frame0, frame1],
        video_width=30,
        video_height=20,
        total_frames=6,
        processing_time=0.0,
        fps=30.0,
    )


def _layer(view: object) -> annotation.AnnotationLayer:
    record = next(record for record in view.records if record.nsid == _LAYER_NSID)
    return annotation.AnnotationLayer.model_validate_json(record.value_json)


def test_getput_roundtrip() -> None:
    dto = _dto()
    view, complement = TRACKING_LAYERS.forward(dto)
    assert TRACKING_LAYERS.backward(view, complement) == dto


def test_complement_is_empty() -> None:
    _view, complement = TRACKING_LAYERS.forward(_dto())
    assert complement is None


def test_view_records_validate_as_lairs_models() -> None:
    dto = _dto()
    view, _complement = TRACKING_LAYERS.forward(dto)
    nsids = {record.nsid for record in view.records}
    assert nsids == {
        "pub.layers.expression.expression",
        "pub.layers.media.media",
        "pub.layers.annotation.annotationLayer",
    }
    for record in view.records:
        if record.nsid == "pub.layers.expression.expression":
            expr = expression.Expression.model_validate_json(record.value_json)
            assert expr.kind == "video"
            assert expr.id == dto.video_id
        elif record.nsid == "pub.layers.media.media":
            m = media.Media.model_validate_json(record.value_json)
            assert m.video is not None
            assert (m.video.width, m.video.height) == (30, 20)
            assert m.video.frameRate == 3000  # round(30.0 * 100)
        else:
            layer = annotation.AnnotationLayer.model_validate_json(record.value_json)
            assert layer.kind == "span"
            assert layer.subkind == "custom"
            # One parent track annotation per object, in first-appearance order.
            assert [a.label for a in layer.annotations if a.parentId is None] == ["1", "2"]


def test_layer_record_is_keyed_by_response_id() -> None:
    dto = _dto()
    view, _complement = TRACKING_LAYERS.forward(dto)
    layer_record = next(r for r in view.records if r.nsid == _LAYER_NSID)
    assert layer_record.local_id == "track-abc"
    layer = annotation.AnnotationLayer.model_validate_json(layer_record.value_json)
    assert layer.expression == f"at://local/pub.layers.expression.expression/{dto.video_id}"


def test_each_frame_mask_is_a_child_carrying_coco_rle() -> None:
    dto = _dto()
    view, _complement = TRACKING_LAYERS.forward(dto)
    layer = _layer(view)
    children = [a for a in layer.annotations if a.parentId is not None]
    # Three per-frame masks: object 1 in two frames, object 2 in one.
    assert len(children) == 3
    for child in children:
        assert child.spatial is not None
        assert child.spatial.value.geometryFormat == "coco-rle"
        assert child.confidence is not None
        assert 0 <= child.confidence <= 1000


def test_scale_rules_hold() -> None:
    dto = _dto()
    view, _complement = TRACKING_LAYERS.forward(dto)
    layer = _layer(view)
    for child in (a for a in layer.annotations if a.parentId is not None):
        sta = child.anchor.spatioTemporalAnchor
        assert sta is not None
        assert isinstance(sta.temporalSpan.start, int)
        for keyframe in sta.keyframes:
            assert isinstance(keyframe.timeMs, int)
            assert keyframe.bbox.width >= 1
            assert keyframe.bbox.height >= 1
    # Object 1's parent track spans frames at 0 ms and 167 ms.
    obj1 = next(a for a in layer.annotations if a.parentId is None and a.label == "1")
    assert obj1.anchor.temporalSpan.start == 0
    assert obj1.anchor.temporalSpan.ending == 167


def test_singleton_is_lens_instance() -> None:
    assert isinstance(TRACKING_LAYERS, TrackingLayersLens)


# --- property-based GetPut over generated tracking results ------------------


@st.composite
def _tracking_dtos(draw: st.DrawFn) -> TrackObjectsResponseDTO:
    width = draw(st.integers(min_value=8, max_value=40))
    height = draw(st.integers(min_value=8, max_value=40))
    object_ids = draw(
        st.lists(
            st.integers(min_value=0, max_value=20),
            min_size=1,
            max_size=3,
            unique=True,
        )
    )
    n_frames = draw(st.integers(min_value=1, max_value=3))
    frames: list[TrackingFrameDTO] = []
    for frame_index in range(n_frames):
        masks: list[TrackingMaskDTO] = []
        for object_id in object_ids:
            bw = draw(st.integers(min_value=1, max_value=max(1, width - 1)))
            bh = draw(st.integers(min_value=1, max_value=max(1, height - 1)))
            bx = draw(st.integers(min_value=0, max_value=width - bw))
            by = draw(st.integers(min_value=0, max_value=height - bh))
            masks.append(
                TrackingMaskDTO(
                    object_id=object_id,
                    mask_rle=_rle(height, width, (bx, by, bw, bh)),
                    # Confidence on the quantized 0..1000 grid.
                    confidence=draw(st.integers(min_value=0, max_value=1000)) / 1000.0,
                    is_occluded=draw(st.booleans()),
                )
            )
        frames.append(
            TrackingFrameDTO(
                frame_number=frame_index,
                # Timestamp on the integer-millisecond grid.
                timestamp=draw(st.integers(min_value=0, max_value=100_000)) / 1000.0,
                masks=masks,
                processing_time=0.0,
            )
        )
    return TrackObjectsResponseDTO(
        id=draw(st.text(min_size=1, max_size=8)),
        video_id=draw(st.text(min_size=1, max_size=8)),
        frames=frames,
        video_width=width,
        video_height=height,
        total_frames=n_frames,
        processing_time=0.0,
        # Frame rate on the x100 grid so it round-trips through the integer field.
        fps=draw(st.integers(min_value=100, max_value=12_000)) / 100.0,
    )


def test_lens_laws_property() -> None:
    dx.testing.check_lens_laws(TRACKING_LAYERS, _tracking_dtos(), max_examples=40)
