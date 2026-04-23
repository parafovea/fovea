"""Model Management Service port definition.

This module defines the interface for model management services.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class ModelOptionOutput:
    """Model option in configuration output."""

    model_id: str
    framework: str
    vram_gb: float
    cpu_memory_gb: float
    cpu_compatible: bool
    speed: str
    description: str
    quantization: str | None = None
    fps: int | None = None
    provider: str | None = None
    api_endpoint: str | None = None
    requires_api_key: bool = False


@dataclass
class TaskConfigOutput:
    """Task configuration in output."""

    selected: str
    options: dict[str, ModelOptionOutput]


@dataclass
class ModelConfigOutput:
    """Complete model configuration output.

    Parameters
    ----------
    models : dict[str, TaskConfigOutput]
        Configuration per task type.
    cuda_available : bool
        Whether CUDA is available.
    device : str
        Current device (cuda, mps, cpu).
    total_vram_gb : float
        Total VRAM in GB.
    total_ram_gb : float
        Total RAM in GB.
    """

    models: dict[str, TaskConfigOutput]
    cuda_available: bool
    device: str
    total_vram_gb: float
    total_ram_gb: float


@dataclass
class ModelRequirementOutput:
    """Model memory requirement in output."""

    model_id: str
    memory_gb: float
    cpu_compatible: bool


@dataclass
class MemoryValidationOutput:
    """Memory validation result output.

    Parameters
    ----------
    valid : bool
        Whether configuration is valid.
    total_vram_gb : float
        Total VRAM in GB.
    total_ram_gb : float | None
        Total RAM in GB (CPU mode).
    total_required_gb : float
        Total memory required.
    threshold : float
        Memory threshold used.
    max_allowed_gb : float
        Maximum allowed memory.
    model_requirements : dict
        Requirements per task.
    cpu_only_mode : bool
        Whether in CPU-only mode.
    device : str
        Current device.
    """

    valid: bool
    total_vram_gb: float
    total_required_gb: float
    threshold: float
    max_allowed_gb: float
    model_requirements: dict[str, ModelRequirementOutput]
    cpu_only_mode: bool
    device: str
    total_ram_gb: float | None = None


@dataclass
class LoadedModelOutput:
    """Loaded model information."""

    model_id: str
    memory_usage_gb: float
    load_time: float


@dataclass
class ModelStatusOutput:
    """Model service status output.

    Parameters
    ----------
    loaded_models : dict[str, LoadedModelOutput]
        Currently loaded models.
    cuda_available : bool
        Whether CUDA is available.
    device : str
        Current device.
    vram_used_gb : float
        VRAM currently used.
    vram_available_gb : float
        VRAM available.
    ram_used_gb : float
        RAM currently used.
    ram_available_gb : float
        RAM available.
    """

    loaded_models: dict[str, LoadedModelOutput]
    cuda_available: bool
    device: str
    vram_used_gb: float
    vram_available_gb: float
    ram_used_gb: float
    ram_available_gb: float


class IModelManagementService(ABC):
    """Interface for model management services.

    Implementors provide model configuration and lifecycle management.
    """

    @abstractmethod
    async def get_config(self) -> ModelConfigOutput:
        """Get complete model configuration.

        Returns
        -------
        ModelConfigOutput
            Current configuration with device info.

        Raises
        ------
        ConfigurationError
            If configuration cannot be loaded.
        """
        pass

    @abstractmethod
    async def validate_memory(self) -> MemoryValidationOutput:
        """Validate memory budget for selected models.

        Returns
        -------
        MemoryValidationOutput
            Validation results.
        """
        pass

    @abstractmethod
    async def get_status(self) -> ModelStatusOutput:
        """Get current model service status.

        Returns
        -------
        ModelStatusOutput
            Status with loaded models and memory info.
        """
        pass

    @abstractmethod
    async def select_model(self, task_type: str, model_name: str) -> None:
        """Select a model for a task type.

        Parameters
        ----------
        task_type : str
            Task type to update.
        model_name : str
            Model name to select.

        Raises
        ------
        InvalidTaskTypeError
            If task type is invalid.
        ValueError
            If model name is not a valid option.
        """
        pass

    @abstractmethod
    async def load_model(self, task_type: str) -> None:
        """Load a model for a task type.

        Parameters
        ----------
        task_type : str
            Task type to load model for.

        Raises
        ------
        InvalidTaskTypeError
            If task type is invalid.
        ModelLoadError
            If model loading fails.
        InsufficientMemoryError
            If not enough memory.
        """
        pass

    @abstractmethod
    async def unload_model(self, task_type: str) -> None:
        """Unload a model for a task type.

        Parameters
        ----------
        task_type : str
            Task type to unload model for.
        """
        pass
