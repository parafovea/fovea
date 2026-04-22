"""Video tracking route.

Thin FastAPI wrapper that delegates to :class:`TrackObjectsUseCase`.
"""

from __future__ import annotations

import base64
import logging

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from opentelemetry import trace

from src.infrastructure.adapters.inbound.fastapi.dependencies import (  # noqa: TC001
    ContainerDep,
    ModelManagerDep,
)
from src.infrastructure.adapters.inbound.fastapi.mappers import (
    tracking_request_schema_to_dto,
    tracking_response_dto_to_schema,
)
from src.infrastructure.adapters.inbound.fastapi.schemas import (
    ErrorResponse,
    TrackingRequest,
    TrackingResponse,
)

router = APIRouter()
tracer = trace.get_tracer(__name__)
logger = logging.getLogger(__name__)


@router.post(
    "/tracking/track",
    response_model=TrackingResponse,
    responses={
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Track objects across video frames",
    description="Tracks objects across video frames using initial segmentation masks. "
    "Supports SAMURAI, SAM2Long, SAM2.1, and YOLO11n-seg models.",
)
async def track_objects(
    request: TrackingRequest,
    manager: ModelManagerDep,
    container: ContainerDep,
) -> TrackingResponse:
    """Track objects across video frames with mask-based segmentation."""
    with tracer.start_as_current_span("track_objects") as span:
        span.set_attribute("video_id", request.video_id)
        span.set_attribute("num_objects", len(request.object_ids))

        from src.application.use_cases.summarize_video import get_video_path_for_id
        from src.application.use_cases.track_objects import (
            TrackingError,
            TrackObjectsExecutionInput,
        )
        from src.infrastructure.adapters.outbound.video.downloader import (
            cleanup_temp_video,
            download_video_if_needed,
        )

        temp_video_path: str | None = None

        try:
            if len(request.initial_masks) != len(request.object_ids):
                raise HTTPException(
                    status_code=400,
                    detail=f"Number of initial_masks ({len(request.initial_masks)}) "
                    f"must match object_ids length ({len(request.object_ids)})",
                )

            resolved_path = get_video_path_for_id(request.video_id)
            if resolved_path is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Video not found: {request.video_id}",
                )

            video_path, is_temp = await download_video_if_needed(resolved_path)
            if is_temp:
                temp_video_path = video_path

            task_config = manager.tasks.get("video_tracking")
            if task_config is None:
                raise HTTPException(
                    status_code=500,
                    detail="Video tracking task not configured",
                )

            selected_model_config = task_config.get_selected_config()

            use_case = container.build_track_objects_use_case(
                model_name=task_config.selected,
                model_id=selected_model_config.model_id,
                framework=selected_model_config.framework,
            )

            cap = cv2.VideoCapture(str(video_path))
            fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

            frame_numbers = list(request.frame_numbers)
            if not frame_numbers:
                frame_numbers = list(range(total_frames))

            # Decode initial masks
            decoded_masks: list[np.ndarray[tuple[int, ...], np.dtype[np.bool_]]] = []
            for mask_b64 in request.initial_masks:
                try:
                    mask_bytes = base64.b64decode(mask_b64)
                    mask_array = np.frombuffer(mask_bytes, dtype=np.uint8).reshape(height, width)
                    decoded_masks.append(mask_array.astype(np.bool_))
                except Exception as e:
                    raise HTTPException(
                        status_code=400, detail=f"Invalid mask encoding: {e!s}"
                    ) from e

            # Extract frames
            frames_rgb: list[np.ndarray[tuple[int, ...], np.dtype[np.uint8]]] = []
            processed_frame_numbers: list[int] = []
            timestamps: list[float] = []
            for frame_num in frame_numbers:
                if frame_num >= total_frames:
                    continue
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
                ret, frame = cap.read()
                if not ret:
                    continue
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frames_rgb.append(frame_rgb)
                processed_frame_numbers.append(frame_num)
                timestamps.append(frame_num / fps if fps > 0 else 0.0)
            cap.release()

            if not frames_rgb:
                raise HTTPException(status_code=400, detail="No valid frames to process")

            dto_request = tracking_request_schema_to_dto(request, video_path)
            execution_input = TrackObjectsExecutionInput(
                request=dto_request,
                frames=frames_rgb,
                frame_numbers=processed_frame_numbers,
                timestamps=timestamps,
                initial_masks=decoded_masks,
                video_width=width,
                video_height=height,
            )

            response_dto = await use_case.execute(execution_input)

            span.set_attribute("total_frames", response_dto.total_frames)
            span.set_attribute("processing_time", response_dto.processing_time)
            span.set_attribute("fps", response_dto.fps)

            return tracking_response_dto_to_schema(response_dto)

        except HTTPException:
            raise
        except TrackingError as e:
            logger.error("Tracking error: %s", e)
            raise HTTPException(status_code=400, detail=str(e)) from e
        except ValueError as e:
            logger.error("Validation error in tracking: %s", e)
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            logger.error("Unexpected error in tracking: %s", e)
            raise HTTPException(
                status_code=500,
                detail=f"Internal server error: {e!s}",
            ) from e
        finally:
            if temp_video_path:
                cleanup_temp_video(temp_video_path)
