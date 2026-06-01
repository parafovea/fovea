"""Model management with dynamic loading, memory budget validation, and LRU eviction.

This module provides a ModelManager class that handles loading and unloading
of AI models based on available GPU memory. Models are loaded on demand and
automatically evicted when memory pressure occurs.

All hardware-specific logic is delegated to an injected
``IModelCapabilityProbe`` port. Concrete model construction for audio tasks is
delegated to an injected ``TaskModelFactory`` mapping so that the service
contains no ML framework imports.
"""

from __future__ import annotations

import logging
import os
import time
from collections import OrderedDict
from collections.abc import Callable
from pathlib import Path
from typing import TYPE_CHECKING, Any

import psutil
import yaml
from opentelemetry import trace
from pydantic import TypeAdapter

from src.application.dto.external_api import ExternalAPIConfigDTO
from src.domain.entities.architectures import Architecture

# Pydantic adapter for the cross-family discriminated Architecture
# union. Cached at module scope because TypeAdapter compilation is
# non-trivial and ``ModelConfig`` instances parse architecture blocks
# on every YAML load. The annotation is the family-tagged
# ``Annotated[Union[...], Field(discriminator)]`` alias from
# ``src.domain.entities.architectures``; Pyright's variance check on
# Annotated forces a ``type: ignore``.
_ARCHITECTURE_ADAPTER = TypeAdapter[Architecture](Architecture)  # type: ignore[misc]

if TYPE_CHECKING:
    from src.application.ports.outbound.model_capability import IModelCapabilityProbe

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)


#: Factory that builds a task-specific loader from a ``ModelConfig``.
TaskModelFactory = Callable[["ModelConfig"], Any]


class ModelConfig:
    """Configuration for a single model variant."""

    def __init__(self, config_dict: dict[str, Any]) -> None:
        """Initialize model configuration from dictionary."""
        self.model_id: str = config_dict["model_id"]
        self.framework: str = config_dict["framework"]
        # Architecture is required. A YAML entry without an `architecture`
        # block fails loudly here at config load rather than silently
        # selecting a default at dispatch time. The discriminated union
        # in src.domain.entities.architectures parses the dict into the
        # right Pydantic subclass; malformed blocks (unknown `kind`,
        # extra fields) raise loud thanks to ConfigDict(extra='forbid').
        try:
            arch_payload = config_dict["architecture"]
        except KeyError as exc:
            raise ValueError(
                "ModelConfig is missing the required `architecture` block; "
                "every model option in models.yaml / models-cpu.yaml must "
                f"declare its architecture kind. Got keys: {sorted(config_dict.keys())!r}"
            ) from exc
        self.architecture: Architecture = _ARCHITECTURE_ADAPTER.validate_python(arch_payload)
        self.vram_gb: float = config_dict.get("vram_gb", 0)
        self.cpu_memory_gb: float = config_dict.get("cpu_memory_gb", 0)
        self.cpu_compatible: bool = config_dict.get("cpu_compatible", False)
        self.quantization: str | None = config_dict.get("quantization")
        self.speed: str = config_dict.get("speed", "medium")
        self.description: str = config_dict.get("description", "")
        self.fps: int | None = config_dict.get("fps")
        self.provider: str | None = config_dict.get("provider")
        self.api_endpoint: str | None = config_dict.get("api_endpoint")
        self.requires_api_key: bool = config_dict.get("requires_api_key", False)

    @property
    def vram_bytes(self) -> int:
        """Convert VRAM requirement from GB to bytes."""
        return int(self.vram_gb * 1024 * 1024 * 1024)

    @property
    def cpu_memory_bytes(self) -> int:
        """Convert CPU memory requirement from GB to bytes."""
        return int(self.cpu_memory_gb * 1024 * 1024 * 1024)


class TaskConfig:
    """Configuration for a task type with multiple model options."""

    def __init__(self, task_name: str, config_dict: dict[str, Any]) -> None:
        """Initialize task configuration from dictionary."""
        self.task_name = task_name
        self.selected = config_dict["selected"]
        self.options: dict[str, ModelConfig] = {
            name: ModelConfig(opt_dict) for name, opt_dict in config_dict["options"].items()
        }

    def get_selected_config(self) -> ModelConfig:
        """Get the currently selected model configuration."""
        return self.options[self.selected]


