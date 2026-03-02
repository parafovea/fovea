"""llama.cpp LLM loader for GGUF text generation on CPU.

Wraps llama-cpp-python to provide async text generation using
GGUF-quantized models, compatible with the LLM loader interface.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from src.infrastructure.adapters.outbound.models.llm.loader import (
    GenerationConfig,
    GenerationResult,
)

if TYPE_CHECKING:
    from src.infrastructure.adapters.outbound.models.llama_cpp.base import LlamaCppConfig

logger = logging.getLogger(__name__)


class LlamaCppLLMLoader:
    """LLM loader using llama-cpp-python for GGUF model inference.

    Provides async load, generate, and unload methods that mirror the
    ``LLMLoader`` interface while using llama.cpp under the hood for
    efficient CPU inference.

    Parameters
    ----------
    config : LlamaCppConfig
        llama.cpp configuration.
    """

    def __init__(self, config: LlamaCppConfig) -> None:
        self.config = config
        self._model: Any = None

    @property
    def is_loaded(self) -> bool:
        """Whether the model is loaded."""
        return self._model is not None

    async def load(self) -> None:
        """Load the GGUF model.

        Downloads the model file (if needed) and initializes the
        llama.cpp inference engine.

        Raises
        ------
        FileNotFoundError
            If no GGUF file is found in the repository.
        RuntimeError
            If model initialization fails.
        """
        from llama_cpp import Llama

        model_path = self.config.resolve_model_path()
        self._model = Llama(
            model_path=model_path,
            n_ctx=self.config.n_ctx,
            n_threads=self.config.n_threads,
            n_gpu_layers=self.config.n_gpu_layers,
            verbose=self.config.verbose,
        )
        logger.info(
            "Loaded llama.cpp model: %s (ctx=%d, threads=%d)",
            self.config.model_id,
            self.config.n_ctx,
            self.config.n_threads,
        )

    async def generate(
        self,
        prompt: str,
        generation_config: GenerationConfig | None = None,
        **kwargs: Any,
    ) -> GenerationResult:
        """Generate text using the GGUF model.

        Parameters
        ----------
        prompt : str
            Input prompt text.
        generation_config : GenerationConfig | None
            Generation parameters. If None, uses defaults.
        **kwargs : Any
            Additional keyword arguments (unused, accepted for interface
            compatibility).

        Returns
        -------
        GenerationResult
            Generated text with token usage and finish reason.

        Raises
        ------
        RuntimeError
            If the model has not been loaded.
        """
        if self._model is None:
            msg = "Model not loaded. Call load() first."
            raise RuntimeError(msg)

        config = generation_config or GenerationConfig()

        completion_kwargs: dict[str, Any] = {
            "prompt": prompt,
            "max_tokens": config.max_tokens,
            "temperature": config.temperature,
            "top_p": config.top_p,
        }
        if config.stop_sequences:
            completion_kwargs["stop"] = config.stop_sequences

        output: dict[str, Any] = self._model.create_completion(**completion_kwargs)

        text: str = output["choices"][0]["text"]
        usage: dict[str, Any] = output.get("usage", {})
        finish_reason: str = output["choices"][0].get("finish_reason", "stop")

        return GenerationResult(
            text=text,
            tokens_used=usage.get("total_tokens", 0),
            finish_reason=finish_reason,
        )

    async def unload(self) -> None:
        """Unload the model and free resources."""
        self._model = None
        logger.info("Unloaded llama.cpp model: %s", self.config.model_id)
