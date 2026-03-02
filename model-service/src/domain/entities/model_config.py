"""Model configuration domain entities.

This module defines entities for representing model configurations,
task configurations, and inference settings.
"""

from dataclasses import dataclass, field
from typing import Any

from src.domain.types import DeviceType, ExternalAPIProvider, InferenceFramework


@dataclass
class ModelConfig:
    """Configuration for a single model variant.

    Parameters
    ----------
    model_id : str
        Hugging Face model identifier or external API model name.
    framework : InferenceFramework
        Inference framework to use.
    vram_gb : float
        VRAM requirement in GB (0 for CPU-only or external APIs).
    cpu_memory_gb : float
        RAM requirement in GB for CPU inference.
    cpu_compatible : bool
        Whether model can run on CPU without GPU.
    speed : str
        Speed category (fast, medium, slow).
    description : str
        Human-readable description.
    quantization : str | None
        Quantization method (4bit, 8bit, awq, etc).
    fps : int | None
        Processing speed in frames per second.
    provider : ExternalAPIProvider | None
        External API provider.
    api_endpoint : str | None
        API endpoint URL for external APIs.
    requires_api_key : bool
        Whether model requires API key.
    """

    model_id: str
    framework: str
    vram_gb: float = 0.0
    cpu_memory_gb: float = 0.0
    cpu_compatible: bool = False
    speed: str = "medium"
    description: str = ""
    quantization: str | None = None
    fps: int | None = None
    provider: str | None = None
    api_endpoint: str | None = None
    requires_api_key: bool = False

    @property
    def vram_bytes(self) -> int:
        """VRAM requirement in bytes."""
        return int(self.vram_gb * 1024 * 1024 * 1024)

    @property
    def cpu_memory_bytes(self) -> int:
        """CPU memory requirement in bytes."""
        return int(self.cpu_memory_gb * 1024 * 1024 * 1024)

    @property
    def is_external_api(self) -> bool:
        """Check if model uses external API."""
        return self.framework == "external_api"

    @property
    def is_local(self) -> bool:
        """Check if model runs locally."""
        return not self.is_external_api

    def memory_for_device(self, device: DeviceType) -> float:
        """Get memory requirement for specified device.

        Parameters
        ----------
        device : DeviceType
            Target device type.

        Returns
        -------
        float
            Memory requirement in GB.
        """
        if device == "cpu":
            return self.cpu_memory_gb
        return self.vram_gb

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation.

        Returns
        -------
        dict[str, Any]
            Dictionary representation.
        """
        return {
            "model_id": self.model_id,
            "framework": self.framework,
            "vram_gb": self.vram_gb,
            "cpu_memory_gb": self.cpu_memory_gb,
            "cpu_compatible": self.cpu_compatible,
            "speed": self.speed,
            "description": self.description,
            "quantization": self.quantization,
            "fps": self.fps,
            "provider": self.provider,
            "api_endpoint": self.api_endpoint,
            "requires_api_key": self.requires_api_key,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ModelConfig":
        """Create from dictionary representation.

        Parameters
        ----------
        data : dict[str, Any]
            Dictionary with model config data.

        Returns
        -------
        ModelConfig
            New model config instance.
        """
        return cls(
            model_id=data["model_id"],
            framework=data["framework"],
            vram_gb=data.get("vram_gb", 0.0),
            cpu_memory_gb=data.get("cpu_memory_gb", 0.0),
            cpu_compatible=data.get("cpu_compatible", False),
            speed=data.get("speed", "medium"),
            description=data.get("description", ""),
            quantization=data.get("quantization"),
            fps=data.get("fps"),
            provider=data.get("provider"),
            api_endpoint=data.get("api_endpoint"),
            requires_api_key=data.get("requires_api_key", False),
        )


@dataclass
class TaskConfig:
    """Configuration for a task type with multiple model options.

    Parameters
    ----------
    task_name : str
        Name of the task.
    selected : str
        Currently selected model name.
    options : dict[str, ModelConfig]
        Available model options.
    """

    task_name: str
    selected: str
    options: dict[str, ModelConfig] = field(default_factory=dict)

    @property
    def selected_config(self) -> ModelConfig:
        """Get the currently selected model configuration."""
        return self.options[self.selected]

    @property
    def available_models(self) -> list[str]:
        """Get list of available model names."""
        return list(self.options.keys())

    def is_valid_selection(self, model_name: str) -> bool:
        """Check if a model name is a valid option.

        Parameters
        ----------
        model_name : str
            Model name to check.

        Returns
        -------
        bool
            True if model is a valid option.
        """
        return model_name in self.options

    def get_cpu_compatible_options(self) -> dict[str, ModelConfig]:
        """Get models that can run on CPU.

        Returns
        -------
        dict[str, ModelConfig]
            CPU-compatible model options.
        """
        return {
            name: config
            for name, config in self.options.items()
            if config.cpu_compatible
        }

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation.

        Returns
        -------
        dict[str, Any]
            Dictionary representation.
        """
        return {
            "selected": self.selected,
            "options": {
                name: config.to_dict() for name, config in self.options.items()
            },
        }


