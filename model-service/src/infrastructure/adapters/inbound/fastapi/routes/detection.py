"""Object detection route.

Provides the endpoint for detecting objects in video frames
using open-vocabulary detection models.
"""

import logging
import time
import uuid

import torch
from fastapi import APIRouter, HTTPException
from opentelemetry import trace

from src.infrastructure.adapters.inbound.fastapi.dependencies import ModelManagerDep
from src.infrastructure.adapters.inbound.fastapi.schemas import (
    DetectionRequest,
    DetectionResponse,
    ErrorResponse,
    FrameDetections,
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
) -> DetectionResponse:
    """Detect objects in video frames using open-vocabulary detection models.

    Parameters
    ----------
    request : DetectionRequest
        Detection request with video_id, query, and processing parameters.
    manager : ModelManagerDep
        Injected model manager instance.

    Returns
    -------
    DetectionResponse
        Detected objects with bounding boxes and confidence scores.

    Raises
    ------
    HTTPException
        If video_id is invalid, or if processing fails.
    """
    with tracer.start_as_current_span("detect_objects") as span:
        span.set_attribute("video_id", request.video_id)
        span.set_attribute("query", request.query)
        span.set_attribute("confidence_threshold", request.confidence_threshold)

        from pathlib import Path as PathlibPath

        import cv2
        from PIL import Image

        from src.application.use_cases.summarize_video import get_video_path_for_id
        from src.infrastructure.adapters.inbound.fastapi.schemas import (
            BoundingBox as APIBoundingBox,
        )
        from src.infrastructure.adapters.inbound.fastapi.schemas import (
            Detection as APIDetection,
        )
        from src.infrastructure.adapters.outbound.models.detection.loader import (
            DetectionConfig,
            DetectionFramework,
            create_detection_loader,
        )
        from src.infrastructure.adapters.outbound.video.downloader import (
            cleanup_temp_video,
            download_video_if_needed,
        )

        # Track if we downloaded a temporary file for cleanup
        temp_video_path: str | None = None

        try:
            # Use provided video_path if available, otherwise resolve from video_id
            video_path: str
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

            # Download video if it's a URL (e.g., S3 pre-signed URL)
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

            framework_map = {
                "pytorch": DetectionFramework.PYTORCH,
                "ultralytics": DetectionFramework.ULTRALYTICS,
                "transformers": DetectionFramework.TRANSFORMERS,
            }
            framework = framework_map.get(
                selected_model_config.framework,
                DetectionFramework.PYTORCH,
            )

            detection_config = DetectionConfig(
                model_id=selected_model_config.model_id,
                framework=framework,
                confidence_threshold=request.confidence_threshold,
                device="cuda" if torch.cuda.is_available() else "cpu",
                cache_dir=PathlibPath.home() / ".cache" / "huggingface",
            )

            loader = create_detection_loader(task_config.selected, detection_config)
            loader.load()

            cap = cv2.VideoCapture(str(video_path))
            fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

            frame_numbers = request.frame_numbers
            if not frame_numbers:
                frame_numbers = [0, total_frames // 2, total_frames - 1]

            frame_results = []
            total_detections = 0
            start_time = time.time()

            for frame_num in frame_numbers:
                if frame_num >= total_frames:
                    continue

                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
                ret, frame = cap.read()

                if not ret:
                    continue

                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                pil_image = Image.fromarray(frame_rgb)

                result = loader.detect(pil_image, request.query)

                detections_list = []
                for det in result.detections:
                    api_bbox = APIBoundingBox(
                        x=det.bbox.x1,
                        y=det.bbox.y1,
                        width=det.bbox.x2 - det.bbox.x1,
                        height=det.bbox.y2 - det.bbox.y1,
                    )

                    api_detection = APIDetection(
                        label=det.label,
                        bounding_box=api_bbox,
                        confidence=det.confidence,
                        track_id=None,
                    )

                    detections_list.append(api_detection)

                timestamp = frame_num / fps if fps > 0 else 0.0

                frame_detections = FrameDetections(
                    frame_number=frame_num,
                    timestamp=timestamp,
                    detections=detections_list,
                )

                frame_results.append(frame_detections)
                total_detections += len(detections_list)

            cap.release()
            loader.unload()

            processing_time = time.time() - start_time

            detection_id = str(uuid.uuid4())

            span.set_attribute("total_detections", total_detections)
            span.set_attribute("frames_processed", len(frame_results))
            span.set_attribute("processing_time", processing_time)

            return DetectionResponse(
                id=detection_id,
                video_id=request.video_id,
                query=request.query,
                frames=frame_results,
                total_detections=total_detections,
                processing_time=processing_time,
            )

        except HTTPException:
            raise
        except Exception as e:
            logger.error("Unexpected error in detection: %s", e)
            raise HTTPException(
                status_code=500,
                detail=f"Internal server error: {e!s}",
            ) from e
        finally:
            # Clean up temporary video file if downloaded
            if temp_video_path:
                cleanup_temp_video(temp_video_path)
