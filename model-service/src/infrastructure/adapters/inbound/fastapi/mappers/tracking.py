"""Mappers between tracking schemas and tracking DTOs."""

from __future__ import annotations

from src.application.dto.tracking import (
    TrackObjectsRequestDTO,
    TrackObjectsResponseDTO,
)
from src.infrastructure.adapters.inbound.fastapi.schemas.tracking import (
    TrackingFrameResult,
    TrackingMaskData,
    TrackingRequest,
    TrackingResponse,
)


def tracking_request_schema_to_dto(
    schema: TrackingRequest, video_path: str
) -> TrackObjectsRequestDTO:
    """Convert a :class:`TrackingRequest` schema and resolved path into a DTO."""
    return TrackObjectsRequestDTO(
        video_id=schema.video_id,
        video_path=video_path,
        initial_masks_b64=list(schema.initial_masks),
        object_ids=list(schema.object_ids),
        frame_numbers=list(schema.frame_numbers),
    )


def tracking_response_dto_to_schema(
    dto: TrackObjectsResponseDTO,
) -> TrackingResponse:
    """Convert a :class:`TrackObjectsResponseDTO` into a schema."""
    frames: list[TrackingFrameResult] = []
    for frame in dto.frames:
        masks = [
            TrackingMaskData(
                object_id=m.object_id,
                mask_rle=m.mask_rle,
                confidence=m.confidence,
                is_occluded=m.is_occluded,
            )
            for m in frame.masks
        ]
        frames.append(
            TrackingFrameResult(
                frame_number=frame.frame_number,
                timestamp=frame.timestamp,
                masks=masks,
                processing_time=frame.processing_time,
            )
        )

    return TrackingResponse(
        id=dto.id,
        video_id=dto.video_id,
        frames=frames,
        video_width=dto.video_width,
        video_height=dto.video_height,
        total_frames=dto.total_frames,
        processing_time=dto.processing_time,
        fps=dto.fps,
    )
