"""Use case for detecting objects across selected video frames.

Framework-neutral. Depends only on application DTOs and outbound ports.
The caller (an infrastructure adapter) is responsible for reading frames
from the video file and passing them through the request DTO.
"""

from __future__ import annotations

import asyncio
import logging
import math
import time
import uuid
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import numpy as np
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
    from src.application.ports.outbound.tracking_model import ITrackingModel

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
    infrastructure adapter is responsible for providing, plus the source frame
    dimensions in pixels (needed to project normalized boxes to layers records).
    """

    request: DetectObjectsRequestDTO
    video_width: int = 0
    video_height: int = 0
    frames: list[DetectObjectsFrameInput] = field(default_factory=list)


class DetectObjectsUseCase:
    """Use case for detecting objects in video frames via an ``IDetectionModel``."""

    def __init__(
        self, detection_model: IDetectionModel, tracking_model: ITrackingModel | None = None
    ) -> None:
        """Initialize with detection and optional tracking model ports."""
        self._model = detection_model
        self._tracker = tracking_model

    async def execute(self, input: DetectObjectsExecutionInput) -> DetectObjectsResponseDTO:
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
        return await asyncio.to_thread(self._execute, input)

    def _execute(self, input: DetectObjectsExecutionInput) -> DetectObjectsResponseDTO:
        """Run blocking model operations outside the HTTP event loop."""
        request = input.request
        frames = input.frames

        with tracer.start_as_current_span("detect_objects_use_case") as span:
            span.set_attribute("video_id", request.video_id)
            span.set_attribute("query", request.query)
            span.set_attribute("confidence_threshold", request.confidence_threshold)

            frame_results: list[FrameDetectionsDTO] = []
            total_detections = 0
            start_time = time.time()

            if frames and request.enable_tracking:
                frame_results = self._detect_and_track(input)
                total_detections = sum(len(frame.detections) for frame in frame_results)
            elif frames:
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
                video_width=input.video_width,
                video_height=input.video_height,
            )

    def _detect_and_track(self, input: DetectObjectsExecutionInput) -> list[FrameDetectionsDTO]:
        """Seed the configured tracker with detections from the first selected frame."""
        if self._tracker is None:
            raise DetectionError("Tracking was requested but no tracking model is configured")
        first = input.frames[0]
        height, width = first.image.shape[:2]
        self._model.load()
        try:
            detections = self._model.detect(
                image=first.image,
                query=input.request.query,
                confidence_threshold=input.request.confidence_threshold,
            )
        finally:
            self._model.unload()

        masks: list[NDArray[np.bool_]] = []
        seeds: dict[int, DetectionDTO] = {}
        for detection in detections:
            bbox = detection.bounding_box
            left, top = int(bbox.x * width), int(bbox.y * height)
            right = min(width, math.ceil((bbox.x + bbox.width) * width))
            bottom = min(height, math.ceil((bbox.y + bbox.height) * height))
            if right <= left or bottom <= top:
                continue
            mask = np.zeros((height, width), dtype=np.bool_)
            mask[top:bottom, left:right] = True
            object_id = len(seeds) + 1
            masks.append(mask)
            seeds[object_id] = DetectionDTO(
                label=detection.label,
                bounding_box=BoundingBoxDTO(bbox.x, bbox.y, bbox.width, bbox.height),
                confidence=float(detection.confidence.value),
                track_id=str(object_id),
            )

        results = [
            FrameDetectionsDTO(frame.frame_number, frame.timestamp) for frame in input.frames
        ]
        results[0].detections = list(seeds.values())
        if not seeds or len(input.frames) == 1:
            return results

        self._tracker.load()
        try:
            self._tracker.initialize(first.image, masks, list(seeds))
            tracked_frames = self._tracker.track_batch([frame.image for frame in input.frames])
            if len(tracked_frames) != len(input.frames):
                raise DetectionError("Tracker returned a different number of frames than requested")
            # The detector supplies the seed frame; subsequent boxes come from tracked masks.
            for result, tracked in zip(results[1:], tracked_frames[1:], strict=True):
                for object_id, tracked_mask in tracked.items():
                    tracked_bbox = tracked_mask.bounding_box
                    if object_id not in seeds or tracked_bbox is None or tracked_mask.is_occluded:
                        continue
                    result.detections.append(
                        DetectionDTO(
                            label=seeds[object_id].label,
                            bounding_box=BoundingBoxDTO(
                                tracked_bbox.x,
                                tracked_bbox.y,
                                tracked_bbox.width,
                                tracked_bbox.height,
                            ),
                            confidence=float(tracked_mask.confidence.value),
                            track_id=str(object_id),
                        )
                    )
        finally:
            self._tracker.unload()
        return results
