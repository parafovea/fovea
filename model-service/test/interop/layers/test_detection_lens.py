"""Round-trip law tests for the detection response <-> layers fragment lens."""

from __future__ import annotations

import pytest

pytest.importorskip("lairs")
pytest.importorskip("panproto")

from lairs.records import annotation, expression, media

from src.application.dto.detection import (
    BoundingBoxDTO,
    DetectionDTO,
    DetectObjectsResponseDTO,
    FrameDetectionsDTO,
)
from src.infrastructure.adapters.outbound.layers._convert import (
    ANNOTATION_LAYER_NSID,
    EXPRESSION_NSID,
    MEDIA_NSID,
)
from src.infrastructure.adapters.outbound.layers.lenses.detection import (
    DETECTION_LAYERS,
)

LENS = DETECTION_LAYERS


def _example_dto() -> DetectObjectsResponseDTO:
    """A deterministic, multi-frame detection response (no now()/random)."""
    return DetectObjectsResponseDTO(
        id="detect-0",
        video_id="video-7",
        query="find every cat and dog",
        frames=[
            FrameDetectionsDTO(
                frame_number=0,
                timestamp=0.5,
                detections=[
                    DetectionDTO(
                        label="cat",
                        bounding_box=BoundingBoxDTO(x=0.1, y=0.2, width=0.3, height=0.4),
                        confidence=0.875,
                        track_id="track-1",
                    ),
                    DetectionDTO(
                        label="dog",
                        bounding_box=BoundingBoxDTO(x=0.0, y=0.0, width=0.0004, height=0.0004),
                        confidence=0.5,
                        track_id=None,
                    ),
                ],
            ),
            FrameDetectionsDTO(
                frame_number=12,
                timestamp=2.04,
                detections=[
                    DetectionDTO(
                        label="cat",
                        bounding_box=BoundingBoxDTO(x=0.55, y=0.6, width=0.2, height=0.15),
                        confidence=0.9123,
                        track_id="track-1",
                    ),
                ],
            ),
            FrameDetectionsDTO(frame_number=24, timestamp=4.0, detections=[]),
        ],
        total_detections=3,
        processing_time=1.2345,
        video_width=640,
        video_height=480,
    )


def _layer(view: object) -> annotation.AnnotationLayer:
    record = next(record for record in view.records if record.nsid == ANNOTATION_LAYER_NSID)
    return annotation.AnnotationLayer.model_validate_json(record.value_json)


class TestGetPut:
    """The complement carries every lossy source value so backward is exact."""

    def test_example_roundtrip(self) -> None:
        dto = _example_dto()
        view, complement = LENS.forward(dto)
        assert LENS.backward(view, complement) == dto

    def test_putget_roundtrip(self) -> None:
        dto = _example_dto()
        view, complement = LENS.forward(dto)
        view2, complement2 = LENS.forward(LENS.backward(view, complement))
        assert (view2, complement2) == (view, complement)

    def test_empty_response_roundtrip(self) -> None:
        dto = DetectObjectsResponseDTO(
            id="empty",
            video_id="v0",
            query="",
            frames=[],
            total_detections=0,
            processing_time=0.0,
            video_width=1920,
            video_height=1080,
        )
        view, complement = LENS.forward(dto)
        assert LENS.backward(view, complement) == dto

    def test_exact_floats_survive(self) -> None:
        dto = _example_dto()
        view, complement = LENS.forward(dto)
        back = LENS.backward(view, complement)
        assert back.frames[0].detections[0].confidence == 0.875
        assert back.frames[0].detections[0].bounding_box.width == 0.3
        assert back.frames[1].timestamp == 2.04
        assert back.processing_time == 1.2345


