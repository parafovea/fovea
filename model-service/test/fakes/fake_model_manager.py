"""Fake model manager for testing.

This module provides a fake model manager that simulates model loading
and configuration without actual GPU memory operations.
"""

from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any


@dataclass
class FakeModelConfig:
    """Fake model configuration.

    Parameters
    ----------
    model_id : str
        Model identifier.
    framework : str
        Inference framework.
    vram_gb : float
        VRAM requirement in GB.
    cpu_memory_gb : float
        CPU memory requirement in GB.
    cpu_compatible : bool
        Whether model is CPU compatible.
    """

    model_id: str = "fake-model"
    framework: str = "pytorch"
    vram_gb: float = 2.0
    cpu_memory_gb: float = 2.0
    cpu_compatible: bool = True
    quantization: str | None = None
    speed: str = "fast"
    description: str = "Fake model for testing"
    provider: str | None = None
    api_endpoint: str | None = None
    requires_api_key: bool = False

    @property
    def vram_bytes(self) -> int:
        """Convert VRAM to bytes."""
        return int(self.vram_gb * 1024 * 1024 * 1024)

    @property
    def cpu_memory_bytes(self) -> int:
        """Convert CPU memory to bytes."""
        return int(self.cpu_memory_gb * 1024 * 1024 * 1024)


@dataclass
class FakeTaskConfig:
    """Fake task configuration.

    Parameters
    ----------
    task_name : str
        Name of the task.
    selected : str
        Selected model name.
    options : dict[str, FakeModelConfig]
        Available model options.
    """

    task_name: str
    selected: str
    options: dict[str, FakeModelConfig] = field(default_factory=dict)

    def get_selected_config(self) -> FakeModelConfig:
        """Get the selected model configuration."""
        return self.options[self.selected]


@dataclass
class FakeModelManagerConfig:
    """Configuration for fake model manager.

    Parameters
    ----------
    device : str
        Simulated device (cpu, cuda, mps).
    total_vram_gb : float
        Simulated total VRAM.
    total_ram_gb : float
        Simulated total RAM.
    fail_on_load : bool
        Whether to fail model loading.
    """

    device: str = "cuda"
    total_vram_gb: float = 24.0
    total_ram_gb: float = 32.0
    fail_on_load: bool = False
    error_message: str = "Simulated model load failure"


