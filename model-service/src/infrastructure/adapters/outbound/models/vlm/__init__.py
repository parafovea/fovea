"""Vision-language model adapters.

This package contains adapters for vision-language models (VLMs) that
implement the IVisionLanguageModel outbound port interface.

Modules
-------
loader
    VLM loader implementations and factory.
"""

from src.infrastructure.adapters.outbound.models.vlm.loader import (
    Gemma3Loader,
    InferenceFramework,
    InternVL3Loader,
    Llama4MaverickLoader,
    PixtralLargeLoader,
    QuantizationType,
    Qwen25VLLoader,
    VLMConfig,
    VLMLoader,
    create_vlm_loader,
)

__all__ = [
    "Gemma3Loader",
    "InferenceFramework",
    "InternVL3Loader",
    "Llama4MaverickLoader",
    "PixtralLargeLoader",
    "QuantizationType",
    "Qwen25VLLoader",
    "VLMConfig",
    "VLMLoader",
    "create_vlm_loader",
]
