"""Pixtral Large Vision Language Model loader."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import torch
from transformers import (
    AutoModelForImageTextToText,
    AutoProcessor,
    AutoTokenizer,
)

from src.domain.entities.architectures import Pixtral
from src.infrastructure.adapters.outbound.models.vlm.loaders.base import (
    InferenceFramework,
    QuantizationType,
    VLMLoader,
    vlm_registry,
)
from src.infrastructure.observability.telemetry import instrument_method

if TYPE_CHECKING:
    from PIL import Image

logger = logging.getLogger(__name__)


@vlm_registry.register(Pixtral)
class PixtralLargeLoader(VLMLoader):
    """Loader for Pixtral Large Vision Language Model.

    Pixtral Large is a 123B parameter model with 128k context length,
    optimized for batch processing of long documents.
    """

    def load(self) -> None:
        """Load Pixtral Large model with configured settings."""
        try:
            logger.info(
                f"Loading Pixtral Large from {self.config.model_id} "
                f"with {self.config.quantization} quantization"
            )

            if self.config.framework == InferenceFramework.VLLM:
                self._load_with_vllm()
            else:
                self._load_with_transformers()

            logger.info("Pixtral Large loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Pixtral Large: {e}")
            raise RuntimeError(f"Model loading failed: {e}") from e

    def _load_with_vllm(self) -> None:
        """Load model using vLLM framework."""
        try:
            from vllm import LLM

            quantization_str = None
            if self.config.quantization == QuantizationType.FOUR_BIT:
                quantization_str = "bitsandbytes"
            elif self.config.quantization == QuantizationType.AWQ:
                quantization_str = "awq"

            self.model = LLM(
                model=self.config.model_id,
                quantization=quantization_str,
                trust_remote_code=self.config.trust_remote_code,
                gpu_memory_utilization=0.9,
            )
            logger.info("Model loaded with vLLM")
        except ImportError:
            logger.warning("vLLM not available, falling back to transformers")
            self._load_with_transformers()

    def _load_with_transformers(self) -> None:
        """Load model using HuggingFace Transformers."""
        quantization_config = self._get_quantization_config()

        self.processor = AutoProcessor.from_pretrained(
            self.config.model_id, trust_remote_code=self.config.trust_remote_code
        )
        self.tokenizer = AutoTokenizer.from_pretrained(
            self.config.model_id, trust_remote_code=self.config.trust_remote_code
        )

        self.model = AutoModelForImageTextToText.from_pretrained(
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
        """Generate text response from images and prompt using Pixtral Large."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        try:
            if self.config.framework == InferenceFramework.VLLM:
                return self._generate_with_vllm(images, prompt, max_new_tokens, temperature)
            return self._generate_with_transformers(images, prompt, max_new_tokens, temperature)
        except Exception as e:
            logger.error(f"Generation failed: {e}")
            raise RuntimeError(f"Text generation failed: {e}") from e

    def _generate_with_vllm(
        self,
        images: list[Image.Image],
        prompt: str,
        max_new_tokens: int,
        temperature: float,
    ) -> str:
        """Generate using vLLM engine."""
        from vllm import SamplingParams

        sampling_params = SamplingParams(max_tokens=max_new_tokens, temperature=temperature)

        outputs = self.model.generate(  # type: ignore[attr-defined]
            {"prompt": prompt, "multi_modal_data": {"image": images}},
            sampling_params=sampling_params,
        )
        return outputs[0].outputs[0].text  # type: ignore[no-any-return]

    def _generate_with_transformers(
        self,
        images: list[Image.Image],
        prompt: str,
        max_new_tokens: int,
        temperature: float,
    ) -> str:
        """Generate using HuggingFace Transformers."""
        if self.processor is None or self.tokenizer is None:
            raise RuntimeError("Processor and tokenizer not initialized")

        inputs = self.processor(images=images, text=prompt, return_tensors="pt")
        inputs = {k: v.to(self.config.device) for k, v in inputs.items()}

        with torch.inference_mode():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                temperature=temperature,
                do_sample=True,
            )

        return self.tokenizer.decode(outputs[0], skip_special_tokens=True)
