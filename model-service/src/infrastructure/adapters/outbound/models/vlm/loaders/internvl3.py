"""InternVL3 Vision Language Model loader."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import torch
from transformers import (
    AutoModel,
    AutoTokenizer,
)

from src.domain.entities.architectures import InternVL3
from src.infrastructure.adapters.outbound.models.vlm.loaders.base import (
    VLMLoader,
    vlm_registry,
)
from src.infrastructure.observability.telemetry import instrument_method

if TYPE_CHECKING:
    from PIL import Image

logger = logging.getLogger(__name__)


@vlm_registry.register(InternVL3)
class InternVL3Loader(VLMLoader):
    """Loader for InternVL3-78B Vision Language Model.

    InternVL3-78B achieves state-of-the-art results on vision benchmarks
    with strong scientific reasoning capabilities.
    """

    def load(self) -> None:
        """Load InternVL3 model with configured settings."""
        try:
            logger.info(
                f"Loading InternVL3 from {self.config.model_id} "
                f"with {self.config.quantization} quantization"
            )
            self._load_with_transformers()
            logger.info("InternVL3 loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load InternVL3: {e}")
            raise RuntimeError(f"Model loading failed: {e}") from e

    def _load_with_transformers(self) -> None:
        """Load model using HuggingFace Transformers."""

        quantization_config = self._get_quantization_config()

        self.tokenizer = AutoTokenizer.from_pretrained(
            self.config.model_id, trust_remote_code=self.config.trust_remote_code
        )

        self.model = AutoModel.from_pretrained(
            self.config.model_id,
            quantization_config=quantization_config,
            device_map="auto",
            trust_remote_code=self.config.trust_remote_code,
            torch_dtype=torch.bfloat16,
        )
        logger.info("Model loaded with Transformers")

    @instrument_method(task="vlm_generate")
    def generate(
        self,
        images: list[Image.Image],
        prompt: str,
        max_new_tokens: int = 512,
        temperature: float = 0.7,
    ) -> str:
        """Generate text response from images and prompt using InternVL3."""
        if self.model is None or self.tokenizer is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        try:
            pixel_values_list = []
            for image in images:
                pixel_values = self.model.load_image(image, max_num=12).to(torch.bfloat16).cuda()
                pixel_values_list.append(pixel_values)

            generation_config = {
                "max_new_tokens": max_new_tokens,
                "temperature": temperature,
                "do_sample": True,
            }

            return str(
                self.model.chat(
                    self.tokenizer,
                    pixel_values_list[0] if len(pixel_values_list) == 1 else pixel_values_list,
                    prompt,
                    generation_config,
                )
            )
        except Exception as e:
            logger.error(f"Generation failed: {e}")
            raise RuntimeError(f"Text generation failed: {e}") from e
