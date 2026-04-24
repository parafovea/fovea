"""Fake IVideoProcessor for use case testing."""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np

from src.application.ports.outbound.video_processor import IVideoProcessor
from src.domain.entities import Frame, VideoInfo
from src.domain.value_objects import Timestamp

if TYPE_CHECKING:
    from collections.abc import Iterator

    from src.domain.value_objects import TimeRange


class FakeVideoProcessor(IVideoProcessor):
    """In-memory video processor with canned frames and metadata."""

    def __init__(
        self,
        *,
        info: VideoInfo | None = None,
        frames: list[Frame] | None = None,
    ) -> None:
        self._info = info or VideoInfo(
            video_id="v",
            path="/fake.mp4",
            width=320,
            height=240,
            fps=30.0,
            total_frames=90,
            duration=3.0,
        )
        self._frames = frames if frames is not None else self._default_frames()

    @staticmethod
    def _default_frames() -> list[Frame]:
        return [
            Frame(
                frame_number=i,
                timestamp=Timestamp(i / 30.0),
                image=np.zeros((240, 320, 3), dtype=np.uint8),
                video_id="v",
            )
            for i in range(3)
        ]

    def get_video_info(self, video_path: str) -> VideoInfo:
        return self._info

    def extract_frames(
        self,
        video_path: str,
        frame_indices: list[int] | None = None,
        sample_rate: int = 1,
        max_frames: int = 30,
    ) -> list[Frame]:
        if frame_indices is None:
            return list(self._frames[:max_frames])
        index_set = set(frame_indices)
        return [f for f in self._frames if f.frame_number in index_set]

    def iterate_frames(
        self,
        video_path: str,
        start_frame: int = 0,
        end_frame: int | None = None,
        step: int = 1,
    ) -> Iterator[Frame]:
        end = end_frame if end_frame is not None else len(self._frames) - 1
        for f in self._frames:
            if start_frame <= f.frame_number <= end and (f.frame_number - start_frame) % step == 0:
                yield f

    def extract_audio(
        self,
        video_path: str,
        output_path: str,
        sample_rate: int = 16000,
    ) -> str:
        return output_path

    def generate_thumbnail(
        self,
        video_path: str,
        output_path: str,
        timestamp: float = 1.0,
        width: int | None = None,
        height: int | None = None,
    ) -> str:
        return output_path

    def extract_segment(
        self,
        video_path: str,
        output_path: str,
        time_range: TimeRange,
    ) -> str:
        return output_path
