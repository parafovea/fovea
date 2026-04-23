"""Tests for detection domain entities."""

from __future__ import annotations

import pytest

from src.domain.entities.detection import (
    Detection,
    DetectionResult,
    FrameDetections,
    TrackingFrameResult,
    TrackingMask,
    TrackingResult,
)
from src.domain.value_objects import ConfidenceScore, NormalizedBBox, Timestamp


def _make_detection(
    label: str = "cat", conf: float = 0.9, track_id: str | None = None
) -> Detection:
    return Detection(
        label=label,
        bounding_box=NormalizedBBox(x=0.1, y=0.1, width=0.2, height=0.2),
        confidence=ConfidenceScore(conf),
        track_id=track_id,
    )


class TestDetection:
    def test_construction(self) -> None:
        det = _make_detection("dog", 0.8)
        assert det.label == "dog"
        assert det.confidence.value == 0.8
        assert det.track_id is None
        assert det.attributes == {}

    def test_default_attributes_independent(self) -> None:
        a = _make_detection()
        b = _make_detection()
        a.attributes["extra"] = 1
        assert "extra" not in b.attributes

    def test_to_dict(self) -> None:
        det = _make_detection("dog", 0.8, track_id="t1")
        d = det.to_dict()
        assert d["label"] == "dog"
        assert d["confidence"] == 0.8
        assert d["track_id"] == "t1"
        assert d["bounding_box"] == {"x": 0.1, "y": 0.1, "width": 0.2, "height": 0.2}

    def test_from_dict_roundtrip(self) -> None:
        original = _make_detection("dog", 0.8, track_id="t1")
        restored = Detection.from_dict(original.to_dict())
        assert restored.label == original.label
        assert restored.confidence.value == original.confidence.value
        assert restored.track_id == original.track_id

    def test_from_dict_defaults(self) -> None:
        det = Detection.from_dict(
            {
                "label": "x",
                "bounding_box": {"x": 0.0, "y": 0.0, "width": 0.5, "height": 0.5},
                "confidence": 0.6,
            }
        )
        assert det.track_id is None
        assert det.attributes == {}


class TestFrameDetections:
    def test_count(self) -> None:
        f = FrameDetections(frame_number=1, timestamp=Timestamp(0.0), detections=[])
        assert f.count == 0

        f2 = FrameDetections(
            frame_number=1,
            timestamp=Timestamp(0.0),
            detections=[_make_detection(), _make_detection()],
        )
        assert f2.count == 2

    def test_filter_by_label(self) -> None:
        f = FrameDetections(
            frame_number=0,
            timestamp=Timestamp(0.0),
            detections=[_make_detection("cat"), _make_detection("dog"), _make_detection("cat")],
        )
        assert len(f.filter_by_label("cat")) == 2
        assert len(f.filter_by_label("dog")) == 1
        assert f.filter_by_label("missing") == []

    def test_filter_by_confidence(self) -> None:
        f = FrameDetections(
            frame_number=0,
            timestamp=Timestamp(0.0),
            detections=[
                _make_detection("a", 0.3),
                _make_detection("b", 0.7),
                _make_detection("c", 0.95),
            ],
        )
        assert len(f.filter_by_confidence(0.5)) == 2
        assert len(f.filter_by_confidence(0.0)) == 3
        assert len(f.filter_by_confidence(0.99)) == 0

    def test_to_dict(self) -> None:
        f = FrameDetections(
            frame_number=5,
            timestamp=Timestamp(1.5),
            detections=[_make_detection("x", 0.9)],
        )
        d = f.to_dict()
        assert d["frame_number"] == 5
        assert d["timestamp"] == 1.5
        assert len(d["detections"]) == 1


class TestDetectionResult:
    def test_totals(self) -> None:
        frames = [
            FrameDetections(
                frame_number=0,
                timestamp=Timestamp(0.0),
                detections=[_make_detection("a"), _make_detection("b")],
            ),
            FrameDetections(
                frame_number=1,
                timestamp=Timestamp(0.5),
                detections=[_make_detection("a")],
            ),
        ]
        r = DetectionResult(
            result_id="r1",
            video_id="v1",
            query="cats",
            frames=frames,
            processing_time=1.0,
        )
        assert r.total_detections == 3
        assert r.frame_count == 2

    def test_get_unique_labels(self) -> None:
        frames = [
            FrameDetections(
                frame_number=0,
                timestamp=Timestamp(0.0),
                detections=[_make_detection("cat"), _make_detection("dog")],
            ),
            FrameDetections(
                frame_number=1,
                timestamp=Timestamp(1.0),
                detections=[_make_detection("cat"), _make_detection("bird")],
            ),
        ]
        r = DetectionResult(
            result_id="r",
            video_id="v",
            query="",
            frames=frames,
            processing_time=0.0,
        )
        assert r.get_unique_labels() == {"cat", "dog", "bird"}

    def test_get_tracks(self) -> None:
        frames = [
            FrameDetections(
                frame_number=0,
                timestamp=Timestamp(0.0),
                detections=[_make_detection("a", track_id="t1"), _make_detection("b")],
            ),
            FrameDetections(
                frame_number=1,
                timestamp=Timestamp(1.0),
                detections=[
                    _make_detection("a", track_id="t1"),
                    _make_detection("c", track_id="t2"),
                ],
            ),
        ]
        r = DetectionResult(
            result_id="r",
            video_id="v",
            query="",
            frames=frames,
            processing_time=0.0,
        )
        tracks = r.get_tracks()
        assert set(tracks.keys()) == {"t1", "t2"}
        assert len(tracks["t1"]) == 2
        assert len(tracks["t2"]) == 1

    def test_empty_result(self) -> None:
        r = DetectionResult(
            result_id="r",
            video_id="v",
            query="",
            frames=[],
            processing_time=0.0,
        )
        assert r.total_detections == 0
        assert r.frame_count == 0
        assert r.get_unique_labels() == set()
        assert r.get_tracks() == {}


