"""Configurable LLM loader with architecture-keyed registry dispatch.

This module hosts the local text-only LLM loader implementations and the
``create_llm_loader`` factory that resolves an :class:`LLMArchitecture`
discriminated-union instance to the right loader class.

Dispatch flow:

  yaml architecture block
    -> Pydantic discriminated union (``LLMArchitecture``)
    -> ``llm_registry.lookup(type(arch))``
    -> loader class (``LLMLoader`` for transformers / sglang, or the
       :class:`LlamaCppLLMLoader` for GGUF via the framework-level
       pre-dispatch in :func:`create_llm_loader`).

The factory NEVER inspects ``config.model_id`` or other free-text
fields. The only legitimate dispatch keys are the architecture
Pydantic class (registry lookup) and ``config.framework`` (the
llama_cpp pre-dispatch, which is a framework decision rather than a
model-identity one).
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

import torch
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    PreTrainedModel,
    PreTrainedTokenizer,
)

from src.domain.entities.architectures import (
    DeepSeekR1Distill,
    DeepSeekV3LLM,
    GLM4,
    Gemma3LLM,
    KimiK2,
    LLMArchitecture,
    Llama3LLM,
    Llama4LLM,
    Phi,
    QwenLLM,
)
from src.infrastructure.adapters.outbound.models.llm.base import (
    GenerationConfig,
    GenerationResult,
    LLMConfig,
    LLMFramework,
)
from src.infrastructure.adapters.outbound.models.registry import LoaderRegistry
from src.infrastructure.observability.telemetry import instrument_method

if TYPE_CHECKING:
    from pathlib import Path

    from src.infrastructure.adapters.outbound.models.llama_cpp.llm import (
        LlamaCppLLMLoader,
    )

__all__ = [
    "GenerationConfig",
    "GenerationResult",
    "LLMConfig",
    "LLMFramework",
    "LLMLoader",
    "create_llm_config_from_dict",
    "create_llm_loader",
    "create_llm_loader_with_fallback",
    "llm_registry",
]


llm_registry: LoaderRegistry[LLMArchitecture, "LLMLoader"] = LoaderRegistry(family="llm")
"""Architecture-keyed loader registry for the local LLM family.

