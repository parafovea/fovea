"""Torch-backed implementation of :class:`IModelCapabilityProbe`."""

from __future__ import annotations

import psutil
import torch

from src.application.ports.outbound.model_capability import IModelCapabilityProbe


class TorchModelCapabilityProbe(IModelCapabilityProbe):
    """Capability probe backed by :mod:`torch`."""

    def is_cuda_available(self) -> bool:
        """Return True if a CUDA GPU is available."""
        return bool(torch.cuda.is_available())

    def is_mps_available(self) -> bool:
        """Return True if Apple Silicon MPS is available."""
        return bool(hasattr(torch.backends, "mps") and torch.backends.mps.is_available())

    def device_count(self) -> int:
        """Return the number of CUDA devices available."""
        if not self.is_cuda_available():
            return 0
        return int(torch.cuda.device_count())

    def total_vram_bytes(self) -> int:
        """Return total VRAM in bytes."""
        if not self.is_cuda_available():
            return 0
        device = torch.cuda.current_device()
        return int(torch.cuda.get_device_properties(device).total_memory)

    def available_vram_bytes(self) -> int:
        """Return available VRAM in bytes."""
        if not self.is_cuda_available():
            return 0
        device = torch.cuda.current_device()
        total = torch.cuda.get_device_properties(device).total_memory
        allocated = torch.cuda.memory_allocated(device)
        return int(total - allocated)

    def allocated_vram_bytes(self) -> int:
        """Return currently allocated VRAM in bytes."""
        if not self.is_cuda_available():
            return 0
        return int(torch.cuda.memory_allocated())

    def total_ram_bytes(self) -> int:
        """Return total system RAM in bytes."""
        return int(psutil.virtual_memory().total)

    def available_ram_bytes(self) -> int:
        """Return available system RAM in bytes."""
        return int(psutil.virtual_memory().available)

    def empty_cache(self) -> None:
        """Release cached VRAM."""
        if self.is_cuda_available():
            torch.cuda.empty_cache()

    def detect_device(self) -> str:
        """Return the best available device."""
        if self.is_cuda_available():
            return "cuda"
        if self.is_mps_available():
            return "mps"
        return "cpu"
