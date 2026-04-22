"""Fake IFrameSampler for use case testing."""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np

from src.application.ports.outbound.frame_sampler import IFrameSampler, VideoMetadataDTO

if TYPE_CHECKING:
    from numpy.typing import NDArray


class FakeFrameSampler(IFrameSampler):
    """In-memory frame sampler returning canned frames and metadata."""

    def __init__(
        self,
        *,
        metadata: VideoMetadataDTO | None = None,
        frames: list[tuple[int, NDArray[np.uint8]]] | None = None,
    ) -> None:
        self._metadata = metadata or VideoMetadataDTO(frame_count=90, fps=30.0, duration=3.0)
        self._frames = frames
        self.metadata_calls: list[str] = []
        self.extract_calls: list[tuple[str, int]] = []

    def get_video_metadata(self, video_path: str) -> VideoMetadataDTO:
        self.metadata_calls.append(video_path)
        return self._metadata

    def extract_frames_uniform(
        self,
        video_path: str,
        num_frames: int,
        *,
        max_dimension: int = 1024,
    ) -> list[tuple[int, NDArray[np.uint8]]]:
        self.extract_calls.append((video_path, num_frames))
        if self._frames is not None:
            return list(self._frames[:num_frames])
        return [
            (i, np.zeros((32, 32, 3), dtype=np.uint8)) for i in range(num_frames)
        ]
