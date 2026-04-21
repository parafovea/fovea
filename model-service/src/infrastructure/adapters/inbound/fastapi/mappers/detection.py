"""Mappers between detection schemas and detection DTOs."""

from __future__ import annotations

from src.application.dto.detection import (
    DetectObjectsRequestDTO,
    DetectObjectsResponseDTO,
)
from src.infrastructure.adapters.inbound.fastapi.schemas.detection import (
    BoundingBox,
    Detection,
    DetectionRequest,
    DetectionResponse,
    FrameDetections,
)


def detection_request_schema_to_dto(
    schema: DetectionRequest, video_path: str
) -> DetectObjectsRequestDTO:
    """Convert a :class:`DetectionRequest` schema and resolved path into a DTO."""
    return DetectObjectsRequestDTO(
        video_id=schema.video_id,
        query=schema.query,
        video_path=video_path,
        frame_numbers=list(schema.frame_numbers),
        confidence_threshold=float(schema.confidence_threshold),
        enable_tracking=schema.enable_tracking,
    )


def detection_response_dto_to_schema(
    dto: DetectObjectsResponseDTO,
) -> DetectionResponse:
    """Convert a :class:`DetectObjectsResponseDTO` into a schema."""
    frames: list[FrameDetections] = []
    for frame in dto.frames:
        detections: list[Detection] = []
        for det in frame.detections:
            detections.append(
                Detection(
                    label=det.label,
                    bounding_box=BoundingBox(
                        x=det.bounding_box.x,
                        y=det.bounding_box.y,
                        width=det.bounding_box.width,
                        height=det.bounding_box.height,
                    ),
                    confidence=det.confidence,
                    track_id=det.track_id,
                )
            )
        frames.append(
            FrameDetections(
                frame_number=frame.frame_number,
                timestamp=frame.timestamp,
                detections=detections,
            )
        )

    return DetectionResponse(
        id=dto.id,
        video_id=dto.video_id,
        query=dto.query,
        frames=frames,
        total_detections=dto.total_detections,
        processing_time=dto.processing_time,
    )
