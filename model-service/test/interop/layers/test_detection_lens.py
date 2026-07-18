"""Round-trip law tests for the detection response <-> layers fragment lens.

The lens makes the canonical layers records authoritative: the frame number rides
on a keyframe feature, the exact normalized box on ``annotation.spatial``, the
confidence on the integer 0-1000 scale, the track id on a feature, the query on
``reproducibility.command``, and the response id on the layer record key. There is
no verbatim complement, the frame-processing time is dropped as telemetry, and an
empty frame carries no annotation, so the laws hold over quantized responses whose
frames each carry at least one detection.
"""

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
    """A deterministic, multi-frame detection response (no now()/random).

    Confidences sit on the integer 0..1000 grid and every frame carries at least
    one detection, so the trace-free, quantized response round-trips.
    """
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
                        confidence=0.912,
                        track_id="track-1",
                    ),
                ],
            ),
        ],
        total_detections=3,
        processing_time=0.0,
        video_width=640,
        video_height=480,
    )


def _layer(view: object) -> annotation.AnnotationLayer:
    record = next(record for record in view.records if record.nsid == ANNOTATION_LAYER_NSID)
    return annotation.AnnotationLayer.model_validate_json(record.value_json)


class TestGetPut:
    """Every reconstructed field is read back from the canonical records."""

    def test_example_roundtrip(self) -> None:
        dto = _example_dto()
        view, complement = LENS.forward(dto)
        assert LENS.backward(view, complement) == dto

    def test_putget_roundtrip(self) -> None:
        dto = _example_dto()
        view, complement = LENS.forward(dto)
        view2, complement2 = LENS.forward(LENS.backward(view, complement))
        assert (view2, complement2) == (view, complement)

    def test_complement_is_empty(self) -> None:
        _view, complement = LENS.forward(_example_dto())
        assert complement is None

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

    def test_exact_normalized_box_survives(self) -> None:
        dto = _example_dto()
        view, complement = LENS.forward(dto)
        back = LENS.backward(view, complement)
        assert back.frames[0].detections[0].bounding_box.width == 0.3
        assert back.frames[0].detections[0].confidence == 0.875
        assert back.frames[1].timestamp == 2.04


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

    def test_media_carries_frame_rate(self) -> None:
        dto = _example_dto()
        view, _complement = LENS.forward(dto)
        media_record = next(r for r in view.records if r.nsid == MEDIA_NSID)
        med = media.Media.model_validate_json(media_record.value_json)
        assert med.video is not None
        assert (med.video.width, med.video.height) == (640, 480)
        # fps derived from frame 12 at 2.04s: 12 / 2.04 == 5.88..., scaled by 100.
        assert med.video.frameRate == round(12 / 2.04 * 100)

    def test_layer_is_span_entity_mention_and_keyed_by_id(self) -> None:
        dto = _example_dto()
        view, _complement = LENS.forward(dto)
        record = next(r for r in view.records if r.nsid == ANNOTATION_LAYER_NSID)
        assert record.local_id == "detect-0"
        layer = annotation.AnnotationLayer.model_validate_json(record.value_json)
        assert layer.kind == "span"
        assert layer.subkind == "entity-mention"
        assert layer.reproducibility is not None
        assert layer.reproducibility.command == "find every cat and dog"
        # one annotation per detection, across all frames (3 total)
        assert len(layer.annotations) == 3

    def test_box_rides_in_spatial_as_percentage(self) -> None:
        dto = _example_dto()
        view, _complement = LENS.forward(dto)
        cat = _layer(view).annotations[0]
        assert cat.spatial is not None
        assert cat.spatial.value.crs == "percentage"

    def test_scale_rules_hold(self) -> None:
        dto = _example_dto()
        view, _complement = LENS.forward(dto)
        for ann in _layer(view).annotations:
            assert ann.confidence is not None
            assert 0 <= ann.confidence <= 1000
            sta = ann.anchor.spatioTemporalAnchor
            assert sta is not None
            assert sta.interpolation == "step"
            assert isinstance(sta.temporalSpan.start, int)
            keyframe = sta.keyframes[0]
            assert isinstance(keyframe.timeMs, int)
            assert keyframe.bbox.width >= 1
            assert keyframe.bbox.height >= 1

    def test_confidence_and_time_values(self) -> None:
        dto = _example_dto()
        view, _complement = LENS.forward(dto)
        first = _layer(view).annotations[0]
        assert first.label == "cat"
        assert first.confidence == 875  # round(0.875 * 1000)
        keyframe = first.anchor.spatioTemporalAnchor.keyframes[0]
        assert keyframe.timeMs == 500  # round(0.5 * 1000)

    def test_tiny_box_clamps_to_one_pixel(self) -> None:
        dto = _example_dto()
        view, _complement = LENS.forward(dto)
        dog = _layer(view).annotations[1]
        keyframe = dog.anchor.spatioTemporalAnchor.keyframes[0]
        assert keyframe.bbox.width == 1
        assert keyframe.bbox.height == 1

    def test_track_id_rides_as_feature(self) -> None:
        dto = _example_dto()
        view, _complement = LENS.forward(dto)
        layer = _layer(view)
        cat = layer.annotations[0]
        assert cat.features is not None
        assert "track_id" in {e.key for e in cat.features.entries}
        # a detection with no track id carries no annotation features
        dog = layer.annotations[1]
        assert dog.features is None


class TestLensLaws:
    """Property-based GetPut over a small generated space of responses."""

    def test_check_lens_laws(self) -> None:
        hypothesis = pytest.importorskip("hypothesis")
        st = hypothesis.strategies
        import didactic.api as dx

        norm = st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False)
        # Confidence sits on the quantized 0..1000 grid so scaling is exact.
        conf = st.integers(min_value=0, max_value=1000).map(lambda i: i / 1000.0)
        # Timestamps sit on the integer-millisecond grid so time round-trips.
        secs = st.integers(min_value=0, max_value=3_600_000).map(lambda ms: ms / 1000.0)
        boxes = st.builds(BoundingBoxDTO, x=norm, y=norm, width=norm, height=norm)
        detections = st.builds(
            DetectionDTO,
            label=st.text(min_size=0, max_size=8),
            bounding_box=boxes,
            confidence=conf,
            track_id=st.one_of(st.none(), st.text(min_size=1, max_size=6)),
        )

        @st.composite
        def responses(draw: st.DrawFn) -> DetectObjectsResponseDTO:
            # Frame numbers are unique so no two frames merge on reconstruction.
            frame_numbers = draw(
                st.lists(st.integers(min_value=0, max_value=10_000), max_size=3, unique=True)
            )
            frames: list[FrameDetectionsDTO] = []
            total = 0
            for frame_number in frame_numbers:
                # Each frame carries at least one detection (an empty frame drops).
                dets = draw(st.lists(detections, min_size=1, max_size=3))
                total += len(dets)
                frames.append(
                    FrameDetectionsDTO(
                        frame_number=frame_number, timestamp=draw(secs), detections=dets
                    )
                )
            return DetectObjectsResponseDTO(
                id=draw(st.text(min_size=1, max_size=8)),
                video_id=draw(st.text(min_size=1, max_size=8)),
                query=draw(st.text(min_size=0, max_size=16)),
                frames=frames,
                total_detections=total,
                processing_time=0.0,
                video_width=draw(st.integers(min_value=1, max_value=4096)),
                video_height=draw(st.integers(min_value=1, max_value=4096)),
            )

        dx.testing.check_lens_laws(LENS, responses(), max_examples=50)
