"""API routes for model service endpoints.

This module contains the API endpoint implementations for video summarization,
ontology augmentation, object detection, and model configuration management.
"""

import logging
import time
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, cast

import torch
from fastapi import APIRouter, HTTPException
from opentelemetry import trace

from .models import (
    AugmentRequest,
    AugmentResponse,
    DetectionRequest,
    DetectionResponse,
    ErrorResponse,
    FrameDetections,
    SummarizeRequest,
    SummarizeResponse,
    TrackingRequest,
    TrackingResponse,
)

if TYPE_CHECKING:
    from .model_manager import ModelManager

router = APIRouter(prefix="/api")
tracer = trace.get_tracer(__name__)
logger = logging.getLogger(__name__)

# Global model manager instance (will be injected via dependency)
_model_manager: object | None = None


def set_model_manager(manager: object) -> None:
    """Set the global model manager instance.

    Parameters
    ----------
    manager : object
        ModelManager instance to use for model operations.
    """
    global _model_manager
    _model_manager = manager


def get_model_manager() -> "ModelManager":
    """Get the global model manager instance.

    Returns
    -------
    ModelManager
        ModelManager instance.

    Raises
    ------
    HTTPException
        If model manager is not initialized.
    """
    if _model_manager is None:
        raise HTTPException(
            status_code=500,
            detail="Model manager not initialized",
        )
    from .model_manager import ModelManager
    return cast(ModelManager, _model_manager)


@router.post(
    "/summarize",
    response_model=SummarizeResponse,
    responses={
        400: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Summarize video content",
    description="Generates a text summary of video content using vision language models. "
    "Analyzes video frames and optionally audio to produce a description tailored to the persona's perspective.",
)
async def summarize_video(request: SummarizeRequest) -> SummarizeResponse:
    """Summarize video content using vision language models.

    Parameters
    ----------
    request : SummarizeRequest
        Video summarization request with video_id, persona_id, and sampling parameters.

    Returns
    -------
    SummarizeResponse
        Generated summary with key frame analysis.

    Raises
    ------
    HTTPException
        If video_id or persona_id is invalid, or if processing fails.
    """
    with tracer.start_as_current_span("summarize_video") as span:
        span.set_attribute("video_id", request.video_id)
        span.set_attribute("persona_id", request.persona_id)
        span.set_attribute("frame_sample_rate", request.frame_sample_rate)

        from .summarization import (
            SummarizationError,
            get_video_path_for_id,
            summarize_video_with_vlm,
        )
        from .vlm_loader import InferenceFramework, QuantizationType, VLMConfig

        try:
            video_path = get_video_path_for_id(request.video_id)
            if video_path is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Video not found: {request.video_id}",
                )

            manager = get_model_manager()
            task_config = manager.tasks.get("video_summarization")
            if task_config is None:
                raise HTTPException(
                    status_code=500,
                    detail="Video summarization task not configured",
                )

            selected_model_config = task_config.get_selected_config()

            quantization_map = {
                "4bit": QuantizationType.FOUR_BIT,
                "8bit": QuantizationType.EIGHT_BIT,
                "awq": QuantizationType.AWQ,
            }
            quantization = quantization_map.get(
                selected_model_config.quantization or "4bit",
                QuantizationType.FOUR_BIT,
            )

            framework_map = {
                "sglang": InferenceFramework.SGLANG,
                "vllm": InferenceFramework.VLLM,
                "transformers": InferenceFramework.TRANSFORMERS,
            }
            framework = framework_map.get(
                selected_model_config.framework,
                InferenceFramework.TRANSFORMERS,
            )

            model_config = VLMConfig(
                model_id=selected_model_config.model_id,
                quantization=quantization,
                framework=framework,
            )

            response = await summarize_video_with_vlm(
                request=request,
                video_path=video_path,
                model_config=model_config,
                model_name=task_config.selected,
                persona_role=None,
                information_need=None,
            )

            span.set_attribute("summary_generated", True)
            return response

        except HTTPException:
            raise
        except SummarizationError as e:
            logger.error(f"Summarization error: {e}")
            raise HTTPException(
                status_code=500,
                detail=str(e),
            ) from e
        except Exception as e:
            logger.error(f"Unexpected error in summarization: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Internal server error: {e!s}",
            ) from e


