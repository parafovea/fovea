"""Model management with dynamic loading, memory budget validation, and LRU eviction.

This module provides a ModelManager class that handles loading and unloading
of AI models based on available GPU memory. Models are loaded on demand and
automatically evicted when memory pressure occurs.
"""

import logging
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any

import torch
import yaml
from opentelemetry import trace

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)


class ModelConfig:
    """Configuration for a single model variant.

    Attributes
    ----------
    model_id : str
        Hugging Face model identifier.
    framework : str
        Inference framework (sglang, vllm, pytorch).
    vram_gb : float
        VRAM requirement in GB.
    quantization : str | None
        Quantization method (4bit, 8bit, awq, etc).
    speed : str
        Speed category (fast, medium, slow).
    description : str
        Human-readable description.
    fps : int | None
        Processing speed in frames per second (for vision models).
    """

    def __init__(self, config_dict: dict[str, Any]) -> None:
        """Initialize model configuration from dictionary.

        Parameters
        ----------
        config_dict : dict[str, Any]
            Dictionary containing model configuration parameters.
        """
        self.model_id: str = config_dict["model_id"]
        self.framework: str = config_dict["framework"]
        self.vram_gb: float = config_dict.get("vram_gb", 0)
        self.quantization: str | None = config_dict.get("quantization")
        self.speed: str = config_dict.get("speed", "medium")
        self.description: str = config_dict.get("description", "")
        self.fps: int | None = config_dict.get("fps")

    @property
    def vram_bytes(self) -> int:
        """Convert VRAM requirement from GB to bytes.

        Returns
        -------
        int
            VRAM requirement in bytes.
        """
        return int(self.vram_gb * 1024 * 1024 * 1024)


class TaskConfig:
    """Configuration for a task type with multiple model options.

    Attributes
    ----------
    task_name : str
        Name of the task.
    selected : str
        Currently selected model name.
    options : dict[str, ModelConfig]
        Available model options for this task.
    """

    def __init__(self, task_name: str, config_dict: dict[str, Any]) -> None:
        """Initialize task configuration from dictionary.

        Parameters
        ----------
        task_name : str
            Name of the task (e.g., "video_summarization").
        config_dict : dict[str, Any]
            Dictionary containing task configuration.
        """
        self.task_name = task_name
        self.selected = config_dict["selected"]
        self.options: dict[str, ModelConfig] = {
            name: ModelConfig(opt_dict) for name, opt_dict in config_dict["options"].items()
        }

    def get_selected_config(self) -> ModelConfig:
        """Get the currently selected model configuration.

        Returns
        -------
        ModelConfig
            Configuration for the selected model.
        """
        return self.options[self.selected]


class InferenceConfig:
    """Global inference configuration settings.

    Attributes
    ----------
    max_memory_per_model : str
        Maximum memory per model ('auto' or specific value).
    offload_threshold : float
        Memory usage threshold for offloading (0.0 to 1.0).
    warmup_on_startup : bool
        Whether to load all models on startup.
    default_batch_size : int
        Default batch size for inference.
    max_batch_size : int
        Maximum batch size for inference.
    """

    def __init__(self, config_dict: dict[str, Any]) -> None:
        """Initialize inference configuration from dictionary.

        Parameters
        ----------
        config_dict : dict[str, Any]
            Dictionary containing inference configuration.
        """
        self.max_memory_per_model = config_dict.get("max_memory_per_model", "auto")
        self.offload_threshold: float = config_dict.get("offload_threshold", 0.85)
        self.warmup_on_startup: bool = config_dict.get("warmup_on_startup", False)
        self.default_batch_size: int = config_dict.get("default_batch_size", 1)
        self.max_batch_size: int = config_dict.get("max_batch_size", 8)