class FakeModelManager:
    """Fake model manager for testing.

    Simulates model loading and configuration without actual GPU operations.
    Tracks operations for assertions in tests.

    Parameters
    ----------
    config : FakeModelManagerConfig | None
        Configuration for the fake manager.

    Examples
    --------
    >>> manager = FakeModelManager()
    >>> manager.add_task("video_summarization", "fake-vlm", FakeModelConfig())
    >>> await manager.load_model("video_summarization")
    >>> assert manager.is_loaded("video_summarization")
    """

    def __init__(self, config: FakeModelManagerConfig | None = None) -> None:
        """Initialize the fake model manager."""
        self.config = config or FakeModelManagerConfig()
        self.tasks: dict[str, FakeTaskConfig] = {}
        self.loaded_models: OrderedDict[str, Any] = OrderedDict()
        self.model_load_times: dict[str, float] = {}
        self.model_memory_usage: dict[str, int] = {}
        self._operation_history: list[dict[str, Any]] = []

        # Device detection based on config
        self.device = self.config.device
        self.cpu_only_mode = self.device == "cpu"

    @property
    def operation_history(self) -> list[dict[str, Any]]:
        """Get operation history for assertions."""
        return self._operation_history

    def add_task(
        self,
        task_name: str,
        selected: str,
        model_config: FakeModelConfig,
    ) -> None:
        """Add a task configuration.

        Parameters
        ----------
        task_name : str
            Name of the task.
        selected : str
            Selected model name.
        model_config : FakeModelConfig
            Model configuration.
        """
        if task_name not in self.tasks:
            self.tasks[task_name] = FakeTaskConfig(
                task_name=task_name,
                selected=selected,
                options={},
            )
        self.tasks[task_name].options[selected] = model_config
        self.tasks[task_name].selected = selected

    def get_available_vram(self) -> int:
        """Get simulated available VRAM."""
        used = sum(self.model_memory_usage.values())
        total = int(self.config.total_vram_gb * 1024**3)
        return max(0, total - used)

    def get_total_vram(self) -> int:
        """Get simulated total VRAM."""
        return int(self.config.total_vram_gb * 1024**3)

    def get_available_ram(self) -> int:
        """Get simulated available RAM."""
        used = sum(self.model_memory_usage.values()) if self.cpu_only_mode else 0
        total = int(self.config.total_ram_gb * 1024**3)
        return max(0, total - used)

    def get_total_ram(self) -> int:
        """Get simulated total RAM."""
        return int(self.config.total_ram_gb * 1024**3)

    def is_external_api(self, task_type: str) -> bool:
        """Check if task uses external API."""
        if task_type not in self.tasks:
            return False
        model_config = self.tasks[task_type].get_selected_config()
        return model_config.framework == "external_api"

    async def load_model(self, task_type: str) -> Any:
        """Simulate loading a model.

        Parameters
        ----------
        task_type : str
            Task type to load model for.

        Returns
        -------
        Any
            Fake loaded model dict.

        Raises
        ------
        ValueError
            If task type is invalid.
        RuntimeError
            If fail_on_load is True.
        """
        self._operation_history.append(
            {
                "operation": "load_model",
                "task_type": task_type,
            }
        )

        if task_type not in self.tasks:
            raise ValueError(f"Invalid task type: {task_type}")

        if self.config.fail_on_load:
            raise RuntimeError(self.config.error_message)

        model_config = self.tasks[task_type].get_selected_config()
        fake_model = {
            "task_type": task_type,
            "model_id": model_config.model_id,
            "framework": model_config.framework,
        }

        self.loaded_models[task_type] = fake_model
        self.model_load_times[task_type] = 0.1
        self.model_memory_usage[task_type] = model_config.vram_bytes

        return fake_model

    async def unload_model(self, task_type: str) -> None:
        """Simulate unloading a model.

        Parameters
        ----------
        task_type : str
            Task type to unload model for.
        """
        self._operation_history.append(
            {
                "operation": "unload_model",
                "task_type": task_type,
            }
        )

        if task_type in self.loaded_models:
            del self.loaded_models[task_type]
            del self.model_load_times[task_type]
            del self.model_memory_usage[task_type]

    async def get_model(self, task_type: str) -> Any:
        """Get or load model for task type."""
        if task_type in self.loaded_models:
            self.loaded_models.move_to_end(task_type)
            return self.loaded_models[task_type]
        return await self.load_model(task_type)

    def get_model_config(self, task_type: str) -> FakeTaskConfig | None:
        """Get task configuration."""
        return self.tasks.get(task_type)

    async def set_selected_model(self, task_type: str, model_name: str) -> None:
        """Set selected model for task type."""
        if task_type not in self.tasks:
            raise ValueError(f"Invalid task type: {task_type}")

        task_config = self.tasks[task_type]
        if model_name not in task_config.options:
            raise ValueError(f"Invalid model name: {model_name}")

        task_config.selected = model_name

        if task_type in self.loaded_models:
            await self.unload_model(task_type)
            await self.load_model(task_type)

    def validate_memory_budget(self) -> dict[str, Any]:
        """Validate memory budget."""
        total_memory = self.get_total_ram() if self.cpu_only_mode else self.get_total_vram()

        total_required = sum(self.model_memory_usage.values())
        threshold = 0.85
        max_allowed = int(total_memory * threshold)

        return {
            "valid": total_required <= max_allowed,
            "total_vram_gb": total_memory / 1024**3 if not self.cpu_only_mode else 0,
            "total_ram_gb": total_memory / 1024**3 if self.cpu_only_mode else None,
            "total_required_gb": total_required / 1024**3,
            "threshold": threshold,
            "max_allowed_gb": max_allowed / 1024**3,
            "model_requirements": {},
            "cpu_only_mode": self.cpu_only_mode,
            "device": self.device,
        }

    def get_loaded_models(self) -> dict[str, dict[str, Any]]:
        """Get information about loaded models."""
        return {
            task_type: {
                "model_id": self.tasks[task_type].get_selected_config().model_id,
                "memory_usage_gb": self.model_memory_usage.get(task_type, 0) / 1024**3,
                "load_time": self.model_load_times.get(task_type),
            }
            for task_type in self.loaded_models
        }

    async def shutdown(self) -> None:
        """Shutdown the fake manager."""
        for task_type in list(self.loaded_models.keys()):
            await self.unload_model(task_type)

    def reset(self) -> None:
        """Reset the fake manager state."""
        self.loaded_models.clear()
        self.model_load_times.clear()
        self.model_memory_usage.clear()
        self._operation_history.clear()
