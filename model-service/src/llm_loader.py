"""Configurable LLM loader with multi-model support and quantization.

This module provides a loader for text-only language models with support for
multiple model options (Llama 4 Scout, Llama 3.3 70B, DeepSeek V3, Gemma 3),
4-bit quantization with bitsandbytes, SGLang inference framework, and
automatic fallback handling.
"""

import asyncio
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any

import torch
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    PreTrainedModel,
    PreTrainedTokenizer,
)


class LLMFramework(str, Enum):
    """Inference framework options for LLM models."""

    SGLANG = "sglang"
    TRANSFORMERS = "transformers"


@dataclass
class LLMConfig:
    """Configuration for a language model.

    Parameters
    ----------
    model_id : str
        HuggingFace model identifier (e.g., "meta-llama/Llama-4-Scout").
    quantization : str
        Quantization mode (e.g., "4bit", "8bit", "none").
    framework : LLMFramework
        Inference framework to use (sglang or transformers).
    max_tokens : int, default=4096
        Maximum number of tokens to generate.
    temperature : float, default=0.7
        Sampling temperature for generation.
    top_p : float, default=0.9
        Nucleus sampling parameter.
    context_length : int, default=131072
        Maximum context length in tokens.
    """

    model_id: str
    quantization: str
    framework: LLMFramework
    max_tokens: int = 4096
    temperature: float = 0.7
    top_p: float = 0.9
    context_length: int = 131072


@dataclass
class GenerationConfig:
    """Configuration for text generation.

    Parameters
    ----------
    max_tokens : int, default=4096
        Maximum number of tokens to generate.
    temperature : float, default=0.7
        Sampling temperature (0.0 for greedy, higher for more randomness).
    top_p : float, default=0.9
        Nucleus sampling parameter.
    stop_sequences : list[str] | None, default=None
        List of sequences that stop generation when encountered.
    """

    max_tokens: int = 4096
    temperature: float = 0.7
    top_p: float = 0.9
    stop_sequences: list[str] | None = None


@dataclass
class GenerationResult:
    """Result from text generation.

    Parameters
    ----------
    text : str
        Generated text.
    tokens_used : int
        Number of tokens used in generation.
    finish_reason : str
        Reason generation stopped (e.g., "length", "stop_sequence", "eos").
    """

    text: str
    tokens_used: int
    finish_reason: str


class LLMLoader:
    """Loader for text-only language models with quantization support.

    This class handles loading language models with configurable quantization,
    supports multiple model options, and provides text generation utilities
    with error handling and fallback logic.
    """

    def __init__(self, config: LLMConfig, cache_dir: Path | None = None) -> None:
        """Initialize the LLM loader.

        Parameters
        ----------
        config : LLMConfig
            Model configuration specifying model ID, quantization, framework.
        cache_dir : Path | None, default=None
            Directory for caching model weights. If None, uses default HF cache.
        """
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

        This method loads the model with the specified quantization settings
        and prepares it for inference. Loading is protected by a lock to
        prevent concurrent loading attempts.

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
        """Unload the model from memory.

        This method releases the model and tokenizer, freeing GPU/CPU memory.
        """
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
    primary_config: LLMConfig,
    fallback_configs: list[LLMConfig],
    cache_dir: Path | None = None,
) -> LLMLoader:
    """Create an LLM loader with automatic fallback to alternative models.

    Parameters
    ----------
    primary_config : LLMConfig
        Primary model configuration to try first.
    fallback_configs : list[LLMConfig]
        List of fallback model configurations to try if primary fails.
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
            loader = LLMLoader(config, cache_dir)
            await loader.load()
            if i > 0:
                print(f"Loaded fallback model: {config.model_id}")
            return loader
        except Exception as e:
            print(f"Failed to load {config.model_id}: {e}")
            if i == len(configs_to_try) - 1:
                raise RuntimeError(
                    "All model loading attempts failed. Check GPU memory and model IDs."
                ) from e
            continue

    raise RuntimeError("Unreachable: should have raised error in loop")