@dataclass
class InferenceConfig:
    """Global inference configuration settings.

    Parameters
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

    max_memory_per_model: str = "auto"
    offload_threshold: float = 0.85
    warmup_on_startup: bool = False
    default_batch_size: int = 1
    max_batch_size: int = 8

    def __post_init__(self) -> None:
        """Validate configuration values."""
        if not 0.0 <= self.offload_threshold <= 1.0:
            raise ValueError(
                f"offload_threshold must be between 0.0 and 1.0, "
                f"got {self.offload_threshold}"
            )
        if self.default_batch_size < 1:
            raise ValueError(
                f"default_batch_size must be at least 1, "
                f"got {self.default_batch_size}"
            )
        if self.max_batch_size < self.default_batch_size:
            raise ValueError(
                f"max_batch_size ({self.max_batch_size}) must be >= "
                f"default_batch_size ({self.default_batch_size})"
            )

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "InferenceConfig":
        """Create from dictionary representation.

        Parameters
        ----------
        data : dict[str, Any]
            Dictionary with inference config data.

        Returns
        -------
        InferenceConfig
            New inference config instance.
        """
        return cls(
            max_memory_per_model=data.get("max_memory_per_model", "auto"),
            offload_threshold=data.get("offload_threshold", 0.85),
            warmup_on_startup=data.get("warmup_on_startup", False),
            default_batch_size=data.get("default_batch_size", 1),
            max_batch_size=data.get("max_batch_size", 8),
        )


@dataclass
class DeviceInfo:
    """Information about available compute devices.

    Parameters
    ----------
    device : DeviceType
        Primary compute device.
    cuda_available : bool
        Whether CUDA is available.
    mps_available : bool
        Whether Apple MPS is available.
    total_vram_gb : float
        Total VRAM in GB (0 if no GPU).
    available_vram_gb : float
        Available VRAM in GB.
    total_ram_gb : float
        Total system RAM in GB.
    available_ram_gb : float
        Available system RAM in GB.
    gpu_name : str | None
        GPU device name.
    cuda_version : str | None
        CUDA version string.
    """

    device: str
    cuda_available: bool
    mps_available: bool
    total_vram_gb: float
    available_vram_gb: float
    total_ram_gb: float
    available_ram_gb: float
    gpu_name: str | None = None
    cuda_version: str | None = None

    @property
    def is_cpu_only(self) -> bool:
        """Check if running in CPU-only mode."""
        return self.device == "cpu"

    @property
    def has_gpu(self) -> bool:
        """Check if GPU is available."""
        return self.cuda_available or self.mps_available

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation.

        Returns
        -------
        dict[str, Any]
            Dictionary representation.
        """
        return {
            "device": self.device,
            "cuda_available": self.cuda_available,
            "mps_available": self.mps_available,
            "total_vram_gb": self.total_vram_gb,
            "available_vram_gb": self.available_vram_gb,
            "total_ram_gb": self.total_ram_gb,
            "available_ram_gb": self.available_ram_gb,
            "gpu_name": self.gpu_name,
            "cuda_version": self.cuda_version,
        }