class InferenceConfig:
    """Global inference configuration settings."""

    def __init__(self, config_dict: dict[str, Any]) -> None:
        """Initialize inference configuration from dictionary."""
        self.max_memory_per_model = config_dict.get("max_memory_per_model", "auto")
        self.offload_threshold: float = config_dict.get("offload_threshold", 0.85)
        self.warmup_on_startup: bool = config_dict.get("warmup_on_startup", False)
        self.default_batch_size: int = config_dict.get("default_batch_size", 1)
        self.max_batch_size: int = config_dict.get("max_batch_size", 8)


class ModelManager:
    """Manages loading, unloading, and memory management of AI models."""

    def __init__(
        self,
        config_path: str,
        *,
        capability_probe: IModelCapabilityProbe,
        task_factories: dict[str, TaskModelFactory] | None = None,
    ) -> None:
        """Initialize ModelManager.

        Parameters
        ----------
        config_path : str
            Path to models.yaml configuration file.
        capability_probe : IModelCapabilityProbe
            Hardware capability probe used to detect device, VRAM, and other
            platform characteristics.
        task_factories : dict[str, TaskModelFactory] | None
            Mapping from task type to a factory callable that builds the
            corresponding loader. Tasks not in the mapping fall back to
            placeholder dicts.
        """
        self.config_path = Path(config_path)
        self._capability_probe: IModelCapabilityProbe = capability_probe
        self._task_factories: dict[str, TaskModelFactory] = dict(task_factories or {})
        self.config = self._load_config()
        self.loaded_models: OrderedDict[str, Any] = OrderedDict()
        self.model_load_times: dict[str, float] = {}
        self.model_memory_usage: dict[str, int] = {}

        self.device = self._detect_device()
        self.cpu_only_mode = self.device == "cpu"

        logger.info(f"ModelManager initialized with config from {config_path}")
        logger.info(f"Device: {self.device}, CPU-only mode: {self.cpu_only_mode}")

    # --- Capability probe plumbing -------------------------------------------------

    def _probe(self) -> IModelCapabilityProbe:
        """Return the capability probe."""
        return self._capability_probe

    def register_task_factory(self, task_type: str, factory: TaskModelFactory) -> None:
        """Register a factory for a task type."""
        self._task_factories[task_type] = factory

    # --- Config loading ------------------------------------------------------------

    def _load_config(self) -> dict[str, Any]:
        """Load configuration from YAML file."""
        if not self.config_path.exists():
            raise FileNotFoundError(f"Config file not found: {self.config_path}")

        with self.config_path.open() as f:
            config: dict[str, Any] = yaml.safe_load(f)

        self.tasks: dict[str, TaskConfig] = {
            task_name: TaskConfig(task_name, task_config)
            for task_name, task_config in config["models"].items()
        }

        self.inference_config = InferenceConfig(config["inference"])

        return config

    def _detect_device(self) -> str:
        """Detect available compute device via the capability probe."""
        return self._probe().detect_device()

    # --- Memory accounting --------------------------------------------------------

    def get_available_ram(self) -> int:
        """Get available system RAM in bytes."""
        return int(psutil.virtual_memory().available)

    def get_total_ram(self) -> int:
        """Get total system RAM in bytes."""
        return int(psutil.virtual_memory().total)

    def get_cpu_compatible_models(self, task_type: str) -> dict[str, ModelConfig]:
        """Get models that can run on CPU for a task type."""
        if task_type not in self.tasks:
            raise ValueError(f"Invalid task type: {task_type}")

        task = self.tasks[task_type]
        return {name: config for name, config in task.options.items() if config.cpu_compatible}

    def get_available_vram(self) -> int:
        """Get available GPU memory in bytes."""
        return self._probe().available_vram_bytes()

    def get_total_vram(self) -> int:
        """Get total GPU memory in bytes."""
        return self._probe().total_vram_bytes()

    def get_memory_usage_percentage(self) -> float:
        """Get current GPU memory usage as percentage (0.0 to 1.0)."""
        total = self.get_total_vram()
        if total == 0:
            return 0.0
        allocated = self._probe().allocated_vram_bytes()
        return allocated / total

    def check_memory_available(self, required_bytes: int) -> bool:
        """Check if sufficient memory is available for model loading."""
        available = self.get_available_vram()
        return available >= required_bytes

    def get_lru_model(self) -> str | None:
        """Get least recently used model identifier."""
        if not self.loaded_models:
            return None
        return next(iter(self.loaded_models))

    # --- Loading / unloading ------------------------------------------------------

    @tracer.start_as_current_span("evict_lru_model")
    async def evict_lru_model(self) -> str | None:
        """Evict the least recently used model from memory."""
        lru_task = self.get_lru_model()
        if lru_task is None:
            logger.warning("No models to evict")
            return None

        logger.info(f"Evicting LRU model: {lru_task}")
        await self.unload_model(lru_task)
        return lru_task

    @tracer.start_as_current_span("unload_model")
    async def unload_model(self, task_type: str) -> None:
        """Unload a model from memory."""
        if task_type not in self.loaded_models:
            logger.warning(f"Model {task_type} not loaded")
            return

        logger.info(f"Unloading model: {task_type}")
        del self.loaded_models[task_type]
        del self.model_load_times[task_type]
        del self.model_memory_usage[task_type]

        self._probe().empty_cache()
        logger.info(f"Model {task_type} unloaded successfully")

    @tracer.start_as_current_span("load_model")
    async def load_model(self, task_type: str) -> Any:
        """Load a model for the specified task type."""
        if task_type not in self.tasks:
            raise ValueError(f"Invalid task type: {task_type}")

        if task_type in self.loaded_models:
            self.loaded_models.move_to_end(task_type)
            logger.info(f"Model {task_type} already loaded, moved to end")
            return self.loaded_models[task_type]

        task_config = self.tasks[task_type]
        model_config = task_config.get_selected_config()

        logger.info(
            f"Loading model for {task_type}: {model_config.model_id} "
            f"({model_config.vram_gb}GB VRAM required)"
        )

        while not self.check_memory_available(model_config.vram_bytes):
            memory_usage = self.get_memory_usage_percentage()
            logger.info(f"Insufficient memory (usage: {memory_usage:.1%}), evicting LRU model")
            evicted = await self.evict_lru_model()
            if evicted is None:
                raise RuntimeError(f"Insufficient memory for {task_type} and no models to evict")

        probe = self._probe()
        memory_before = probe.allocated_vram_bytes()
        model = self._load_model_implementation(task_type, model_config)
        memory_after = probe.allocated_vram_bytes()
        actual_memory = memory_after - memory_before

        self.loaded_models[task_type] = model
        self.model_load_times[task_type] = time.time()
        self.model_memory_usage[task_type] = actual_memory

        logger.info(
            f"Model {task_type} loaded successfully "
            f"(actual memory: {actual_memory / 1024**3:.2f}GB)"
        )
        return model

    def _load_model_implementation(self, task_type: str, model_config: ModelConfig) -> Any:
        """Build a loader via the registered task factory or return a stub."""
        logger.info(f"Loading {model_config.framework} model: {model_config.model_id}")

        factory = self._task_factories.get(task_type)
        if factory is not None:
            loader = factory(model_config)
            logger.info(f"Loader for {task_type} built: {model_config.model_id}")
            return loader

        return {
            "task_type": task_type,
            "model_id": model_config.model_id,
            "framework": model_config.framework,
            "config": model_config,
        }

    async def get_model(self, task_type: str) -> Any:
        """Get model for task type, loading if necessary."""
        if task_type in self.loaded_models:
            self.loaded_models.move_to_end(task_type)
            return self.loaded_models[task_type]

        return await self.load_model(task_type)

    def get_loaded_models(self) -> dict[str, dict[str, Any]]:
        """Get information about currently loaded models."""
        result = {}
        for task_type in self.loaded_models:
            result[task_type] = {
                "model_id": self.tasks[task_type].get_selected_config().model_id,
                "memory_usage_gb": self.model_memory_usage.get(task_type, 0) / 1024**3,
                "load_time": self.model_load_times.get(task_type),
            }
        return result

    def get_model_config(self, task_type: str) -> TaskConfig | None:
        """Get configuration for a task type."""
        return self.tasks.get(task_type)

    async def set_selected_model(self, task_type: str, model_name: str) -> None:
        """Change the selected model for a task type."""
        if task_type not in self.tasks:
            raise ValueError(f"Invalid task type: {task_type}")

        task_config = self.tasks[task_type]
        if model_name not in task_config.options:
            raise ValueError(f"Invalid model name: {model_name} for task {task_type}")

        old_selection = task_config.selected
        task_config.selected = model_name
        self.config["models"][task_type]["selected"] = model_name

        logger.info(f"Changed {task_type} model from {old_selection} to {model_name}")

        if task_type in self.loaded_models:
            await self.unload_model(task_type)
            await self.load_model(task_type)

    def validate_memory_budget(self) -> dict[str, Any]:
        """Validate that all selected models fit in available memory."""
        total_memory = self.get_total_ram() if self.cpu_only_mode else self.get_total_vram()

        total_required = 0
        model_requirements: dict[str, dict[str, Any]] = {}

        for task_type, task_config in self.tasks.items():
            model_config = task_config.get_selected_config()

            if self.cpu_only_mode and not model_config.cpu_compatible:
                continue

            if self.cpu_only_mode:
                memory_gb = model_config.cpu_memory_gb
                memory_bytes = model_config.cpu_memory_bytes
            else:
                memory_gb = model_config.vram_gb
                memory_bytes = model_config.vram_bytes

            model_requirements[task_type] = {
                "model_id": model_config.model_id,
                "vram_gb": memory_gb,
                "cpu_compatible": model_config.cpu_compatible,
            }
            total_required += memory_bytes

        threshold = self.inference_config.offload_threshold
        max_allowed = int(total_memory * threshold)

        result: dict[str, Any] = {
            "valid": total_required <= max_allowed,
            "total_vram_gb": total_memory / 1024**3 if not self.cpu_only_mode else 0,
            "total_required_gb": total_required / 1024**3,
            "threshold": threshold,
            "max_allowed_gb": max_allowed / 1024**3,
            "model_requirements": model_requirements,
            "cpu_only_mode": self.cpu_only_mode,
            "device": self.device,
        }

        if self.cpu_only_mode:
            result["total_ram_gb"] = total_memory / 1024**3

        return result

    async def warmup_models(self) -> None:
        """Load all selected models if warmup_on_startup is enabled."""
        if not self.inference_config.warmup_on_startup:
            logger.info("Warmup disabled, skipping model loading")
            return

        logger.info("Warming up all selected models")
        for task_type in self.tasks:
            try:
                await self.load_model(task_type)
            except Exception as e:
                logger.error(f"Failed to warmup {task_type}: {e}")

    def is_external_api(self, task_type: str) -> bool:
        """Check if a task uses an external API model."""
        if task_type not in self.tasks:
            raise ValueError(f"Invalid task type: {task_type}")

        model_config = self.tasks[task_type].get_selected_config()
        return model_config.framework == "external_api"

    def get_external_api_config(self, task_type: str) -> ExternalAPIConfigDTO:
        """Get external API configuration for a task."""
        if not self.is_external_api(task_type):
            raise ValueError(f"Task {task_type} does not use external API")

        model_config = self.tasks[task_type].get_selected_config()

        if not model_config.provider or not model_config.api_endpoint:
            raise ValueError(f"External API model {task_type} missing provider or endpoint")

        api_key_var = f"{model_config.provider.upper()}_API_KEY"
        api_key = os.getenv(api_key_var)

        if model_config.requires_api_key and not api_key:
            raise ValueError(f"Missing API key: {api_key_var} environment variable not set")

        return ExternalAPIConfigDTO(
            api_key=api_key or "",
            api_endpoint=model_config.api_endpoint,
            model_id=model_config.model_id,
            provider=model_config.provider,
            timeout=30,
            max_retries=3,
        )

    async def shutdown(self) -> None:
        """Unload all models and clean up resources."""
        logger.info("Shutting down ModelManager")
        for task_type in list(self.loaded_models.keys()):
            await self.unload_model(task_type)
