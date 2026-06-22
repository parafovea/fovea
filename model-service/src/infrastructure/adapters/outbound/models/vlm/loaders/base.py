"""Shared base for Vision Language Model loaders.

This module holds the framework-agnostic pieces every concrete VLM loader
builds on: the quantization and framework enums, the :class:`VLMConfig`
dataclass, the :class:`VLMLoader` abstract base, the architecture-keyed
:data:`vlm_registry`, and the :func:`create_vlm_loader` factory.

Concrete loaders live in sibling modules and register against the Pydantic
architecture subclass they implement via ``@vlm_registry.register(...)``.
The factory dispatches purely through that registry; it has no knowledge of
specific model identifiers, weights checkpoint filenames, or YAML strings.
The only legitimate dispatch keys are :class:`InferenceFramework` (for the
framework-level pre-dispatch into the llama.cpp GGUF backend) and the
architecture Pydantic class itself.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING, Any

import torch
from transformers import BitsAndBytesConfig

from src.infrastructure.adapters.outbound.models.registry import LoaderRegistry

if TYPE_CHECKING:
    from PIL import Image

    from src.domain.entities.architectures import VLMArchitecture

logger = logging.getLogger(__name__)


class QuantizationType(StrEnum):
    """Supported quantization types for model compression."""

    NONE = "none"
    FOUR_BIT = "4bit"
    EIGHT_BIT = "8bit"
    AWQ = "awq"


class InferenceFramework(StrEnum):
    """Supported inference frameworks for model execution."""

    SGLANG = "sglang"
    VLLM = "vllm"
    TRANSFORMERS = "transformers"
    LLAMA_CPP = "llama_cpp"
    NEMO = "nemo"  # NVIDIA NeMo (Canary, Parakeet)


@dataclass
class VLMConfig:
    """Configuration for Vision Language Model loading and inference.

    Parameters
    ----------
    model_id : str
        HuggingFace model identifier or local path.
    quantization : QuantizationType
        Quantization strategy to apply.
    framework : InferenceFramework
        Inference framework to use for model execution.
    max_memory_gb : int | None, default=None
        Maximum GPU memory to allocate in GB. If None, uses all available.
    device : str, default="cuda"
        Device to load the model on.
    trust_remote_code : bool, default=True
        Whether to trust remote code from HuggingFace.
    """

    model_id: str
    quantization: QuantizationType = QuantizationType.FOUR_BIT
    framework: InferenceFramework = InferenceFramework.SGLANG
    max_memory_gb: int | None = None
    device: str = "cuda"
    trust_remote_code: bool = True


vlm_registry: LoaderRegistry[VLMArchitecture, VLMLoader] = LoaderRegistry(family="vlm")
"""Architecture-keyed registry of VLM loader classes.

Loader classes register themselves in sibling modules with
``@vlm_registry.register(ArchitectureClass)``. :func:`create_vlm_loader`
looks up the loader by ``type(architecture)`` and instantiates it with
the architecture model and the framework-level :class:`VLMConfig`.
"""


class VLMLoader(ABC):
    """Abstract base class for Vision Language Model loaders.

    All VLM loaders must implement the load and generate methods.
    """

    def __init__(self, arch: VLMArchitecture, config: VLMConfig) -> None:
        """Initialize the VLM loader with its architecture and configuration.

        Parameters
        ----------
        arch : VLMArchitecture
            Parsed architecture entry the loader was registered for. Subclasses
            may introspect their own architecture subclass for per-family
            hyperparameters; the base class keeps it as a typed reference so
            the registry contract holds end-to-end.
        config : VLMConfig
            Framework-level configuration (model id, quantization, framework).
        """
        self.arch = arch
        self.config = config
        self.model = None
        self.processor = None
        self.tokenizer = None

    @abstractmethod
    def load(self) -> None:
        """Load the model into memory with configured settings.

        Raises
        ------
        RuntimeError
            If model loading fails.
        """
        pass

    @abstractmethod
    def generate(
        self,
        images: list[Image.Image],
        prompt: str,
        max_new_tokens: int = 512,
        temperature: float = 0.7,
    ) -> str:
        """Generate text response from images and prompt.

        Parameters
        ----------
        images : list[Image.Image]
            List of PIL images to process.
        prompt : str
            Text prompt for the model.
        max_new_tokens : int, default=512
            Maximum number of tokens to generate.
        temperature : float, default=0.7
            Sampling temperature for generation.

        Returns
        -------
        str
            Generated text response.

        Raises
        ------
        RuntimeError
            If generation fails or model is not loaded.
        """
        pass

    def unload(self) -> None:
        """Unload the model from memory to free GPU resources."""
        if self.model is not None:
            del self.model
            self.model = None
        if self.processor is not None:  # type: ignore[unreachable]
            del self.processor
            self.processor = None
        if self.tokenizer is not None:  # type: ignore[unreachable]
            del self.tokenizer
            self.tokenizer = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("Model unloaded and memory cleared")

    def _get_quantization_config(self) -> Any:
        """Create quantization configuration for model loading.

        Returns
        -------
        BitsAndBytesConfig | None
            Quantization config for bitsandbytes, or None if no quantization.
        """
        if self.config.quantization == QuantizationType.FOUR_BIT:
            return BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.bfloat16,
                bnb_4bit_use_double_quant=True,
                bnb_4bit_quant_type="nf4",
            )
        if self.config.quantization == QuantizationType.EIGHT_BIT:
            return BitsAndBytesConfig(
                load_in_8bit=True,
                bnb_8bit_compute_dtype=torch.bfloat16,
            )
        return None


def create_vlm_loader(architecture: VLMArchitecture, config: VLMConfig) -> VLMLoader:
    """Create the VLM loader registered for one architecture.

    Dispatch is pure: the architecture's concrete Pydantic class is the only
    key consulted in the registry path. The single framework-level branch
    below is intentional: GGUF inference goes through llama-cpp-python no
    matter which architecture the GGUF was originally trained as, so the
    framework discriminator on :class:`VLMConfig` selects the backend before
    architecture-keyed dispatch even applies.

    Parameters
    ----------
    architecture : VLMArchitecture
        Parsed architecture entry from the model config. The discriminated
        union guarantees the concrete subclass at compile time; the registry
        guarantees a loader is registered for it at runtime.
    config : VLMConfig
        Framework-level configuration for model loading and inference.

    Returns
    -------
    VLMLoader
        Loader instance registered for ``type(architecture)`` (or the
        llama-cpp loader when ``config.framework`` is ``LLAMA_CPP``).

    Raises
    ------
    src.infrastructure.adapters.outbound.models.registry.UnknownArchitectureError
        When no loader is registered for the architecture's concrete class.
    """
    if config.framework == InferenceFramework.LLAMA_CPP:
        from src.infrastructure.adapters.outbound.models.llama_cpp.base import LlamaCppConfig
        from src.infrastructure.adapters.outbound.models.llama_cpp.vlm import LlamaCppVLMLoader

        llama_config = LlamaCppConfig(
            model_id=config.model_id,
            n_ctx=4096,
        )
        return LlamaCppVLMLoader(architecture, llama_config)  # type: ignore[return-value]

    return vlm_registry.create(architecture, config)
