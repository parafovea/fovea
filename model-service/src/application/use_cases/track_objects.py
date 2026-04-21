"""Use case for tracking objects across selected video frames.

Framework-neutral. Depends only on application DTOs and outbound ports.
The caller (an infrastructure adapter) extracts frames and decodes masks.
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import numpy as np  # noqa: TC002
from opentelemetry import trace

from src.application.dto.tracking import (
    TrackingFrameDTO,
    TrackingMaskDTO,
    TrackObjectsRequestDTO,
    TrackObjectsResponseDTO,
)

if TYPE_CHECKING:
    from numpy.typing import NDArray

    from src.application.ports.outbound.tracking_model import ITrackingModel

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)


class TrackingError(Exception):
    """Raised when object tracking fails."""


@dataclass
class TrackObjectsExecutionInput:
    """Input to :meth:`TrackObjectsUseCase.execute`.

    Wraps the request DTO with pre-extracted frames and decoded initial
    masks prepared by the infrastructure adapter.
    """

    request: TrackObjectsRequestDTO
    frames: list[NDArray[np.uint8]]
    frame_numbers: list[int]
    timestamps: list[float]
    initial_masks: list[NDArray[np.bool_]] = field(default_factory=list)
    video_width: int = 0
    video_height: int = 0


class TrackObjectsUseCase:
    """Use case for tracking objects in video frames via an ``ITrackingModel``."""

    def __init__(self, tracking_model: ITrackingModel) -> None:
        """Initialize with the tracking model port."""
        self._model = tracking_model

    async def execute(
        self, input: TrackObjectsExecutionInput
    ) -> TrackObjectsResponseDTO:
        """Run tracking across the provided frames.

        Parameters
        ----------
        input : TrackObjectsExecutionInput
            Request with pre-extracted frames and decoded initial masks.

        Returns
        -------
        TrackObjectsResponseDTO
            Aggregated tracking result.

        Raises
        ------
        TrackingError
            If tracking fails or inputs are invalid.
        """
        request = input.request

        with tracer.start_as_current_span("track_objects_use_case") as span:
            span.set_attribute("video_id", request.video_id)
            span.set_attribute("num_objects", len(request.object_ids))

            if len(input.initial_masks) != len(request.object_ids):
                raise TrackingError(
                    f"Number of initial_masks ({len(input.initial_masks)}) "
                    f"must match object_ids length ({len(request.object_ids)})"
                )

            if not input.frames:
                raise TrackingError("No valid frames to process")

            start_time = time.time()

            self._model.load()
            try:
                self._model.initialize(
                    frame=input.frames[0],
                    masks=input.initial_masks,
                    object_ids=request.object_ids,
                )
                per_frame_masks = self._model.track_batch(input.frames)
            finally:
                self._model.unload()

            processing_time = time.time() - start_time
            tracking_frames: list[TrackingFrameDTO] = []

            for idx, mask_map in enumerate(per_frame_masks):
                frame_num = (
                    input.frame_numbers[idx]
                    if idx < len(input.frame_numbers)
                    else idx
                )
                timestamp = (
                    input.timestamps[idx] if idx < len(input.timestamps) else 0.0
                )

                masks_out: list[TrackingMaskDTO] = []
                for obj_id, tmask in mask_map.items():
                    masks_out.append(
                        TrackingMaskDTO(
                            object_id=obj_id,
                            mask_rle=tmask.mask_rle,
                            confidence=float(tmask.confidence.value),
                            is_occluded=tmask.is_occluded,
                        )
                    )

                tracking_frames.append(
                    TrackingFrameDTO(
                        frame_number=frame_num,
                        timestamp=timestamp,
                        masks=masks_out,
                        processing_time=0.0,
                    )
                )

            total_processed = len(tracking_frames)
            fps_processing = (
                total_processed / processing_time if processing_time > 0 else 0.0
            )

            span.set_attribute("total_frames", total_processed)
            span.set_attribute("processing_time", processing_time)
            span.set_attribute("fps", fps_processing)

            return TrackObjectsResponseDTO(
                id=str(uuid.uuid4()),
                video_id=request.video_id,
                frames=tracking_frames,
                video_width=input.video_width,
                video_height=input.video_height,
                total_frames=total_processed,
                processing_time=processing_time,
                fps=fps_processing,
            )