class TestTrackingMask:
    def test_to_dict(self) -> None:
        m = TrackingMask(
            object_id=1,
            mask_rle={"size": [10, 10], "counts": "abc"},
            confidence=ConfidenceScore(0.9),
            is_occluded=True,
        )
        d = m.to_dict()
        assert d["object_id"] == 1
        assert d["confidence"] == 0.9
        assert d["is_occluded"] is True
        assert d["mask_rle"]["counts"] == "abc"

    def test_default_not_occluded(self) -> None:
        m = TrackingMask(object_id=1, mask_rle={}, confidence=ConfidenceScore(0.5))
        assert m.is_occluded is False


class TestTrackingFrameResult:
    def test_object_count(self) -> None:
        f = TrackingFrameResult(
            frame_number=0,
            timestamp=Timestamp(0.0),
            masks=[
                TrackingMask(object_id=1, mask_rle={}, confidence=ConfidenceScore(0.5)),
                TrackingMask(object_id=2, mask_rle={}, confidence=ConfidenceScore(0.8)),
            ],
            processing_time=0.1,
        )
        assert f.object_count == 2

    def test_get_mask_found(self) -> None:
        mask = TrackingMask(object_id=2, mask_rle={}, confidence=ConfidenceScore(0.8))
        f = TrackingFrameResult(
            frame_number=0,
            timestamp=Timestamp(0.0),
            masks=[mask],
            processing_time=0.0,
        )
        assert f.get_mask(2) is mask

    def test_get_mask_not_found(self) -> None:
        f = TrackingFrameResult(
            frame_number=0,
            timestamp=Timestamp(0.0),
            masks=[],
            processing_time=0.0,
        )
        assert f.get_mask(99) is None


class TestTrackingResult:
    def test_total_frames(self) -> None:
        r = TrackingResult(
            result_id="r",
            video_id="v",
            frames=[],
            video_width=100,
            video_height=100,
            processing_time=0.0,
        )
        assert r.total_frames == 0

    def test_fps_nonzero(self) -> None:
        frames = [
            TrackingFrameResult(
                frame_number=i,
                timestamp=Timestamp(float(i)),
                masks=[],
                processing_time=0.0,
            )
            for i in range(10)
        ]
        r = TrackingResult(
            result_id="r",
            video_id="v",
            frames=frames,
            video_width=100,
            video_height=100,
            processing_time=2.0,
        )
        assert r.fps == pytest.approx(5.0)

    def test_fps_zero_processing_time(self) -> None:
        r = TrackingResult(
            result_id="r",
            video_id="v",
            frames=[],
            video_width=100,
            video_height=100,
            processing_time=0.0,
        )
        assert r.fps == 0.0

    def test_get_object_trajectory(self) -> None:
        mask_a1 = TrackingMask(object_id=1, mask_rle={"k": "a"}, confidence=ConfidenceScore(0.9))
        mask_a2 = TrackingMask(object_id=1, mask_rle={"k": "b"}, confidence=ConfidenceScore(0.8))
        mask_b = TrackingMask(object_id=2, mask_rle={}, confidence=ConfidenceScore(0.5))
        frames = [
            TrackingFrameResult(
                frame_number=0,
                timestamp=Timestamp(0.0),
                masks=[mask_a1, mask_b],
                processing_time=0.0,
            ),
            TrackingFrameResult(
                frame_number=1, timestamp=Timestamp(1.0), masks=[mask_a2], processing_time=0.0
            ),
        ]
        r = TrackingResult(
            result_id="r",
            video_id="v",
            frames=frames,
            video_width=100,
            video_height=100,
            processing_time=1.0,
        )
        trajectory = r.get_object_trajectory(1)
        assert [frame_num for frame_num, _ in trajectory] == [0, 1]
        assert r.get_object_trajectory(99) == []
