"""GetPut and scale-rule tests for the tracking layers lens.

The lens makes the canonical layers records authoritative: each per-frame mask is
a single annotation carrying the exact ``coco-rle`` in ``annotation.spatial``, the
confidence on the integer 0-1000 scale, and the frame's occlusion as the keyframe's
visibility; the per-frame annotations of one tracked object are grouped by a
``ClusterSet`` cluster (the object id is the cluster ``uuid``). The frame number
follows from the keyframe ``timeMs`` and the media frame rate (``media.videoInfo``,
scaled by 100), and the total frame count rides on a media feature. There is no
verbatim complement, and the per-frame/per-response processing time is dropped as
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

_EXPRESSION_NSID = "pub.layers.expression.expression"
_MEDIA_NSID = "pub.layers.media.media"
_LAYER_NSID = "pub.layers.annotation.annotationLayer"
_CLUSTERSET_NSID = "pub.layers.annotation.clusterSet"


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
        _EXPRESSION_NSID,
        _MEDIA_NSID,
        _LAYER_NSID,
        _CLUSTERSET_NSID,
    }
    for record in view.records:
        if record.nsid == _EXPRESSION_NSID:
            expr = expression.Expression.model_validate_json(record.value_json)
            assert expr.kind == "video"
            assert expr.id == dto.video_id
        elif record.nsid == _MEDIA_NSID:
            m = media.Media.model_validate_json(record.value_json)
            assert m.video is not None
            assert (m.video.width, m.video.height) == (30, 20)
            assert m.video.frameRate == 3000  # round(30.0 * 100)
        elif record.nsid == _LAYER_NSID:
            layer = annotation.AnnotationLayer.model_validate_json(record.value_json)
            assert layer.kind == "span"
            assert layer.subkind == "custom"
            # Each mask is one flat annotation (no parent/child nesting); three
            # masks total: object 1 in two frames, object 2 in one.
            assert all(a.parentId is None for a in layer.annotations)
            assert len(layer.annotations) == 3


def test_layer_record_is_keyed_by_response_id() -> None:
    dto = _dto()
    view, _complement = TRACKING_LAYERS.forward(dto)
    layer_record = next(r for r in view.records if r.nsid == _LAYER_NSID)
    assert layer_record.local_id == "track-abc"
    layer = annotation.AnnotationLayer.model_validate_json(layer_record.value_json)
    assert layer.expression == f"at://local/{_EXPRESSION_NSID}/{dto.video_id}"


def test_each_frame_mask_is_an_annotation_carrying_coco_rle() -> None:
    dto = _dto()
    view, _complement = TRACKING_LAYERS.forward(dto)
    layer = _layer(view)
    # Three per-frame masks: object 1 in two frames, object 2 in one.
    assert len(layer.annotations) == 3
    for ann in layer.annotations:
        assert ann.spatial is not None
        assert ann.spatial.value.geometryFormat == "coco-rle"
        assert ann.confidence is not None
        assert 0 <= ann.confidence <= 1000


def test_objects_group_by_cluster_membership() -> None:
    dto = _dto()
    view, _complement = TRACKING_LAYERS.forward(dto)
    cluster_record = next(r for r in view.records if r.nsid == _CLUSTERSET_NSID)
    cluster_set = annotation.ClusterSet.model_validate_json(cluster_record.value_json)
    # One cluster per tracked object (uuid = object id), first-appearance order.
    assert [c.uuid.value for c in cluster_set.clusters] == ["1", "2"]
    # Object 1's cluster holds its two per-frame masks; object 2's holds its one.
    assert len(cluster_set.clusters[0].members) == 2
    assert len(cluster_set.clusters[1].members) == 1


def test_occlusion_rides_on_keyframe_visibility() -> None:
    dto = _dto()
    view, _complement = TRACKING_LAYERS.forward(dto)
    layer = _layer(view)
    # Object 2 (uuid "2-f0") is occluded, so its keyframe carries visible=false; the
    # unoccluded object-1 masks carry no visibility feature.
    occluded = next(a for a in layer.annotations if a.uuid.value == "2-f0")
    keyframe = occluded.anchor.spatioTemporalAnchor.keyframes[0]
    assert keyframe.features is not None
    assert {e.key: e.value for e in keyframe.features.entries} == {"visible": "false"}
    visible = next(a for a in layer.annotations if a.uuid.value == "1-f0")
    assert visible.anchor.spatioTemporalAnchor.keyframes[0].features is None


def test_total_frames_rides_on_a_media_feature() -> None:
    dto = _dto()
    view, _complement = TRACKING_LAYERS.forward(dto)
    media_record = next(r for r in view.records if r.nsid == _MEDIA_NSID)
    m = media.Media.model_validate_json(media_record.value_json)
    # The DTO's total frame count (6) rides on a media feature, not derived as the
    # max frame number + 1 (which for frames 0 and 5 would be 6 only by chance). The
    # feature map json-encodes each value, so the stored entry value is the text "6".
    assert m.features is not None
    assert {e.key: e.value for e in m.features.entries} == {"total_frames": "6"}


def test_scale_rules_hold() -> None:
    dto = _dto()
    view, _complement = TRACKING_LAYERS.forward(dto)
    layer = _layer(view)
    for ann in layer.annotations:
        sta = ann.anchor.spatioTemporalAnchor
        assert sta is not None
        assert isinstance(sta.temporalSpan.start, int)
        for keyframe in sta.keyframes:
            assert isinstance(keyframe.timeMs, int)
            assert keyframe.bbox.width >= 1
            assert keyframe.bbox.height >= 1
    # Object 1's two per-frame masks anchor at 0 ms and 167 ms.
    obj1_times = sorted(
        a.anchor.spatioTemporalAnchor.keyframes[0].timeMs
        for a in layer.annotations
        if a.uuid.value.startswith("1-f")
    )
    assert obj1_times == [0, 167]


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
    # The frame number is derived on read from the keyframe time and the stored
    # frame rate, so a result round-trips only when its frames are consistent with
    # that rate. Frames sit at whole seconds of an integer-fps video, so
    # frame_number == fps * second is exact and the seconds are distinct (no two
    # frames merge on reconstruction).
    fps = draw(st.integers(min_value=1, max_value=120))
    seconds = draw(
        st.lists(st.integers(min_value=0, max_value=600), min_size=1, max_size=3, unique=True)
    )
    frames: list[TrackingFrameDTO] = []
    for second in seconds:
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
                frame_number=fps * second,
                timestamp=float(second),
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
        total_frames=len(frames),
        processing_time=0.0,
        # An integer fps round-trips through the x100 frame-rate field.
        fps=float(fps),
    )


def test_lens_laws_property() -> None:
    dx.testing.check_lens_laws(TRACKING_LAYERS, _tracking_dtos(), max_examples=40)
