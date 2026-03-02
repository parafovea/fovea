"""llama.cpp VLM loader for GGUF multimodal inference on CPU.

Loads GGUF vision-language models (Qwen2.5-VL, LLaVA, Moondream) using
llama-cpp-python with llava-style chat completion for image understanding.
"""

from __future__ import annotations

import base64
import io
import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from src.infrastructure.adapters.outbound.models.llama_cpp.base import LlamaCppConfig

logger = logging.getLogger(__name__)


class LlamaCppVLMLoader:
    """VLM loader using llama-cpp-python for GGUF multimodal models.

    Supports models like Qwen2.5-VL, LLaVA, and other GGUF vision models
    with llava-style chat completion.

    Parameters
    ----------
    config : LlamaCppConfig
        llama.cpp configuration.
    clip_model_path : str
        Path or HuggingFace repo ID for the CLIP vision encoder (mmproj file).
    """

    def __init__(self, config: LlamaCppConfig, clip_model_path: str = "") -> None:
        self.config = config
        self.clip_model_path = clip_model_path
        self._model: Any = None

    @property
    def is_loaded(self) -> bool:
        """Whether the model is loaded."""
        return self._model is not None

    async def load(self) -> None:
        """Load the GGUF multimodal model with vision encoder."""
        from llama_cpp import Llama
        from llama_cpp.llama_chat_format import (
            MoondreamChatHandler,
            NanoLlavaChatHandler,
        )

        model_path = self.config.resolve_model_path()

        # Resolve clip/mmproj model path and select chat handler
        chat_handler: MoondreamChatHandler | NanoLlavaChatHandler | None = None
        if self.clip_model_path:
            clip_path = self._resolve_clip_path()
            model_lower = self.config.model_id.lower()
            if "moondream" in model_lower:
                chat_handler = MoondreamChatHandler(clip_model_path=clip_path)
            else:
                chat_handler = NanoLlavaChatHandler(clip_model_path=clip_path)

        self._model = Llama(
            model_path=model_path,
            n_ctx=self.config.n_ctx,
            n_threads=self.config.n_threads,
            n_gpu_layers=self.config.n_gpu_layers,
            verbose=self.config.verbose,
            chat_handler=chat_handler,
        )
        logger.info("Loaded llama.cpp VLM: %s", self.config.model_id)

    def _resolve_clip_path(self) -> str:
        """Resolve the CLIP/mmproj model path.

        Downloads the mmproj GGUF file from a HuggingFace repo if the
        clip_model_path looks like a repo ID, otherwise returns it as-is.

        Returns
        -------
        str
            Local path to the CLIP model file.
        """
        from huggingface_hub import hf_hub_download, list_repo_files

        cache_dir = str(self.config.cache_dir) if self.config.cache_dir else None

        # If clip_model_path looks like a HF repo, download the mmproj file
        if "/" in self.clip_model_path and not self.clip_model_path.startswith("/"):
            files = list_repo_files(self.clip_model_path)
            mmproj_files = [f for f in files if "mmproj" in f.lower() and f.endswith(".gguf")]

            if mmproj_files:
                return hf_hub_download(
                    repo_id=self.clip_model_path,
                    filename=mmproj_files[0],
                    cache_dir=cache_dir,
                )

            # Fallback: check the main model repo for mmproj files
            main_files = list_repo_files(self.config.model_id)
            main_mmproj = [f for f in main_files if "mmproj" in f.lower() and f.endswith(".gguf")]
            if main_mmproj:
                return hf_hub_download(
                    repo_id=self.config.model_id,
                    filename=main_mmproj[0],
                    cache_dir=cache_dir,
                )

        return self.clip_model_path

    async def generate(
        self,
        images: list[Any],
        prompt: str,
        max_new_tokens: int = 1024,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> str:
        """Generate text from images and prompt.

        Converts PIL images to base64 data URIs and sends them as
        multimodal chat completion messages.

        Parameters
        ----------
        images : list[Any]
            List of PIL Images.
        prompt : str
            Text prompt.
        max_new_tokens : int
            Maximum tokens to generate.
        temperature : float
            Sampling temperature.
        **kwargs : Any
            Additional generation parameters.

        Returns
        -------
        str
            Generated text response.

        Raises
        ------
        RuntimeError
            If the model has not been loaded.
        """
        if self._model is None:
            msg = "Model not loaded. Call load() first."
            raise RuntimeError(msg)

        # Convert PIL images to base64 data URIs
        image_content: list[dict[str, Any]] = []
        for img in images:
            buffered = io.BytesIO()
            img.save(buffered, format="PNG")
            img_b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
            image_content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{img_b64}"},
                }
            )

        messages: list[dict[str, Any]] = [
            {
                "role": "user",
                "content": [
                    *image_content,
                    {"type": "text", "text": prompt},
                ],
            }
        ]

        output: dict[str, Any] = self._model.create_chat_completion(
            messages=messages,
            max_tokens=max_new_tokens,
            temperature=temperature,
        )

        return str(output["choices"][0]["message"]["content"])

    async def unload(self) -> None:
        """Unload model and free resources."""
        self._model = None
        logger.info("Unloaded llama.cpp VLM: %s", self.config.model_id)
