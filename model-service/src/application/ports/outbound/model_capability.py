"""Model capability probe port definition.

Application-facing port for probing hardware capabilities relevant to model
loading decisions. Implementations live in the infrastructure layer and may
be backed by torch, psutil, or other system libraries.
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class IModelCapabilityProbe(ABC):
    """Port for probing hardware model-hosting capabilities."""

    @abstractmethod
    def is_cuda_available(self) -> bool:
        """Return True if a CUDA GPU is available."""
        pass

    @abstractmethod
    def is_mps_available(self) -> bool:
        """Return True if Apple Silicon MPS is available."""
        pass

    @abstractmethod
    def device_count(self) -> int:
        """Return the number of CUDA devices available (0 if none)."""
        pass

    @abstractmethod
    def total_vram_bytes(self) -> int:
        """Return total VRAM in bytes (0 if no GPU)."""
        pass

    @abstractmethod
    def available_vram_bytes(self) -> int:
        """Return available VRAM in bytes (0 if no GPU)."""
        pass

    @abstractmethod
    def allocated_vram_bytes(self) -> int:
        """Return currently allocated VRAM in bytes (0 if no GPU)."""
        pass

    @abstractmethod
    def total_ram_bytes(self) -> int:
        """Return total system RAM in bytes."""
        pass

    @abstractmethod
    def available_ram_bytes(self) -> int:
        """Return available system RAM in bytes."""
        pass

    @abstractmethod
    def empty_cache(self) -> None:
        """Release cached memory on the accelerator (no-op if no GPU)."""
        pass

    @abstractmethod
    def detect_device(self) -> str:
        """Return the best available device identifier.

        Returns
        -------
        str
            One of "cuda", "mps", or "cpu".
        """
        pass
