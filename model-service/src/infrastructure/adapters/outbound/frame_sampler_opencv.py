"""OpenCV-backed implementation of :class:`IFrameSampler`."""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np

from src.application.ports.outbound.frame_sampler import IFrameSampler, VideoMetadataDTO
from src.infrastructure.observability.telemetry import record_inference

if TYPE_CHECKING:
    from numpy.typing import NDArray
from src.infrastructure.adapters.outbound.video.processor import (
    extract_frames_uniform,
    get_video_info,
)


class OpenCVFrameSampler(IFrameSampler):
    """Frame sampler backed by the OpenCV video processor helpers."""

    def get_video_metadata(self, video_path: str) -> VideoMetadataDTO:
        """Read minimal video metadata."""
        with record_inference(task="video_metadata", model_id="opencv"):
            info = get_video_info(video_path)
        return VideoMetadataDTO(
            frame_count=int(info.frame_count),
            fps=float(info.fps),
            duration=float(info.duration),
        )

    def extract_frames_uniform(
        self,
        video_path: str,
        num_frames: int,
        *,
        max_dimension: int = 1024,
    ) -> list[tuple[int, NDArray[np.uint8]]]:
        """Extract uniformly sampled frames."""
        with record_inference(task="frame_sample", model_id="opencv"):
            frames = extract_frames_uniform(
                video_path, num_frames=num_frames, max_dimension=max_dimension
            )
        result: list[tuple[int, NDArray[np.uint8]]] = []
        for idx, arr in frames:
            result.append((int(idx), arr.astype(np.uint8)))
        return result
