"""Model management routes.

Provides endpoints for model configuration, status monitoring,
selection, loading, unloading, and memory validation.
"""

import logging
from datetime import datetime, timezone

import didactic.api as dx
from fastapi import APIRouter, HTTPException

from src.infrastructure.adapters.inbound.fastapi.dependencies import (
    ModelManagerDep,  # noqa: TC001  # FastAPI resolves this annotation at runtime
)
from src.infrastructure.adapters.inbound.fastapi.dx_bodies import as_response, dump
from src.infrastructure.config.settings import get_settings

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get(
    "/models/config",
    summary="Get model configuration",
    description="Returns the current model configuration including all task types, "
    "available model options, and currently selected models.",
)
async def get_model_config(manager: ModelManagerDep) -> dict[str, object]:
    """Get current model configuration for all task types.

    Parameters
    ----------
    manager : ModelManager
        Injected model manager instance.

    Returns
    -------
    dict[str, object]
        Dictionary containing configuration for all tasks.
    """
    config = {}
    for task_type, task_config in manager.tasks.items():
        config[task_type] = {
            "selected": task_config.selected,
            "options": [
                {
                    "name": name,
                    "model_id": opt.model_id,
                    "framework": opt.framework,
                    "vram_gb": opt.vram_gb,
                    "cpu_memory_gb": opt.cpu_memory_gb,
                    "cpu_compatible": opt.cpu_compatible,
                    "speed": opt.speed,
                    "description": opt.description,
                    "fps": opt.fps,
                    "requires_api_key": opt.requires_api_key,
                }
                for name, opt in task_config.options.items()
            ],
        }

    import torch  # deferred so the route module imports without the ML stack

    has_any_model = any(task_config.options for task_config in manager.tasks.values())
    has_cpu_model = any(
        model.cpu_compatible
        for task_config in manager.tasks.values()
        for model in task_config.options.values()
    )

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
        "models_available": has_any_model,
        "cpu_models_available": has_cpu_model,
    }


@router.get(
    "/models/status",
    summary="Get model status",
    description="Returns information about currently loaded models, "
    "memory usage, and system statistics.",
)
async def get_model_status(manager: ModelManagerDep) -> dict[str, object]:
    """Get status of loaded models and memory usage.

    Parameters
    ----------
    manager : ModelManager
        Injected model manager instance.

    Returns
    -------
    dict[str, object]
        Dictionary with loaded models, memory statistics, and system info.
    """
    import torch  # deferred so the route module imports without the ML stack

    loaded_models_dict = manager.get_loaded_models()
    total_vram = manager.get_total_vram()

    # Convert loaded_models dict to array format expected by frontend
    loaded_models = []
    for task_type, model_info in loaded_models_dict.items():
        loaded_models.append(
            {
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
            }
        )

    has_any_model = any(task_config.options for task_config in manager.tasks.values())
    has_cpu_model = any(
        model.cpu_compatible
        for task_config in manager.tasks.values()
        for model in task_config.options.values()
    )

    return {
        "loaded_models": loaded_models,
        "total_vram_allocated_gb": sum(m["vram_allocated_gb"] for m in loaded_models),
        "total_vram_available_gb": total_vram / 1024**3,
        "timestamp": datetime.now(timezone.utc).isoformat(),  # noqa: UP017
        "cuda_available": torch.cuda.is_available(),
        "models_available": has_any_model,
        "cpu_models_available": has_cpu_model,
    }


@router.post(
    "/models/select",
    summary="Select model for task",
    description="Changes the selected model for a specific task type. "
    "If the task's model is currently loaded, it will be unloaded "
    "and reloaded with the new selection.",
)
async def select_model(
    task_type: str,
    model_name: str,
    manager: ModelManagerDep,
) -> dict[str, str]:
    """Change selected model for a task type.

    Parameters
    ----------
    task_type : str
        Task type to update (e.g., "video_summarization").
    model_name : str
        Name of model option to select (e.g., "llama-4-maverick").
    manager : ModelManager
        Injected model manager instance.

    Returns
    -------
    dict[str, str]
        Success message with new configuration.

    Raises
    ------
    HTTPException
        If task type or model name is invalid.
    """
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
    description="Validates that all currently selected models can fit in "
    "available GPU memory. Returns detailed breakdown of memory "
    "requirements and availability.",
)
async def validate_memory_budget(manager: ModelManagerDep) -> dict[str, object]:
    """Validate memory budget for currently selected models.

    Parameters
    ----------
    manager : ModelManager
        Injected model manager instance.

    Returns
    -------
    dict[str, object]
        Validation results with memory breakdown.
    """
    return manager.validate_memory_budget()


@router.post(
    "/models/unload/{task_type}",
    summary="Unload model",
    description="Manually unload a model from memory to free GPU resources.",
)
async def unload_model(
    task_type: str,
    manager: ModelManagerDep,
) -> dict[str, str]:
    """Unload a model from memory.

    Parameters
    ----------
    task_type : str
        Task type of model to unload.
    manager : ModelManager
        Injected model manager instance.

    Returns
    -------
    dict[str, str]
        Success message.
    """
    await manager.unload_model(task_type)

    return {
        "status": "success",
        "task_type": task_type,
        "message": "Model unloaded successfully",
    }