Loader classes register against the LLM architecture subclasses they
implement via ``@llm_registry.register(ArchitectureClass)``. The factory
:func:`create_llm_loader` consults this registry for every non-llama_cpp
local model. External-API architectures (``ClaudeAPI``, ``OpenAIChat``,
``GeminiAPI``, ``GrokAPI``) deliberately do NOT register here; routes
branch to the external-API path before the factory is called.
"""


# The default transformers-backed loader covers every text-LLM family
# the project currently supports under the transformers / sglang
# frameworks. Per-family hyperparameters can later move onto each
# architecture subclass; the loader receives the architecture instance
# as its first constructor argument so it has access to those fields
# without re-reading the YAML.
@llm_registry.register(QwenLLM)
@llm_registry.register(Phi)
@llm_registry.register(DeepSeekR1Distill)
@llm_registry.register(DeepSeekV3LLM)
@llm_registry.register(Llama3LLM)
@llm_registry.register(Llama4LLM)
@llm_registry.register(Gemma3LLM)
@llm_registry.register(KimiK2)
@llm_registry.register(GLM4)
class LLMLoader:
    """Loader for text-only language models with quantization support.

    Handles every text-LLM architecture registered above through the
    ``transformers`` and ``sglang`` frameworks. GGUF / llama.cpp
    inference for the same architectures is served by
    :class:`LlamaCppLLMLoader` via the framework-level pre-dispatch in
    :func:`create_llm_loader`.

    Parameters
    ----------
    arch : LLMArchitecture
        Discriminated-union architecture instance from the parsed YAML.
        Provided as the first positional argument so the registry's
        ``create(arch, *args, **kwargs)`` contract is satisfied; the
        instance is stored for future per-architecture hyperparameter
        access.
    config : LLMConfig
        Framework-level configuration (model id, quantization, tokens).
    cache_dir : Path | None, default=None
        Directory for caching model weights. If None, uses default HF cache.
    """

    def __init__(
        self,
        arch: LLMArchitecture,
        config: LLMConfig,
        cache_dir: Path | None = None,
    ) -> None:
        self.arch = arch
        self.config = config
        self.cache_dir = cache_dir
        self.model: PreTrainedModel | None = None  # type: ignore[no-any-unimported]
        self.tokenizer: PreTrainedTokenizer | None = None  # type: ignore[no-any-unimported]
        self._lock = asyncio.Lock()

    def _create_quantization_config(self) -> BitsAndBytesConfig | None:  # type: ignore[no-any-unimported]
        """Create quantization configuration for model loading.

        Returns
        -------
        BitsAndBytesConfig | None
            Quantization configuration, or None if quantization is disabled.
        """
        if self.config.quantization == "4bit":
            return BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_use_double_quant=True,
                bnb_4bit_quant_type="nf4",
            )
        if self.config.quantization == "8bit":
            return BitsAndBytesConfig(
                load_in_8bit=True,
            )
        return None

    async def load(self) -> None:
        """Load the language model and tokenizer.

        Raises
        ------
        RuntimeError
            If model loading fails due to memory, invalid model ID, or other issues.
        """
        async with self._lock:
            if self.model is not None and self.tokenizer is not None:
                return

            try:
                quantization_config = self._create_quantization_config()

                self.tokenizer = AutoTokenizer.from_pretrained(
                    self.config.model_id,
                    cache_dir=str(self.cache_dir) if self.cache_dir else None,
                    trust_remote_code=True,
                )

                if self.tokenizer.pad_token is None:
                    self.tokenizer.pad_token = self.tokenizer.eos_token

                model_kwargs: dict[str, Any] = {
                    "cache_dir": str(self.cache_dir) if self.cache_dir else None,
                    "trust_remote_code": True,
                    "torch_dtype": torch.float16,
                    "device_map": "auto",
                }

                if quantization_config is not None:
                    model_kwargs["quantization_config"] = quantization_config

                self.model = AutoModelForCausalLM.from_pretrained(
                    self.config.model_id,
                    **model_kwargs,
                )

                self.model.eval()

            except Exception as e:
                raise RuntimeError(f"Failed to load model {self.config.model_id}: {e}") from e

    @instrument_method(task="llm_generate")
    async def generate(
        self,
        prompt: str,
        generation_config: GenerationConfig | None = None,
    ) -> GenerationResult:
        """Generate text from a prompt using the loaded model.

        Parameters
        ----------
        prompt : str
            Input text prompt for generation.
        generation_config : GenerationConfig | None, default=None
            Generation parameters. If None, uses default configuration.

        Returns
        -------
        GenerationResult
            Generated text with metadata (tokens used, finish reason).

        Raises
        ------
        RuntimeError
            If model is not loaded or generation fails.
        """
        if self.model is None or self.tokenizer is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        if generation_config is None:
            generation_config = GenerationConfig()

        try:
            inputs = self.tokenizer(
                prompt,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=self.config.context_length,
            )

            input_device = next(self.model.parameters()).device
            inputs = {k: v.to(input_device) for k, v in inputs.items()}

            with torch.no_grad():
                outputs = self.model.generate(
                    **inputs,
                    max_new_tokens=generation_config.max_tokens,
                    temperature=generation_config.temperature,
                    top_p=generation_config.top_p,
                    do_sample=generation_config.temperature > 0,
                    pad_token_id=self.tokenizer.pad_token_id,
                    eos_token_id=self.tokenizer.eos_token_id,
                )

            input_length = inputs["input_ids"].shape[1]
            generated_tokens = outputs[0][input_length:]
            generated_text = self.tokenizer.decode(generated_tokens, skip_special_tokens=True)

            finish_reason = "eos" if outputs[0][-1] == self.tokenizer.eos_token_id else "length"

            return GenerationResult(
                text=generated_text.strip(),
                tokens_used=len(generated_tokens),
                finish_reason=finish_reason,
            )

        except Exception as e:
            raise RuntimeError(f"Generation failed: {e}") from e

    async def unload(self) -> None:
        """Unload the model from memory."""
        async with self._lock:
            if self.model is not None:
                del self.model
                self.model = None

            if self.tokenizer is not None:
                del self.tokenizer
                self.tokenizer = None

            if torch.cuda.is_available():
                torch.cuda.empty_cache()

    def is_loaded(self) -> bool:
        """Check if the model is currently loaded.

        Returns
        -------
        bool
            True if model and tokenizer are loaded, False otherwise.
        """
        return self.model is not None and self.tokenizer is not None

    def get_memory_usage(self) -> dict[str, int]:
        """Get current GPU memory usage for the model.

        Returns
        -------
        dict[str, int]
            Dictionary with "allocated" and "reserved" memory in bytes.
            Returns zeros if CUDA is not available.
        """
        if not torch.cuda.is_available():
            return {"allocated": 0, "reserved": 0}

        return {
            "allocated": torch.cuda.memory_allocated(),
            "reserved": torch.cuda.memory_reserved(),
        }


def create_llm_config_from_dict(model_dict: dict[str, Any]) -> LLMConfig:
    """Create an LLMConfig from a dictionary (e.g., from YAML).

    Parameters
    ----------
    model_dict : dict[str, Any]
        Dictionary containing model configuration keys.

    Returns
    -------
    LLMConfig
        Configured LLMConfig instance.

    Raises
    ------
    ValueError
        If required keys are missing or framework is invalid.
    """
    required_keys = ["model_id", "quantization", "framework"]
    for key in required_keys:
        if key not in model_dict:
            raise ValueError(f"Missing required key: {key}")

    framework_str = model_dict["framework"]
    try:
        framework = LLMFramework(framework_str)
    except ValueError as e:
        raise ValueError(
            f"Invalid framework: {framework_str}. Must be 'sglang' or 'transformers'."
        ) from e

    return LLMConfig(
        model_id=model_dict["model_id"],
        quantization=model_dict["quantization"],
        framework=framework,
        max_tokens=model_dict.get("max_tokens", 4096),
        temperature=model_dict.get("temperature", 0.7),
        top_p=model_dict.get("top_p", 0.9),
        context_length=model_dict.get("context_length", 131072),
    )


async def create_llm_loader_with_fallback(
    architecture: LLMArchitecture,
    primary_config: LLMConfig,
    fallback_configs: list[LLMConfig],
    cache_dir: Path | None = None,
) -> LLMLoader:
    """Create an LLM loader with automatic fallback to alternative configs.

    All fallback configs share the same architecture as the primary; the
    fallback is over framework-level configuration (smaller quant, lower
    context window) rather than over the model family. Fallback across
    architectures would require independent registry lookups and a new
    contract; that is deliberately out of scope here.

    Parameters
    ----------
    architecture : LLMArchitecture
        Architecture all configs in the cascade share.
    primary_config : LLMConfig
        Primary model configuration to try first.
    fallback_configs : list[LLMConfig]
        List of fallback model configurations.
    cache_dir : Path | None, default=None
        Directory for caching model weights.

    Returns
    -------
    LLMLoader
        Successfully loaded LLM loader.

    Raises
    ------
    RuntimeError
        If all model loading attempts fail.
    """
    configs_to_try = [primary_config, *fallback_configs]

    for i, config in enumerate(configs_to_try):
        try:
            loader = LLMLoader(architecture, config, cache_dir)
            await loader.load()
            return loader
        except Exception as e:
            if i == len(configs_to_try) - 1:
                raise RuntimeError(
                    "All model loading attempts failed. Check GPU memory and model IDs."
                ) from e
            continue

    raise RuntimeError("Unreachable: should have raised error in loop")


def create_llm_loader(
    architecture: LLMArchitecture,
    config: LLMConfig,
    cache_dir: Path | None = None,
) -> LLMLoader | LlamaCppLLMLoader:
    """Create an LLM loader by dispatching on framework then architecture.

    Framework is the first dispatch key because GGUF inference is a
    runtime decision orthogonal to the model family; the same Qwen or
    DeepSeek-R1-distill architecture can be loaded via transformers or
    via llama.cpp depending on the YAML option the operator selects.
    Once the framework branch is chosen, the loader for the local
    transformers path is resolved from the architecture-keyed registry.

    Parameters
    ----------
    architecture : LLMArchitecture
        Architecture model parsed from the YAML's ``architecture`` block.
    config : LLMConfig
        Framework-level config (model id, quantization, generation).
    cache_dir : Path | None
        Directory for caching model files.

    Returns
    -------
    LLMLoader | LlamaCppLLMLoader
        Configured LLM loader instance.

    Raises
    ------
    UnknownArchitectureError
        If the architecture has no registered transformers/sglang loader
        (e.g. an external-API architecture reached the factory by a
        route-handler bug).
    """
    if config.framework == LLMFramework.LLAMA_CPP:
        from src.infrastructure.adapters.outbound.models.llama_cpp.base import (
            LlamaCppConfig,
        )
        from src.infrastructure.adapters.outbound.models.llama_cpp.llm import (
            LlamaCppLLMLoader,
        )

        llama_config = LlamaCppConfig(
            model_id=config.model_id,
            n_ctx=config.max_tokens or 4096,
            cache_dir=cache_dir,
        )
        return LlamaCppLLMLoader(architecture, llama_config)

    return llm_registry.create(architecture, config, cache_dir)
