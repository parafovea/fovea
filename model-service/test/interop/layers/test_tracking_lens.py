"""GetPut and scale-rule tests for the tracking layers lens.

The lens projects a :class:`TrackObjectsResponseDTO` to a lossy layers fragment
(integer milliseconds, integer confidences, RLE-derived pixel boxes) plus a fovea
complement carrying the exact source values. These tests assert the GetPut law
(``backward(*forward(dto)) == dto``), that the emitted records validate as
``lairs`` models, and that the integer scale rules hold.
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
    """A deterministic two-object, two-frame tracking result."""
    frame0 = TrackingFrameDTO(
        frame_number=0,
        timestamp=0.0,
        processing_time=0.011,
        masks=[
            TrackingMaskDTO(
                object_id=1,
                mask_rle=_rle(20, 30, (3, 4, 6, 5)),
                confidence=0.9123,
                is_occluded=False,
            ),
            TrackingMaskDTO(
                object_id=2,
                mask_rle=_rle(20, 30, (15, 2, 8, 9)),
                confidence=0.4567,
                is_occluded=True,
            ),
        ],
    )
    frame1 = TrackingFrameDTO(
        frame_number=5,
        timestamp=0.1667,
        processing_time=0.013,
        masks=[
            TrackingMaskDTO(
                object_id=1,
                mask_rle=_rle(20, 30, (4, 5, 6, 5)),
                confidence=0.8005,
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
        processing_time=0.024,
        fps=30.0,
    )


def test_getput_roundtrip() -> None:
    dto = _dto()
    view, complement = TRACKING_LAYERS.forward(dto)
    assert TRACKING_LAYERS.backward(view, complement) == dto


def test_complement_is_json_roundtrippable() -> None:
    import json

    dto = _dto()
    view, complement = TRACKING_LAYERS.forward(dto)
    complement = json.loads(json.dumps(complement))
    assert TRACKING_LAYERS.backward(view, complement) == dto


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
            assert m.kind == "video"
            assert m.video is not None
            assert m.video.width == 30
            assert m.video.height == 20
        else:
            layer = annotation.AnnotationLayer.model_validate_json(record.value_json)
            assert layer.kind == "span"
            assert layer.subkind == "custom"
            # One annotation per tracked object, in first-appearance order.
            assert [a.label for a in layer.annotations] == ["1", "2"]


def test_fragment_emits_expression_record_the_layer_points_at() -> None:
    """The annotation layer's ``expression`` resolves to an emitted Expression.

    The fragment carries three records in a fixed order — an Expression, a
    Media, and the AnnotationLayer — and the layer's ``expression`` AT-URI names
    the Expression record's collection (``pub.layers.expression.expression``)
    keyed by the tracked video id, so the layer never dangles at a record type
    the fragment does not contain.
    """
    dto = _dto()
    view, _complement = TRACKING_LAYERS.forward(dto)

    assert [record.nsid for record in view.records] == [
        "pub.layers.expression.expression",
        "pub.layers.media.media",
        "pub.layers.annotation.annotationLayer",
    ]

    expression_record = next(
        record for record in view.records if record.nsid == "pub.layers.expression.expression"
    )
    assert expression_record.local_id == "expression"
    expr = expression.Expression.model_validate_json(expression_record.value_json)
    assert expr.kind == "video"
    assert expr.id == dto.video_id

    layer_record = next(
        record for record in view.records if record.nsid == "pub.layers.annotation.annotationLayer"
    )
    layer = annotation.AnnotationLayer.model_validate_json(layer_record.value_json)
    assert layer.expression == f"at://local/pub.layers.expression.expression/{dto.video_id}"


def test_scale_rules_hold() -> None:
    dto = _dto()
    view, _complement = TRACKING_LAYERS.forward(dto)
    layer = next(
        annotation.AnnotationLayer.model_validate_json(r.value_json)
        for r in view.records
        if r.nsid == "pub.layers.annotation.annotationLayer"
    )
    for annot in layer.annotations:
        assert annot.confidence is not None
        assert 0 <= annot.confidence <= 1000
        st_anchor = annot.anchor.spatioTemporalAnchor
        assert st_anchor is not None
        span = st_anchor.temporalSpan
        # Milliseconds are integers with start <= ending.
        assert isinstance(span.start, int)
        assert isinstance(span.ending, int)
        assert span.start <= span.ending
        for keyframe in st_anchor.keyframes:
            assert isinstance(keyframe.timeMs, int)
            assert keyframe.bbox.width >= 1
            assert keyframe.bbox.height >= 1
        # Object 1's span covers frames at 0 ms and 167 ms.
    obj1 = next(a for a in layer.annotations if a.label == "1")
    span1 = obj1.anchor.spatioTemporalAnchor.temporalSpan
    assert span1.start == 0
    assert span1.ending == 167


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
                    confidence=draw(st.floats(min_value=0.0, max_value=1.0)),
                    is_occluded=draw(st.booleans()),
                )
            )
        frames.append(
            TrackingFrameDTO(
                frame_number=frame_index,
                timestamp=draw(st.floats(min_value=0.0, max_value=100.0)),
                masks=masks,
                processing_time=draw(st.floats(min_value=0.0, max_value=1.0)),
            )
        )
    return TrackObjectsResponseDTO(
        id=draw(st.text(min_size=1, max_size=8)),
        video_id=draw(st.text(min_size=1, max_size=8)),
        frames=frames,
        video_width=width,
        video_height=height,
        total_frames=n_frames,
        processing_time=draw(st.floats(min_value=0.0, max_value=1.0)),
        fps=draw(st.floats(min_value=1.0, max_value=120.0)),
    )


def test_lens_laws_property() -> None:
    dx.testing.check_lens_laws(TRACKING_LAYERS, _tracking_dtos(), max_examples=40)