@router.post(
    "/models/load/{task_type}",
    summary="Load model",
    description="Manually load a model into memory. "
    "Models are normally loaded on demand when needed.",
)
async def load_model(
    task_type: str,
    manager: ModelManagerDep,
) -> dict[str, str]:
    """Load a model into memory.

    Parameters
    ----------
    task_type : str
        Task type of model to load.
    manager : ModelManager
        Injected model manager instance.

    Returns
    -------
    dict[str, str]
        Success message with model info.

    Raises
    ------
    HTTPException
        If loading fails or task type is invalid.
    """
    try:
        await manager.load_model(task_type)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return {
        "status": "success",
        "task_type": task_type,
        "message": "Model loaded successfully",
    }


@router.get(
    "/models/task-ready/{task_type}",
    summary="Check if model is cached locally",
    description="Checks whether the selected model for a task type is already "
    "downloaded and cached locally. Useful for distinguishing between "
    "'Downloading model' and 'Loading model' in the UI.",
)
async def check_task_ready(
    task_type: str,
    manager: ModelManagerDep,
) -> dict[str, object]:
    """Check if the selected model for a task type is cached locally.

    Parameters
    ----------
    task_type : str
        Task type to check (e.g., "video_summarization").
    manager : ModelManager
        Injected model manager instance.

    Returns
    -------
    dict[str, object]
        Dictionary with task_type, model_id, cached status, and framework.

    Raises
    ------
    HTTPException
        If task type is not found in configuration.
    """
    if task_type not in manager.tasks:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown task type: {task_type}",
        )

    task_config = manager.tasks[task_type]
    model_config = task_config.get_selected_config()

    if model_config.framework == "external_api":
        return {
            "task_type": task_type,
            "model_id": model_config.model_id,
            "cached": True,
            "framework": model_config.framework,
        }

    cache_dir = get_settings().transformers_cache
    model_cache_name = f"models--{model_config.model_id.replace('/', '--')}"
    model_cache_path = cache_dir / model_cache_name
    cached = model_cache_path.is_dir()

    return {
        "task_type": task_type,
        "model_id": model_config.model_id,
        "cached": cached,
        "framework": model_config.framework,
    }


class GenerationDefaults(dx.Model):
    """Default sampling parameters for text generation."""

    max_tokens: int = dx.field(description="Maximum tokens to generate.")
    temperature: float = dx.field(description="Sampling temperature; 0.0 is greedy.")
    top_p: float = dx.field(description="Nucleus sampling probability mass.")
    stop_sequences: tuple[str, ...] | None = dx.field(
        default=None, description="Optional stop strings terminating generation."
    )


class LLMDefaults(dx.Model):
    """Default loading parameters for a language model."""

    quantization: str
    framework: str
    max_tokens: int
    temperature: float
    top_p: float
    context_length: int


class TranscriptionDefaults(dx.Model):
    """Default loading parameters for audio transcription."""

    framework: str
    language: str | None
    task: str
    device: str
    compute_type: str
    beam_size: int


class VADDefaults(dx.Model):
    """Default parameters for voice-activity detection."""

    threshold: float
    min_speech_duration_ms: int
    min_silence_duration_ms: int
    device: str


class DiarizationDefaults(dx.Model):
    """Default parameters for speaker diarization."""

    num_speakers: int | None
    min_speakers: int
    max_speakers: int
    device: str


class DetectionDefaults(dx.Model):
    """Default parameters for object detection."""

    framework: str
    confidence_threshold: float
    device: str


class TrackingDefaults(dx.Model):
    """Default parameters for object tracking."""

    framework: str
    device: str


class VLMDefaults(dx.Model):
    """Default loading parameters for a vision-language model."""

    quantization: str
    framework: str
    device: str
    trust_remote_code: bool


class ModelDefaultsResponse(dx.Model):
    """Response shape for ``GET /api/models/defaults``."""

    generation: GenerationDefaults
    llm: LLMDefaults
    transcription: TranscriptionDefaults
    vad: VADDefaults
    diarization: DiarizationDefaults
    detection: DetectionDefaults
    tracking: TrackingDefaults
    vlm: VLMDefaults


class ModelFrameworksResponse(dx.Model):
    """Response shape for ``GET /api/models/frameworks``.

    Each field is the full list of string values from the corresponding
    StrEnum so the UI can render selectors without hardcoding choices.
    """

    llm: tuple[str, ...]
    audio: tuple[str, ...]
    detection: tuple[str, ...]
    tracking: tuple[str, ...]
    vlm_inference: tuple[str, ...]
    quantization: tuple[str, ...]


