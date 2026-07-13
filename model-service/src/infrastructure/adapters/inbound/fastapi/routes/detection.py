"""Object detection route.

Thin FastAPI wrapper that delegates to :class:`DetectObjectsUseCase`.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, cast

import cv2

if TYPE_CHECKING:
    from src.domain.entities.architectures import DetectionArchitecture
import numpy as np
from fastapi import APIRouter, HTTPException
from opentelemetry import trace

from src.infrastructure.adapters.inbound.fastapi import dto_bridge, models
from src.infrastructure.adapters.inbound.fastapi.dependencies import (  # noqa: TC001
    ContainerDep,
    ModelManagerDep,
)
from src.infrastructure.adapters.inbound.fastapi.dx_bodies import (
    as_request,
    as_response,
    dump,
)

router = APIRouter()
tracer = trace.get_tracer(__name__)
logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    # Handlers type-check against the source wire model; at runtime the body is
    # the Pydantic mirror FastAPI validates against (the ``else`` branch).
    _DetectionRequestBody = models.DetectionRequest
else:
    _DetectionRequestBody = as_request(models.DetectionRequest)


@router.post(
    "/detection/detect",
    response_model=as_response(models.DetectionResponse),
    responses={
        400: {"model": as_response(models.ErrorResponse)},
        404: {"model": as_response(models.ErrorResponse)},
        500: {"model": as_response(models.ErrorResponse)},
    },
    summary="Detect objects in video frames",
    description="Detects objects in video frames based on text prompts using "
    "open-vocabulary detection models. Supports YOLO-World v2.1, "
    "Grounding DINO 1.5, OWLv2, and Florence-2.",
)
async def detect_objects(
    request: _DetectionRequestBody,
    manager: ModelManagerDep,
    container: ContainerDep,
) -> dict[str, object]:
    """Detect objects in video frames using open-vocabulary detection models."""
    with tracer.start_as_current_span("detect_objects") as span:
        span.set_attribute("video_id", request.video_id)
        span.set_attribute("query", request.query)
        span.set_attribute("confidence_threshold", request.confidence_threshold)

        from src.application.dto.detection import DetectObjectsRequestDTO
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

            architecture = selected_model_config.architecture
            if architecture is None:
                raise HTTPException(
                    status_code=500,
                    detail=(
                        f"Object-detection model {selected_model_config.model_id!r} "
                        "has no architecture declared in its YAML config. Add an "
                        "`architecture: {kind: ...}` block to the entry under "
                        "`tasks.object_detection.options` so the loader registry "
                        "can dispatch by architecture."
                    ),
                )

            use_case = container.build_detect_objects_use_case(
                architecture=cast("DetectionArchitecture", architecture),
                model_id=selected_model_config.model_id,
                framework=selected_model_config.framework,
                confidence_threshold=request.confidence_threshold,
            )

            cap = cv2.VideoCapture(str(video_path))
            try:
                if not cap.isOpened():
                    raise HTTPException(
                        status_code=400,
                        detail=f"Failed to open video for decoding: {request.video_id}",
                    )

                fps = cap.get(cv2.CAP_PROP_FPS)
                total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                video_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                video_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

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
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB).astype(np.uint8)
                    timestamp = frame_num / fps if fps > 0 else 0.0
                    frame_inputs.append(
                        DetectObjectsFrameInput(
                            frame_number=frame_num,
                            timestamp=timestamp,
                            image=frame_rgb,
                        )
                    )
            finally:
                cap.release()

            dto_request = DetectObjectsRequestDTO(
                video_id=request.video_id,
                query=request.query,
                video_path=video_path,
                frame_numbers=list(request.frame_numbers),
                confidence_threshold=float(request.confidence_threshold),
                enable_tracking=request.enable_tracking,
            )
            execution_input = DetectObjectsExecutionInput(
                request=dto_request,
                video_width=video_width,
                video_height=video_height,
                frames=frame_inputs,
            )
            response_dto = await use_case.execute(execution_input)

            span.set_attribute("total_detections", response_dto.total_detections)
            span.set_attribute("frames_processed", len(response_dto.frames))
            span.set_attribute("processing_time", response_dto.processing_time)

            return dump(dto_bridge.detection_response(response_dto))

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
