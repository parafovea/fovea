"""Use case for detecting objects across selected video frames.

Framework-neutral. Depends only on application DTOs and outbound ports.
The caller (an infrastructure adapter) is responsible for reading frames
from the video file and passing them through the request DTO.
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import numpy as np  # noqa: TC002
from opentelemetry import trace

from src.application.dto.detection import (
    BoundingBoxDTO,
    DetectionDTO,
    DetectObjectsRequestDTO,
    DetectObjectsResponseDTO,
    FrameDetectionsDTO,
)

if TYPE_CHECKING:
    from numpy.typing import NDArray

    from src.application.ports.outbound.detection_model import IDetectionModel

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)


class DetectionError(Exception):
    """Raised when object detection fails."""


@dataclass
class DetectObjectsFrameInput:
    """A pre-extracted frame paired with its video-level metadata."""

    frame_number: int
    timestamp: float
    image: NDArray[np.uint8]


@dataclass
class DetectObjectsExecutionInput:
    """Input to :meth:`DetectObjectsUseCase.execute`.

    Wraps the original request with the pre-extracted frames that the
    infrastructure adapter is responsible for providing.
    """

    request: DetectObjectsRequestDTO
    frames: list[DetectObjectsFrameInput] = field(default_factory=list)


class DetectObjectsUseCase:
    """Use case for detecting objects in video frames via an ``IDetectionModel``."""

    def __init__(self, detection_model: IDetectionModel) -> None:
        """Initialize with the detection model port."""
        self._model = detection_model

    async def execute(
        self, input: DetectObjectsExecutionInput
    ) -> DetectObjectsResponseDTO:
        """Run detection across the provided frames.

        Parameters
        ----------
        input : DetectObjectsExecutionInput
            Request DTO and extracted frames to process.

        Returns
        -------
        DetectObjectsResponseDTO
            Aggregated detection result.
        """
        request = input.request
        frames = input.frames

        with tracer.start_as_current_span("detect_objects_use_case") as span:
            span.set_attribute("video_id", request.video_id)
            span.set_attribute("query", request.query)
            span.set_attribute("confidence_threshold", request.confidence_threshold)

            frame_results: list[FrameDetectionsDTO] = []
            total_detections = 0
            start_time = time.time()

            if frames:
                self._model.load()
                try:
                    for frame_input in frames:
                        detections = self._model.detect(
                            image=frame_input.image,
                            query=request.query,
                            confidence_threshold=request.confidence_threshold,
                        )

                        detection_dtos: list[DetectionDTO] = []
                        for det in detections:
                            bbox = det.bounding_box
                            detection_dtos.append(
                                DetectionDTO(
                                    label=det.label,
                                    bounding_box=BoundingBoxDTO(
                                        x=bbox.x,
                                        y=bbox.y,
                                        width=bbox.width,
                                        height=bbox.height,
                                    ),
                                    confidence=float(det.confidence.value),
                                    track_id=det.track_id,
                                )
                            )

                        frame_results.append(
                            FrameDetectionsDTO(
                                frame_number=frame_input.frame_number,
                                timestamp=frame_input.timestamp,
                                detections=detection_dtos,
                            )
                        )
                        total_detections += len(detection_dtos)
                finally:
                    self._model.unload()

            processing_time = time.time() - start_time

            span.set_attribute("total_detections", total_detections)
            span.set_attribute("frames_processed", len(frame_results))
            span.set_attribute("processing_time", processing_time)

            return DetectObjectsResponseDTO(
                id=str(uuid.uuid4()),
                video_id=request.video_id,
                query=request.query,
                frames=frame_results,
                total_detections=total_detections,
                processing_time=processing_time,
            )
