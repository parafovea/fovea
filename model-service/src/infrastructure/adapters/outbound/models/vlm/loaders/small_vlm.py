"""Small Vision Language Model loader for SmolVLM and Moondream."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import torch
from transformers import AutoModelForImageTextToText, AutoProcessor

from src.domain.entities.architectures import Moondream, SmolVLM
from src.infrastructure.adapters.outbound.models.vlm.loaders.base import (
    VLMConfig,
    VLMLoader,
    vlm_registry,
)
from src.infrastructure.observability.telemetry import instrument_method

if TYPE_CHECKING:
    from PIL import Image

logger = logging.getLogger(__name__)


@vlm_registry.register(SmolVLM)
@vlm_registry.register(Moondream)
class SmallVLMLoader(VLMLoader):
    """Loader for small VLMs (SmolVLM, Moondream) via Transformers on CPU.

    Designed for CPU-friendly vision-language models that run without GPU
    using standard HuggingFace Transformers.

    Parameters
    ----------
    arch : SmolVLM | Moondream
        Parsed architecture entry; the same loader class handles both small
        VLM families because their HuggingFace load path is identical.
    config : VLMConfig
        VLM configuration.
    """

    def __init__(self, arch: SmolVLM | Moondream, config: VLMConfig) -> None:
        super().__init__(arch, config)
        self._model: Any = None
        self._processor: Any = None

    def load(self) -> None:
        """Load model and processor from HuggingFace."""
        self._processor = AutoProcessor.from_pretrained(
            self.config.model_id, trust_remote_code=True
        )
        self._model = AutoModelForImageTextToText.from_pretrained(
            self.config.model_id,
            torch_dtype=torch.float32,
            device_map="cpu",
            trust_remote_code=True,
        )
        logger.info("Loaded small VLM: %s", self.config.model_id)

    @instrument_method(task="vlm_generate")
    def generate(
        self,
        images: list[Image.Image],
        prompt: str,
        max_new_tokens: int = 512,
        temperature: float = 0.7,
    ) -> str:
        """Generate text from images and prompt.

        Parameters
        ----------
        images : list[Image.Image]
            List of PIL Images.
        prompt : str
            Text prompt.
        max_new_tokens : int
            Maximum tokens to generate.
        temperature : float
            Sampling temperature.

        Returns
        -------
        str
            Generated text.

        Raises
        ------
        RuntimeError
            If the model or processor has not been loaded.
        """
        if self._model is None or self._processor is None:
            msg = "Model not loaded. Call load() first."
            raise RuntimeError(msg)

        # Moondream's single-image interface needs one generation per sampled frame.
        if isinstance(self.arch, Moondream) and len(images) > 1:
            return "\n".join(
                f"Frame {index + 1}: {self.generate([image], prompt, max_new_tokens, temperature)}"
                for index, image in enumerate(images)
            )

        # SmolVLM supports multiple images in one prompt. Each image needs its
        # own placeholder, in the same order as the sampled video frames.
        image_input = (
            (images or None) if isinstance(self.arch, SmolVLM) else (images[0] if images else None)
        )
        # Use one image per frame for a sequence; splitting each frame into
        # tiles multiplies video context and CPU memory without adding time coverage.
        processor_options = (
            {"do_image_splitting": False}
            if isinstance(self.arch, SmolVLM) and len(images) > 1
            else {}
        )
        if images and hasattr(self._processor, "apply_chat_template"):
            messages = [
                {
                    "role": "user",
                    "content": [
                        *({"type": "image"} for _ in images),
                        {"type": "text", "text": prompt},
                    ],
                },
            ]
            templated_prompt = self._processor.apply_chat_template(
                messages, add_generation_prompt=True
            )
            inputs = self._processor(
                images=image_input,
                text=templated_prompt,
                return_tensors="pt",
                **processor_options,
            )
        else:
            inputs = self._processor(
                images=image_input,
                text=prompt,
                return_tensors="pt",
                **processor_options,
            )

        output = self._model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            temperature=temperature if temperature > 0 else 1.0,
            do_sample=temperature > 0,
        )

        # Decode only new tokens
        generated = output[0][inputs["input_ids"].shape[-1] :]
        return self._processor.decode(generated, skip_special_tokens=True)  # type: ignore[no-any-return]

    def unload(self) -> None:
        """Unload model and processor."""
        self._model = None
        self._processor = None
        logger.info("Unloaded small VLM: %s", self.config.model_id)