@router.post(
    "/ontology/augment",
    response_model=AugmentResponse,
    responses={
        400: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Augment ontology with AI suggestions",
    description="Suggests new ontology types based on domain description and existing types. "
    "Uses language models to generate semantically relevant entity types, event types, roles, or relations.",
)
async def augment_ontology(request: AugmentRequest) -> AugmentResponse:
    """Suggest new ontology types using language models.

    Parameters
    ----------
    request : AugmentRequest
        Ontology augmentation request with persona_id, domain, and target category.

    Returns
    -------
    AugmentResponse
        Suggested types with descriptions and reasoning.

    Raises
    ------
    HTTPException
        If persona_id is invalid, or if generation fails.
    """
    with tracer.start_as_current_span("augment_ontology") as span:
        span.set_attribute("persona_id", request.persona_id)
        span.set_attribute("target_category", request.target_category)
        span.set_attribute("max_suggestions", request.max_suggestions)

        from .llm_loader import LLMConfig, LLMFramework
        from .ontology_augmentation import (
            AugmentationContext,
            augment_ontology_with_llm,
            generate_augmentation_reasoning,
        )

        try:
            manager = get_model_manager()
            task_config = manager.tasks.get("ontology_augmentation")
            if task_config is None:
                raise HTTPException(
                    status_code=500,
                    detail="Ontology augmentation task not configured",
                )

            selected_model_config = task_config.get_selected_config()

            llm_config = LLMConfig(
                model_id=selected_model_config.model_id,
                quantization=selected_model_config.quantization or "4bit",
                framework=LLMFramework(selected_model_config.framework),
                max_tokens=2048,
                temperature=0.7,
                top_p=0.9,
            )

            context = AugmentationContext(
                domain=request.domain,
                existing_types=request.existing_types,
                target_category=request.target_category,
                persona_role=None,
                information_need=None,
            )

            suggestions = await augment_ontology_with_llm(
                context=context,
                llm_config=llm_config,
                max_suggestions=request.max_suggestions,
                cache_dir=None,
            )

            reasoning = generate_augmentation_reasoning(suggestions, context)

            augmentation_id = str(uuid.uuid4())

            span.set_attribute("suggestions_generated", len(suggestions))
            span.set_attribute(
                "avg_confidence",
                sum(s.confidence for s in suggestions) / len(suggestions)
                if suggestions
                else 0.0,
            )

            return AugmentResponse(
                id=augmentation_id,
                persona_id=request.persona_id,
                target_category=request.target_category,
                suggestions=suggestions,
                reasoning=reasoning,
            )

        except HTTPException:
            raise
        except ValueError as e:
            logger.error(f"Validation error in augmentation: {e}")
            raise HTTPException(
                status_code=400,
                detail=str(e),
            ) from e
        except Exception as e:
            logger.error(f"Unexpected error in augmentation: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Internal server error: {e!s}",
            ) from e


@router.post(
    "/detection/detect",
    response_model=DetectionResponse,
    responses={
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Detect objects in video frames",
    description="Detects objects in video frames based on text prompts using open-vocabulary detection models. "
    "Supports YOLO-World v2.1, Grounding DINO 1.5, OWLv2, and Florence-2.",
)
async def detect_objects(request: DetectionRequest) -> DetectionResponse:  # noqa: PLR0915
    """Detect objects in video frames using open-vocabulary detection models.

    Parameters
    ----------
    request : DetectionRequest
        Detection request with video_id, query, and processing parameters.

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

        from .detection_loader import DetectionConfig, create_detection_loader
        from .summarization import get_video_path_for_id

        try:
            video_path = get_video_path_for_id(request.video_id)
            if video_path is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Video not found: {request.video_id}",
                )

            manager = get_model_manager()
            task_config = manager.tasks.get("object_detection")
            if task_config is None:
                raise HTTPException(
                    status_code=500,
                    detail="Object detection task not configured",
                )

            selected_model_config = task_config.get_selected_config()

            from .detection_loader import DetectionFramework

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

            loader = create_detection_loader(
                task_config.selected, detection_config
            )
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
                    from .models import BoundingBox as APIBoundingBox
                    from .models import Detection as APIDetection

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
            logger.error(f"Unexpected error in detection: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Internal server error: {e!s}",
            ) from e


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
async def track_objects(request: TrackingRequest) -> TrackingResponse:  # noqa: PLR0915
    """Track objects across video frames with mask-based segmentation.

    Parameters
    ----------
    request : TrackingRequest
        Tracking request with video_id, initial_masks, object_ids, and frame_numbers.

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

        from .models import TrackingFrameResult, TrackingMaskData
        from .summarization import get_video_path_for_id
        from .tracking_loader import TrackingConfig, create_tracking_loader

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

            # Get model configuration
            manager = get_model_manager()
            task_config = manager.tasks.get("video_tracking")
            if task_config is None:
                raise HTTPException(
                    status_code=500,
                    detail="Video tracking task not configured",
                )

            selected_model_config = task_config.get_selected_config()

            # Create tracking configuration
            from .tracking_loader import TrackingFramework

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
                    mask_array = np.frombuffer(mask_bytes, dtype=np.uint8).reshape(
                        height, width
                    )
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
                            is_occluded=tracking_frame.occlusions.get(
                                mask.object_id, False
                            ),
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
            logger.error(f"Validation error in tracking: {e}")
            raise HTTPException(
                status_code=400,
                detail=str(e),
            ) from e
        except Exception as e:
            logger.error(f"Unexpected error in tracking: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Internal server error: {e!s}",
            ) from e


@router.get(
    "/models/config",
    summary="Get model configuration",
    description="Returns the current model configuration including all task types, "
    "available model options, and currently selected models.",
)
async def get_model_config() -> dict[str, object]:
    """Get current model configuration for all task types.

    Returns
    -------
    dict[str, object]
        Dictionary containing configuration for all tasks.

    Raises
    ------
    HTTPException
        If model manager is not initialized.
    """
    manager = get_model_manager()

    config = {}
    for task_type, task_config in manager.tasks.items():
        config[task_type] = {
            "selected": task_config.selected,
            "options": {
                name: {
                    "model_id": opt.model_id,
                    "framework": opt.framework,
                    "vram_gb": opt.vram_gb,
                    "speed": opt.speed,
                    "description": opt.description,
                    "fps": opt.fps,
                }
                for name, opt in task_config.options.items()
            },
        }

    return {
        "models": config,
        "inference": {
            "max_memory_per_model": manager.inference_config.max_memory_per_model,
            "offload_threshold": manager.inference_config.offload_threshold,
            "warmup_on_startup": manager.inference_config.warmup_on_startup,
            "default_batch_size": manager.inference_config.default_batch_size,
            "max_batch_size": manager.inference_config.max_batch_size,
        },
        "cuda_available": torch.cuda.is_available(),
    }


@router.get(
    "/models/status",
    summary="Get model status",
    description="Returns information about currently loaded models, memory usage, and system statistics.",
)
async def get_model_status() -> dict[str, object]:
    """Get status of loaded models and memory usage.

    Returns
    -------
    dict[str, object]
        Dictionary with loaded models, memory statistics, and system info.

    Raises
    ------
    HTTPException
        If model manager is not initialized.
    """
    manager = get_model_manager()

    loaded_models_dict = manager.get_loaded_models()
    memory_usage = manager.get_memory_usage_percentage()
    available_vram = manager.get_available_vram()
    total_vram = manager.get_total_vram()

    # Convert loaded_models dict to array format expected by frontend
    loaded_models = []
    for task_type, model_info in loaded_models_dict.items():
        loaded_models.append({
            "task_type": task_type,
            "model_id": model_info["model_id"],
            "model_name": manager.tasks[task_type].selected,
            "framework": manager.tasks[task_type].get_selected_config().framework,
            "quantization": manager.tasks[task_type].get_selected_config().quantization,
            "health": "loaded",
            "vram_allocated_gb": model_info["memory_usage_gb"],
            "vram_used_gb": model_info["memory_usage_gb"],
            "warm_up_complete": True,
            "last_used": None,
            "load_time_ms": model_info["load_time"] * 1000 if model_info["load_time"] else None,
            "performance_metrics": None,
            "error_message": None,
        })

    return {
        "loaded_models": loaded_models,
        "total_vram_allocated_gb": sum(m["vram_allocated_gb"] for m in loaded_models),
        "total_vram_available_gb": total_vram / 1024**3,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cuda_available": torch.cuda.is_available(),
    }


@router.post(
    "/models/select",
    summary="Select model for task",
    description="Changes the selected model for a specific task type. "
    "If the task's model is currently loaded, it will be unloaded and reloaded with the new selection.",
)
async def select_model(task_type: str, model_name: str) -> dict[str, str]:
    """Change selected model for a task type.

    Parameters
    ----------
    task_type : str
        Task type to update (e.g., "video_summarization").
    model_name : str
        Name of model option to select (e.g., "llama-4-maverick").

    Returns
    -------
    dict[str, str]
        Success message with new configuration.

    Raises
    ------
    HTTPException
        If task type or model name is invalid.
    """
    manager = get_model_manager()

    try:
        await manager.set_selected_model(task_type, model_name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return {
        "status": "success",
        "task_type": task_type,
        "selected_model": model_name,
    }


@router.post(
    "/models/validate",
    summary="Validate memory budget",
    description="Validates that all currently selected models can fit in available GPU memory. "
    "Returns detailed breakdown of memory requirements and availability.",
)
async def validate_memory_budget() -> dict[str, object]:
    """Validate memory budget for currently selected models.

    Returns
    -------
    dict[str, object]
        Validation results with memory breakdown.

    Raises
    ------
    HTTPException
        If model manager is not initialized.
    """
    manager = get_model_manager()
    return manager.validate_memory_budget()


@router.post(
    "/models/unload/{task_type}",
    summary="Unload model",
    description="Manually unload a model from memory to free GPU resources.",
)
async def unload_model(task_type: str) -> dict[str, str]:
    """Unload a model from memory.

    Parameters
    ----------
    task_type : str
        Task type of model to unload.

    Returns
    -------
    dict[str, str]
        Success message.

    Raises
    ------
    HTTPException
        If model manager is not initialized or model not loaded.
    """
    manager = get_model_manager()

    await manager.unload_model(task_type)

    return {
        "status": "success",
        "task_type": task_type,
        "message": "Model unloaded successfully",
    }


@router.post(
    "/models/load/{task_type}",
    summary="Load model",
    description="Manually load a model into memory. Models are normally loaded on demand when needed.",
)
async def load_model(task_type: str) -> dict[str, str]:
    """Load a model into memory.

    Parameters
    ----------
    task_type : str
        Task type of model to load.

    Returns
    -------
    dict[str, str]
        Success message with model info.

    Raises
    ------
    HTTPException
        If model manager is not initialized or loading fails.
    """
    manager = get_model_manager()

    try:
        await manager.load_model(task_type)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return {
        "status": "success",
        "task_type": task_type,
        "message": "Model loaded successfully",
    }