class TestViewProjection:
    """The layers view is a faithful, integer-scaled projection."""

    def test_records_validate_as_lairs_models(self) -> None:
        dto = _example_dto()
        view, _complement = LENS.forward(dto)
        for record in view.records:
            if record.nsid == EXPRESSION_NSID:
                expression.Expression.model_validate_json(record.value_json)
            elif record.nsid == MEDIA_NSID:
                media.Media.model_validate_json(record.value_json)
            elif record.nsid == ANNOTATION_LAYER_NSID:
                annotation.AnnotationLayer.model_validate_json(record.value_json)

    def test_expression_and_media_shape(self) -> None:
        dto = _example_dto()
        view, _complement = LENS.forward(dto)
        expr_record = next(r for r in view.records if r.nsid == EXPRESSION_NSID)
        expr = expression.Expression.model_validate_json(expr_record.value_json)
        assert expr.kind == "video"
        assert expr.id == "video-7"

        media_record = next(r for r in view.records if r.nsid == MEDIA_NSID)
        med = media.Media.model_validate_json(media_record.value_json)
        assert med.kind == "video"
        assert med.video is not None
        assert (med.video.width, med.video.height) == (640, 480)

    def test_layer_is_span_entity_mention(self) -> None:
        dto = _example_dto()
        view, _complement = LENS.forward(dto)
        layer = _layer(view)
        assert layer.kind == "span"
        assert layer.subkind == "entity-mention"
        # one annotation per detection, across all frames (3 total)
        assert len(layer.annotations) == 3

    def test_scale_rules_hold(self) -> None:
        dto = _example_dto()
        view, _complement = LENS.forward(dto)
        layer = _layer(view)
        for ann in layer.annotations:
            # confidence scaled into [0, 1000]
            assert ann.confidence is not None
            assert 0 <= ann.confidence <= 1000
            anchor = ann.anchor
            assert anchor is not None
            sta = anchor.spatioTemporalAnchor
            assert sta is not None
            assert sta.interpolation == "step"
            # temporal span in integer milliseconds
            assert isinstance(sta.temporalSpan.start, int)
            assert isinstance(sta.temporalSpan.ending, int)
            assert sta.temporalSpan.start >= 0
            keyframe = sta.keyframes[0]
            assert isinstance(keyframe.timeMs, int)
            # bounding box width/height clamped to >= 1 pixel
            assert keyframe.bbox.width >= 1
            assert keyframe.bbox.height >= 1

    def test_confidence_and_time_values(self) -> None:
        dto = _example_dto()
        view, _complement = LENS.forward(dto)
        layer = _layer(view)
        first = layer.annotations[0]
        assert first.label == "cat"
        assert first.confidence == 875  # round(0.875 * 1000)
        keyframe = first.anchor.spatioTemporalAnchor.keyframes[0]
        assert keyframe.timeMs == 500  # round(0.5 * 1000)

    def test_tiny_box_clamps_to_one_pixel(self) -> None:
        dto = _example_dto()
        view, _complement = LENS.forward(dto)
        layer = _layer(view)
        # the dog box (0.0004 * 640 = 0.256 -> round 0 -> clamp 1)
        dog = layer.annotations[1]
        keyframe = dog.anchor.spatioTemporalAnchor.keyframes[0]
        assert keyframe.bbox.width == 1
        assert keyframe.bbox.height == 1

    def test_track_id_rides_as_feature(self) -> None:
        dto = _example_dto()
        view, _complement = LENS.forward(dto)
        layer = _layer(view)
        cat = layer.annotations[0]
        assert cat.features is not None
        entries = {e.key: e.value for e in cat.features.entries}
        assert "track_id" in entries
        # a detection with no track id carries no features
        dog = layer.annotations[1]
        assert dog.features is None


class TestLensLaws:
    """Property-based GetPut over a small generated space of responses."""

    def test_check_lens_laws(self) -> None:
        hypothesis = pytest.importorskip("hypothesis")
        st = hypothesis.strategies
        import didactic.api as dx

        norm = st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False)
        conf = st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False)
        secs = st.floats(min_value=0.0, max_value=3600.0, allow_nan=False, allow_infinity=False)
        boxes = st.builds(BoundingBoxDTO, x=norm, y=norm, width=norm, height=norm)
        detections = st.builds(
            DetectionDTO,
            label=st.text(min_size=0, max_size=8),
            bounding_box=boxes,
            confidence=conf,
            track_id=st.one_of(st.none(), st.text(min_size=1, max_size=6)),
        )
        frames = st.builds(
            FrameDetectionsDTO,
            frame_number=st.integers(min_value=0, max_value=10_000),
            timestamp=secs,
            detections=st.lists(detections, max_size=3),
        )
        responses = st.builds(
            DetectObjectsResponseDTO,
            id=st.text(min_size=1, max_size=8),
            video_id=st.text(min_size=1, max_size=8),
            query=st.text(min_size=0, max_size=16),
            frames=st.lists(frames, max_size=3),
            total_detections=st.integers(min_value=0, max_value=100),
            processing_time=st.floats(
                min_value=0.0, max_value=100.0, allow_nan=False, allow_infinity=False
            ),
            video_width=st.integers(min_value=1, max_value=4096),
            video_height=st.integers(min_value=1, max_value=4096),
        )
        dx.testing.check_lens_laws(LENS, responses, max_examples=50)
