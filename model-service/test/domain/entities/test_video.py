"""Tests for video domain entities."""

from __future__ import annotations

import numpy as np
import pytest

from src.domain.entities.video import Frame, VideoInfo, VideoSegment
from src.domain.value_objects import TimeRange, Timestamp


def _img(h: int = 10, w: int = 20, c: int = 3) -> np.ndarray:
    return np.zeros((h, w, c), dtype=np.uint8)


class TestVideoInfo:
    def test_aspect_ratio(self) -> None:
        info = VideoInfo(
            video_id="v",
            path="/p",
            width=1920,
            height=1080,
            fps=30.0,
            total_frames=900,
            duration=30.0,
        )
        assert info.aspect_ratio == pytest.approx(1920 / 1080)

    def test_aspect_ratio_zero_height(self) -> None:
        info = VideoInfo(
            video_id="v", path="/p", width=100, height=0, fps=30.0, total_frames=0, duration=0.0
        )
        assert info.aspect_ratio == 0.0

    def test_resolution(self) -> None:
        info = VideoInfo(
            video_id="v",
            path="/p",
            width=640,
            height=480,
            fps=30.0,
            total_frames=0,
            duration=0.0,
        )
        assert info.resolution == (640, 480)

    def test_frame_timestamp_roundtrip(self) -> None:
        info = VideoInfo(
            video_id="v",
            path="/p",
            width=1,
            height=1,
            fps=30.0,
            total_frames=100,
            duration=3.3,
        )
        ts = info.frame_to_timestamp(60)
        assert ts.seconds == pytest.approx(2.0)
        assert info.timestamp_to_frame(ts) == 60


class TestFrame:
    def test_properties(self) -> None:
        f = Frame(frame_number=0, timestamp=Timestamp(0.0), image=_img(10, 20, 3))
        assert f.height == 10
        assert f.width == 20
        assert f.channels == 3
        assert f.shape == (10, 20, 3)

    def test_grayscale_channels(self) -> None:
        img = np.zeros((10, 20), dtype=np.uint8)
        f = Frame(frame_number=0, timestamp=Timestamp(0.0), image=img)
        assert f.channels == 1

    def test_default_video_id(self) -> None:
        f = Frame(frame_number=0, timestamp=Timestamp(0.0), image=_img())
        assert f.video_id is None


class TestVideoSegment:
    def test_properties(self) -> None:
        tr = TimeRange.from_seconds(1.0, 5.0)
        seg = VideoSegment(video_id="v", time_range=tr)
        assert seg.duration == 4.0
        assert seg.frame_count == 0
        assert seg.start_timestamp.seconds == 1.0
        assert seg.end_timestamp.seconds == 5.0

    def test_contains_frame_inside(self) -> None:
        seg = VideoSegment(video_id="v", time_range=TimeRange.from_seconds(1.0, 5.0))
        f = Frame(frame_number=1, timestamp=Timestamp(3.0), image=_img())
        assert seg.contains_frame(f)

    def test_contains_frame_outside(self) -> None:
        seg = VideoSegment(video_id="v", time_range=TimeRange.from_seconds(1.0, 5.0))
        f = Frame(frame_number=1, timestamp=Timestamp(10.0), image=_img())
        assert not seg.contains_frame(f)

    def test_add_frame_inside_sorted(self) -> None:
        seg = VideoSegment(video_id="v", time_range=TimeRange.from_seconds(0.0, 10.0))
        f2 = Frame(frame_number=2, timestamp=Timestamp(2.0), image=_img())
        f1 = Frame(frame_number=1, timestamp=Timestamp(1.0), image=_img())
        seg.add_frame(f2)
        seg.add_frame(f1)
        assert [f.frame_number for f in seg.frames] == [1, 2]

    def test_add_frame_outside_raises(self) -> None:
        seg = VideoSegment(video_id="v", time_range=TimeRange.from_seconds(0.0, 1.0))
        f = Frame(frame_number=0, timestamp=Timestamp(5.0), image=_img())
        with pytest.raises(ValueError, match="outside segment"):
            seg.add_frame(f)

    def test_default_metadata_and_label(self) -> None:
        seg = VideoSegment(video_id="v", time_range=TimeRange.from_seconds(0.0, 1.0))
        assert seg.label is None
        assert seg.metadata == {}
