"""Object detection route.

Thin FastAPI wrapper that delegates to :class:`DetectObjectsUseCase`.
"""

from __future__ import annotations

import logging

import cv2
from fastapi import APIRouter, HTTPException
from opentelemetry import trace

from src.infrastructure.adapters.inbound.fastapi.dependencies import (  # noqa: TC001
    ContainerDep,
    ModelManagerDep,
)
from src.infrastructure.adapters.inbound.fastapi.mappers import (
    detection_request_schema_to_dto,
    detection_response_dto_to_schema,
)
from src.infrastructure.adapters.inbound.fastapi.schemas import (
    DetectionRequest,
    DetectionResponse,
    ErrorResponse,
)

router = APIRouter()
tracer = trace.get_tracer(__name__)
logger = logging.getLogger(__name__)


@router.post(
    "/detection/detect",
    response_model=DetectionResponse,
    responses={
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Detect objects in video frames",
    description="Detects objects in video frames based on text prompts using "
    "open-vocabulary detection models. Supports YOLO-World v2.1, "
    "Grounding DINO 1.5, OWLv2, and Florence-2.",
)
async def detect_objects(
    request: DetectionRequest,
    manager: ModelManagerDep,
    container: ContainerDep,
) -> DetectionResponse:
    """Detect objects in video frames using open-vocabulary detection models."""
    with tracer.start_as_current_span("detect_objects") as span:
        span.set_attribute("video_id", request.video_id)
        span.set_attribute("query", request.query)
        span.set_attribute("confidence_threshold", request.confidence_threshold)

        from src.application.use_cases.detect_objects import (
            DetectObjectsExecutionInput,
            DetectObjectsFrameInput,
        )
        from src.application.use_cases.summarize_video import get_video_path_for_id
        from src.infrastructure.adapters.outbound.video.downloader import (
            cleanup_temp_video,
            download_video_if_needed,
        )

        temp_video_path: str | None = None

        try:
            if request.video_path:
                video_path = request.video_path
            else:
                resolved_path = get_video_path_for_id(request.video_id)
                if resolved_path is None:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Video not found: {request.video_id}",
                    )
                video_path = resolved_path

            video_path, is_temp = await download_video_if_needed(video_path)
            if is_temp:
                temp_video_path = video_path

            task_config = manager.tasks.get("object_detection")
            if task_config is None:
                raise HTTPException(
                    status_code=500,
                    detail="Object detection task not configured",
                )

            selected_model_config = task_config.get_selected_config()

            use_case = container.build_detect_objects_use_case(
                model_name=task_config.selected,
                model_id=selected_model_config.model_id,
                framework=selected_model_config.framework,
                confidence_threshold=request.confidence_threshold,
            )

            cap = cv2.VideoCapture(str(video_path))
            fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

            frame_numbers = list(request.frame_numbers)
            if not frame_numbers:
                frame_numbers = [0, total_frames // 2, max(total_frames - 1, 0)]

            frame_inputs: list[DetectObjectsFrameInput] = []
            for frame_num in frame_numbers:
                if frame_num >= total_frames:
                    continue
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
                ret, frame = cap.read()
                if not ret:
                    continue
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                timestamp = frame_num / fps if fps > 0 else 0.0
                frame_inputs.append(
                    DetectObjectsFrameInput(
                        frame_number=frame_num,
                        timestamp=timestamp,
                        image=frame_rgb,
                    )
                )
            cap.release()

            dto_request = detection_request_schema_to_dto(request, video_path)
            execution_input = DetectObjectsExecutionInput(request=dto_request, frames=frame_inputs)
            response_dto = await use_case.execute(execution_input)

            span.set_attribute("total_detections", response_dto.total_detections)
            span.set_attribute("frames_processed", len(response_dto.frames))
            span.set_attribute("processing_time", response_dto.processing_time)

            return detection_response_dto_to_schema(response_dto)

        except HTTPException:
            raise
        except Exception as e:
            logger.error("Unexpected error in detection: %s", e)
            raise HTTPException(
                status_code=500,
                detail=f"Internal server error: {e!s}",
            ) from e
        finally:
            if temp_video_path:
                cleanup_temp_video(temp_video_path)