class ModelManager:
    """Manages loading, unloading, and memory management of AI models.

    This class handles dynamic model loading based on memory availability,
    implements LRU eviction when memory pressure occurs, and provides
    utilities for VRAM monitoring.

    Attributes
    ----------
    config_path : Path
        Path to models.yaml configuration file.
    config : dict[str, Any]
        Parsed configuration dictionary.
    loaded_models : OrderedDict[str, Any]
        Currently loaded models (LRU ordered).
    model_load_times : dict[str, float]
        Timestamp when each model was loaded.
    model_memory_usage : dict[str, int]
        Actual memory usage per model in bytes.
    tasks : dict[str, TaskConfig]
        Task configurations.
    inference_config : InferenceConfig
        Global inference settings.
    """

    def __init__(self, config_path: str) -> None:
        """Initialize ModelManager with configuration file.

        Parameters
        ----------
        config_path : str
            Path to models.yaml configuration file.
        """
        self.config_path = Path(config_path)
        self.config = self._load_config()
        self.loaded_models: OrderedDict[str, Any] = OrderedDict()
        self.model_load_times: dict[str, float] = {}
        self.model_memory_usage: dict[str, int] = {}

        logger.info(f"ModelManager initialized with config from {config_path}")

    def _load_config(self) -> dict[str, Any]:
        """Load configuration from YAML file.

        Returns
        -------
        dict[str, Any]
            Dictionary containing parsed configuration.

        Raises
        ------
        FileNotFoundError
            If configuration file does not exist.
        yaml.YAMLError
            If configuration file is invalid.
        """
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

    def get_available_vram(self) -> int:
        """
        Get available GPU memory in bytes.

        Returns:
            Available VRAM in bytes
        """
        if not torch.cuda.is_available():
            return 0

        device = torch.cuda.current_device()
        total = torch.cuda.get_device_properties(device).total_memory
        allocated = torch.cuda.memory_allocated(device)
        return total - allocated

    def get_total_vram(self) -> int:
        """
        Get total GPU memory in bytes.

        Returns:
            Total VRAM in bytes
        """
        if not torch.cuda.is_available():
            return 0

        device = torch.cuda.current_device()
        return torch.cuda.get_device_properties(device).total_memory

    def get_memory_usage_percentage(self) -> float:
        """
        Get current GPU memory usage as percentage.

        Returns:
            Memory usage percentage (0.0 to 1.0)
        """
        total = self.get_total_vram()
        if total == 0:
            return 0.0

        allocated = torch.cuda.memory_allocated()
        return allocated / total

    def check_memory_available(self, required_bytes: int) -> bool:
        """
        Check if sufficient memory is available for model loading.

        Args:
            required_bytes: Required memory in bytes

        Returns:
            True if sufficient memory is available
        """
        available = self.get_available_vram()
        return available >= required_bytes

    def get_lru_model(self) -> str | None:
        """
        Get least recently used model identifier.

        Returns:
            Task name of LRU model, or None if no models loaded
        """
        if not self.loaded_models:
            return None
        return next(iter(self.loaded_models))

    @tracer.start_as_current_span("evict_lru_model")
    async def evict_lru_model(self) -> str | None:
        """
        Evict the least recently used model from memory.

        Returns:
            Task name of evicted model, or None if no models to evict
        """
        lru_task = self.get_lru_model()
        if lru_task is None:
            logger.warning("No models to evict")
            return None

        logger.info(f"Evicting LRU model: {lru_task}")
        await self.unload_model(lru_task)
        return lru_task

    @tracer.start_as_current_span("unload_model")
    async def unload_model(self, task_type: str) -> None:
        """
        Unload a model from memory.

        Args:
            task_type: Task type of model to unload
        """
        if task_type not in self.loaded_models:
            logger.warning(f"Model {task_type} not loaded")
            return

        logger.info(f"Unloading model: {task_type}")
        del self.loaded_models[task_type]
        del self.model_load_times[task_type]
        del self.model_memory_usage[task_type]

        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        logger.info(f"Model {task_type} unloaded successfully")

    @tracer.start_as_current_span("load_model")
    async def load_model(self, task_type: str) -> Any:
        """
        Load a model for the specified task type.

        This method loads the selected model for the task, handling memory
        management and eviction if necessary.

        Args:
            task_type: Task type to load model for

        Returns:
            Loaded model object

        Raises:
            ValueError: If task type is invalid or model cannot be loaded
            RuntimeError: If insufficient memory after eviction attempts
        """
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

        memory_before = torch.cuda.memory_allocated() if torch.cuda.is_available() else 0

        model = await self._load_model_implementation(task_type, model_config)

        memory_after = torch.cuda.memory_allocated() if torch.cuda.is_available() else 0
        actual_memory = memory_after - memory_before

        self.loaded_models[task_type] = model
        self.model_load_times[task_type] = time.time()
        self.model_memory_usage[task_type] = actual_memory

        logger.info(
            f"Model {task_type} loaded successfully "
            f"(actual memory: {actual_memory / 1024**3:.2f}GB)"
        )

        return model

    async def _load_model_implementation(self, task_type: str, model_config: ModelConfig) -> Any:
        """
        Load model implementation based on framework.

        This is a placeholder that will be replaced with actual model loading
        logic when model loaders are implemented in Phase 3.

        Args:
            task_type: Task type being loaded
            model_config: Model configuration

        Returns:
            Loaded model object
        """
        logger.info(f"Loading {model_config.framework} model: {model_config.model_id}")

        return {
            "task_type": task_type,
            "model_id": model_config.model_id,
            "framework": model_config.framework,
            "config": model_config,
        }

    async def get_model(self, task_type: str) -> Any:
        """
        Get model for task type, loading if necessary.

        Args:
            task_type: Task type to get model for

        Returns:
            Loaded model object
        """
        if task_type in self.loaded_models:
            self.loaded_models.move_to_end(task_type)
            return self.loaded_models[task_type]

        return await self.load_model(task_type)

    def get_loaded_models(self) -> dict[str, dict[str, Any]]:
        """
        Get information about currently loaded models.

        Returns:
            Dictionary mapping task types to model information
        """
        result = {}
        for task_type in self.loaded_models:
            result[task_type] = {
                "model_id": self.tasks[task_type].get_selected_config().model_id,
                "memory_usage_gb": self.model_memory_usage.get(task_type, 0) / 1024**3,
                "load_time": self.model_load_times.get(task_type),
            }
        return result

    def get_model_config(self, task_type: str) -> TaskConfig | None:
        """
        Get configuration for a task type.

        Args:
            task_type: Task type to get configuration for

        Returns:
            Task configuration, or None if task type is invalid
        """
        return self.tasks.get(task_type)

    async def set_selected_model(self, task_type: str, model_name: str) -> None:
        """
        Change the selected model for a task type.

        If the task's model is currently loaded, it will be unloaded and the
        new model will be loaded.

        Args:
            task_type: Task type to update
            model_name: Name of model option to select

        Raises:
            ValueError: If task type or model name is invalid
        """
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
        """
        Validate that all selected models can fit in available memory.

        Returns:
            Dictionary with validation results
        """
        total_vram = self.get_total_vram()
        total_required = 0
        model_requirements = {}

        for task_type, task_config in self.tasks.items():
            model_config = task_config.get_selected_config()
            model_requirements[task_type] = {
                "model_id": model_config.model_id,
                "vram_gb": model_config.vram_gb,
            }
            total_required += model_config.vram_bytes

        threshold = self.inference_config.offload_threshold
        max_allowed = int(total_vram * threshold)

        return {
            "valid": total_required <= max_allowed,
            "total_vram_gb": total_vram / 1024**3,
            "total_required_gb": total_required / 1024**3,
            "threshold": threshold,
            "max_allowed_gb": max_allowed / 1024**3,
            "model_requirements": model_requirements,
        }

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

    async def shutdown(self) -> None:
        """Unload all models and clean up resources."""
        logger.info("Shutting down ModelManager")
        for task_type in list(self.loaded_models.keys()):
            await self.unload_model(task_type)
