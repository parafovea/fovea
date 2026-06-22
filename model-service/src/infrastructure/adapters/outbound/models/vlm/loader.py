"""Vision Language Model loader with support for multiple VLM architectures.

This module provides a unified interface for loading and running inference with
various Vision Language Models. The shared base (enums, :class:`VLMConfig`, the
:class:`VLMLoader` ABC, the :data:`vlm_registry`, and the
:func:`create_vlm_loader` factory) lives in :mod:`.loaders.base`; each concrete
loader lives in its own module under :mod:`.loaders` and registers against the
Pydantic architecture subclass it implements via ``@vlm_registry.register(...)``.

This module aggregates those pieces into the public surface. It imports each
concrete loader module for its registration side effect, so importing this
module registers every loader exactly as before the split. The
:func:`create_vlm_loader` factory dispatches purely through :data:`vlm_registry`.

The factory has no knowledge of specific model identifiers, weights checkpoint
filenames, or YAML strings. The only legitimate dispatch keys are
:class:`InferenceFramework` (for the framework-level pre-dispatch into the
llama.cpp GGUF backend) and the architecture Pydantic class itself.
"""

from __future__ import annotations

# Re-exported transformers symbols. Concrete loaders import these from
# transformers directly; the names are re-exported here so the public
# module surface and existing patch targets (e.g.
# ``...vlm.loader.AutoProcessor``) keep resolving after the split.
from transformers import (
    AutoModel,
    AutoModelForImageTextToText,
    AutoProcessor,
    AutoTokenizer,
    BitsAndBytesConfig,
    Qwen2VLForConditionalGeneration,
)

from src.infrastructure.adapters.outbound.models.vlm.loaders.base import (
    InferenceFramework,
    QuantizationType,
    VLMConfig,
    VLMLoader,
    create_vlm_loader,
    vlm_registry,
)

# Importing each concrete loader module runs its
# ``@vlm_registry.register(...)`` decorator. These eager imports are the
# only way the loaders enter the registry, so they are intentional and
# load-bearing.
from src.infrastructure.adapters.outbound.models.vlm.loaders.gemma3 import Gemma3Loader
from src.infrastructure.adapters.outbound.models.vlm.loaders.internvl3 import InternVL3Loader
from src.infrastructure.adapters.outbound.models.vlm.loaders.llama4_maverick import (
    Llama4MaverickLoader,
)
from src.infrastructure.adapters.outbound.models.vlm.loaders.pixtral_large import PixtralLargeLoader
from src.infrastructure.adapters.outbound.models.vlm.loaders.qwen25_vl import Qwen25VLLoader
from src.infrastructure.adapters.outbound.models.vlm.loaders.small_vlm import SmallVLMLoader

__all__ = [
    "AutoModel",
    "AutoModelForImageTextToText",
    "AutoProcessor",
    "AutoTokenizer",
    "BitsAndBytesConfig",
    "Gemma3Loader",
    "InferenceFramework",
    "InternVL3Loader",
    "Llama4MaverickLoader",
    "PixtralLargeLoader",
    "QuantizationType",
    "Qwen2VLForConditionalGeneration",
    "Qwen25VLLoader",
    "SmallVLMLoader",
    "VLMConfig",
    "VLMLoader",
    "create_vlm_loader",
    "vlm_registry",
]
