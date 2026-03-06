"""Model management routes.

Provides endpoints for model configuration, status monitoring,
selection, loading, unloading, and memory validation.
"""

import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import torch
from fastapi import APIRouter, HTTPException

from src.infrastructure.adapters.inbound.fastapi.dependencies import ModelManagerDep

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

    cache_dir = Path(
        os.environ.get("TRANSFORMERS_CACHE", Path.home() / ".cache" / "huggingface" / "hub")
    )
    model_cache_name = f"models--{model_config.model_id.replace('/', '--')}"
    model_cache_path = cache_dir / model_cache_name
    cached = model_cache_path.is_dir()

    return {
        "task_type": task_type,
        "model_id": model_config.model_id,
        "cached": cached,
        "framework": model_config.framework,
    }