@router.get(
    "/models/defaults",
    response_model=as_response(ModelDefaultsResponse),
    summary="Get default inference configs per task",
    description="Returns the dataclass defaults used to construct each inference "
    "config (generation, transcription, diarization, VAD, detection, tracking). "
    "Used by the settings UI to render controls pre-filled with backend defaults.",
)
async def get_model_defaults() -> dict[str, object]:
    """Return default values for every inference config dataclass.

    The frontend uses these to render settings forms and validate user-entered
    overrides before they are sent in a request body.
    """
    from src.infrastructure.adapters.outbound.models.audio.base import (
        TranscriptionConfig,
    )
    from src.infrastructure.adapters.outbound.models.audio.loader import (
        DiarizationConfig,
        VADConfig,
    )
    from src.infrastructure.adapters.outbound.models.detection.base import (
        DetectionConfig,
    )
    from src.infrastructure.adapters.outbound.models.llm.base import (
        GenerationConfig,
        LLMConfig,
        LLMFramework,
    )
    from src.infrastructure.adapters.outbound.models.tracking.loader import (
        TrackingConfig,
    )
    from src.infrastructure.adapters.outbound.models.vlm.loader import (
        VLMConfig,
    )

    # Instantiate each config with placeholder required fields so we can read
    # the effective defaults off real instances. ``model_id`` is required on
    # most configs but is never a "default" we want to ship — the settings UI
    # picks it separately from ``/api/models/config``.
    gen = GenerationConfig()
    llm = LLMConfig(
        model_id="__placeholder__",
        quantization="4bit",
        framework=LLMFramework.TRANSFORMERS,
    )
    transcription = TranscriptionConfig(model_id="__placeholder__")
    vad = VADConfig(model_id="__placeholder__")
    diarization = DiarizationConfig(model_id="__placeholder__")
    detection = DetectionConfig(model_id="__placeholder__")
    tracking = TrackingConfig(model_id="__placeholder__")
    vlm = VLMConfig(model_id="__placeholder__")

    return dump(
        ModelDefaultsResponse(
            generation=GenerationDefaults(
                max_tokens=gen.max_tokens,
                temperature=gen.temperature,
                top_p=gen.top_p,
                stop_sequences=(None if gen.stop_sequences is None else tuple(gen.stop_sequences)),
            ),
            llm=LLMDefaults(
                quantization=llm.quantization,
                framework=str(llm.framework),
                max_tokens=llm.max_tokens,
                temperature=llm.temperature,
                top_p=llm.top_p,
                context_length=llm.context_length,
            ),
            transcription=TranscriptionDefaults(
                framework=str(transcription.framework),
                language=transcription.language,
                task=transcription.task,
                device=transcription.device,
                compute_type=transcription.compute_type,
                beam_size=transcription.beam_size,
            ),
            vad=VADDefaults(
                threshold=vad.threshold,
                min_speech_duration_ms=vad.min_speech_duration_ms,
                min_silence_duration_ms=vad.min_silence_duration_ms,
                device=vad.device,
            ),
            diarization=DiarizationDefaults(
                num_speakers=diarization.num_speakers,
                min_speakers=diarization.min_speakers,
                max_speakers=diarization.max_speakers,
                device=diarization.device,
            ),
            detection=DetectionDefaults(
                framework=str(detection.framework),
                confidence_threshold=detection.confidence_threshold,
                device=detection.device,
            ),
            tracking=TrackingDefaults(
                framework=str(tracking.framework),
                device=tracking.device,
            ),
            vlm=VLMDefaults(
                quantization=str(vlm.quantization),
                framework=str(vlm.framework),
                device=vlm.device,
                trust_remote_code=vlm.trust_remote_code,
            ),
        )
    )


@router.get(
    "/models/frameworks",
    response_model=as_response(ModelFrameworksResponse),
    summary="Get available framework values per task",
    description="Enumerates the StrEnum values for LLMFramework, AudioFramework, "
    "DetectionFramework, TrackingFramework, VLM InferenceFramework, and "
    "QuantizationType so the UI can render framework pickers without hardcoding "
    "the lists.",
)
async def get_model_frameworks() -> dict[str, object]:
    """Return every framework/quantization enum value keyed by task group."""
    from src.infrastructure.adapters.outbound.models.audio.base import (
        AudioFramework,
    )
    from src.infrastructure.adapters.outbound.models.detection.base import (
        DetectionFramework,
    )
    from src.infrastructure.adapters.outbound.models.llm.base import (
        LLMFramework,
    )
    from src.infrastructure.adapters.outbound.models.tracking.loader import (
        TrackingFramework,
    )
    from src.infrastructure.adapters.outbound.models.vlm.loader import (
        InferenceFramework,
        QuantizationType,
    )

    return dump(
        ModelFrameworksResponse(
            llm=tuple(f.value for f in LLMFramework),
            audio=tuple(f.value for f in AudioFramework),
            detection=tuple(f.value for f in DetectionFramework),
            tracking=tuple(f.value for f in TrackingFramework),
            vlm_inference=tuple(f.value for f in InferenceFramework),
            quantization=tuple(f.value for f in QuantizationType),
        )
    )
