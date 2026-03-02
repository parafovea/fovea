"""Video tracking route.

Provides the endpoint for tracking objects across video frames
using mask-based segmentation models.
"""

import logging
import uuid

import torch
from fastapi import APIRouter, HTTPException
from opentelemetry import trace

from src.infrastructure.adapters.inbound.fastapi.dependencies import ModelManagerDep
from src.infrastructure.adapters.inbound.fastapi.schemas import (
    ErrorResponse,
    TrackingFrameResult,
    TrackingMaskData,
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
) -> TrackingResponse:
    """Track objects across video frames with mask-based segmentation.

    Parameters
    ----------
    request : TrackingRequest
        Tracking request with video_id, initial_masks, object_ids, and frame_numbers.
    manager : ModelManagerDep
        Injected model manager instance.

    Returns
    -------
    TrackingResponse
        Frame-by-frame tracking results with RLE-encoded masks.

    Raises
    ------
    HTTPException
        If video_id is invalid, initial_masks are invalid, or processing fails.
    """
    with tracer.start_as_current_span("track_objects") as span:
        span.set_attribute("video_id", request.video_id)
        span.set_attribute("num_objects", len(request.object_ids))

        import base64
        from pathlib import Path as PathlibPath

        import cv2
        import numpy as np
        from PIL import Image

        from src.application.use_cases.summarize_video import get_video_path_for_id
        from src.infrastructure.adapters.outbound.models.tracking.loader import (
            TrackingConfig,
            TrackingFramework,
            create_tracking_loader,
        )
        from src.infrastructure.adapters.outbound.video.downloader import (
            cleanup_temp_video,
            download_video_if_needed,
        )

        # Track if we downloaded a temporary file for cleanup
        temp_video_path: str | None = None

        try:
            # Validate request
            if len(request.initial_masks) != len(request.object_ids):
                raise HTTPException(
                    status_code=400,
                    detail=f"Number of initial_masks ({len(request.initial_masks)}) "
                    f"must match object_ids length ({len(request.object_ids)})",
                )

            # Get video path
            video_path = get_video_path_for_id(request.video_id)
            if video_path is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Video not found: {request.video_id}",
                )

            # Download video if it's a URL (e.g., S3 pre-signed URL)
            video_path, is_temp = await download_video_if_needed(video_path)
            if is_temp:
                temp_video_path = video_path

            # Get model configuration
            task_config = manager.tasks.get("video_tracking")
            if task_config is None:
                raise HTTPException(
                    status_code=500,
                    detail="Video tracking task not configured",
                )

            selected_model_config = task_config.get_selected_config()

            # Create tracking configuration
            framework_map = {
                "pytorch": TrackingFramework.PYTORCH,
                "ultralytics": TrackingFramework.ULTRALYTICS,
                "sam2": TrackingFramework.SAM2,
            }
            framework = framework_map.get(
                selected_model_config.framework,
                TrackingFramework.PYTORCH,
            )

            tracking_config = TrackingConfig(
                model_id=selected_model_config.model_id,
                framework=framework,
                device="cuda" if torch.cuda.is_available() else "cpu",
                cache_dir=PathlibPath.home() / ".cache" / "huggingface",
            )

            # Load tracking model
            loader = create_tracking_loader(task_config.selected, tracking_config)
            loader.load()

            # Open video and get metadata
            cap = cv2.VideoCapture(str(video_path))
            fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

            # Determine frames to process
            frame_numbers = request.frame_numbers
            if not frame_numbers:
                frame_numbers = list(range(total_frames))

            # Decode initial masks
            initial_masks_np = []
            for mask_b64 in request.initial_masks:
                try:
                    mask_bytes = base64.b64decode(mask_b64)
                    mask_array = np.frombuffer(mask_bytes, dtype=np.uint8).reshape(height, width)
                    initial_masks_np.append(mask_array)
                except Exception as e:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid mask encoding: {e!s}",
                    ) from e

            # Load frames
            frames_list = []
            for frame_num in frame_numbers:
                if frame_num >= total_frames:
                    continue

                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
                ret, frame = cap.read()

                if not ret:
                    continue

                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                pil_image = Image.fromarray(frame_rgb)
                frames_list.append(pil_image)

            cap.release()

            if not frames_list:
                raise HTTPException(
                    status_code=400,
                    detail="No valid frames to process",
                )

            # Run tracking
            tracking_result = loader.track(
                frames=frames_list,
                initial_masks=initial_masks_np,
                object_ids=request.object_ids,
            )

            # Unload model
            loader.unload()

            # Convert tracking results to API response format
            api_frames = []
            for tracking_frame in tracking_result.frames:
                # Convert masks to RLE format
                api_masks = []
                for mask in tracking_frame.masks:
                    mask_rle = mask.to_rle()
                    api_masks.append(
                        TrackingMaskData(
                            object_id=mask.object_id,
                            mask_rle=mask_rle,
                            confidence=mask.confidence,
                            is_occluded=tracking_frame.occlusions.get(mask.object_id, False),
                        )
                    )

                # Calculate timestamp
                frame_idx = tracking_frame.frame_idx
                if frame_idx < len(frame_numbers):
                    actual_frame_num = frame_numbers[frame_idx]
                    timestamp = actual_frame_num / fps if fps > 0 else 0.0
                else:
                    timestamp = 0.0

                api_frames.append(
                    TrackingFrameResult(
                        frame_number=frame_numbers[frame_idx]
                        if frame_idx < len(frame_numbers)
                        else frame_idx,
                        timestamp=timestamp,
                        masks=api_masks,
                        processing_time=tracking_frame.processing_time,
                    )
                )

            tracking_id = str(uuid.uuid4())

            span.set_attribute("total_frames", len(api_frames))
            span.set_attribute("processing_time", tracking_result.total_processing_time)
            span.set_attribute("fps", tracking_result.fps)

            return TrackingResponse(
                id=tracking_id,
                video_id=request.video_id,
                frames=api_frames,
                video_width=tracking_result.video_width,
                video_height=tracking_result.video_height,
                total_frames=len(api_frames),
                processing_time=tracking_result.total_processing_time,
                fps=tracking_result.fps,
            )

        except HTTPException:
            raise
        except ValueError as e:
            logger.error("Validation error in tracking: %s", e)
            raise HTTPException(
                status_code=400,
                detail=str(e),
            ) from e
        except Exception as e:
            logger.error("Unexpected error in tracking: %s", e)
            raise HTTPException(
                status_code=500,
                detail=f"Internal server error: {e!s}",
            ) from e
        finally:
            # Clean up temporary video file if downloaded
            if temp_video_path:
                cleanup_temp_video(temp_video_path)
