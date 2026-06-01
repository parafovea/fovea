"""Vision Language Model loader with support for multiple VLM architectures.

This module provides a unified interface for loading and running inference with
various Vision Language Models. Concrete loader classes register against the
Pydantic architecture subclass they implement via :data:`vlm_registry`, and the
:func:`create_vlm_loader` factory dispatches purely through that registry.

The factory has no knowledge of specific model identifiers, weights checkpoint
filenames, or YAML strings. The only legitimate dispatch keys are
:class:`InferenceFramework` (for the framework-level pre-dispatch into the
llama.cpp GGUF backend) and the architecture Pydantic class itself.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

import torch
from PIL import Image
from transformers import (
    AutoModel,
    AutoModelForImageTextToText,
    AutoProcessor,
    AutoTokenizer,
    BitsAndBytesConfig,
    Qwen2VLForConditionalGeneration,
)

from src.domain.entities.architectures import (
    Gemma3VL,
    InternVL3,
    Llama4Maverick,
    Moondream,
    Pixtral,
    Qwen3VL,
    QwenVL,
    SmolVLM,
    Tarsier2,
    VLMArchitecture,
)
from src.infrastructure.adapters.outbound.models.registry import LoaderRegistry
from src.infrastructure.observability.telemetry import instrument_method

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


vlm_registry: LoaderRegistry[VLMArchitecture, "VLMLoader"] = LoaderRegistry(family="vlm")
"""Architecture-keyed registry of VLM loader classes.

Loader classes register themselves below with
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


@vlm_registry.register(Llama4Maverick)
class Llama4MaverickLoader(VLMLoader):
    """Loader for Llama 4 Maverick Vision Language Model.

    Llama 4 Maverick is a 400B parameter MoE model with 17B active parameters,
    supporting multimodal input with 10M context length.
    """

    def load(self) -> None:
        """Load Llama 4 Maverick model with configured settings."""
        try:
            logger.info(
                f"Loading Llama 4 Maverick from {self.config.model_id} "
                f"with {self.config.quantization} quantization"
            )

            if self.config.framework == InferenceFramework.SGLANG:
                self._load_with_sglang()
            elif self.config.framework == InferenceFramework.VLLM:
                self._load_with_vllm()
            else:
                self._load_with_transformers()

            logger.info("Llama 4 Maverick loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Llama 4 Maverick: {e}")
            raise RuntimeError(f"Model loading failed: {e}") from e

    def _load_with_sglang(self) -> None:
        """Load model using SGLang framework for optimized inference."""
        try:
            import sglang as sgl

            quantization_str = None
            if self.config.quantization == QuantizationType.FOUR_BIT:
                quantization_str = "bitsandbytes-4bit"
            elif self.config.quantization == QuantizationType.AWQ:
                quantization_str = "awq"

            runtime = sgl.Runtime(
                model_path=self.config.model_id,
                tokenizer_path=self.config.model_id,
                quantization=quantization_str,
                trust_remote_code=self.config.trust_remote_code,
                mem_fraction_static=0.8 if self.config.max_memory_gb else 0.9,
            )
            self.model = runtime
            logger.info("Model loaded with SGLang")
        except ImportError:
            logger.warning("SGLang not available, falling back to transformers")
            self._load_with_transformers()
        except Exception as e:
            logger.error(f"SGLang loading failed: {e}")
            raise

    def _load_with_vllm(self) -> None:
        """Load model using vLLM framework for high-throughput inference."""
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
        except Exception as e:
            logger.error(f"vLLM loading failed: {e}")
            raise

    def _load_with_transformers(self) -> None:
        """Load model using HuggingFace Transformers library."""
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
        """Generate text response from images and prompt using Llama 4 Maverick."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        try:
            if self.config.framework == InferenceFramework.SGLANG:
                return self._generate_with_sglang(images, prompt, max_new_tokens, temperature)
            if self.config.framework == InferenceFramework.VLLM:
                return self._generate_with_vllm(images, prompt, max_new_tokens, temperature)
            return self._generate_with_transformers(images, prompt, max_new_tokens, temperature)
        except Exception as e:
            logger.error(f"Generation failed: {e}")
            raise RuntimeError(f"Text generation failed: {e}") from e

    def _generate_with_sglang(
        self,
        images: list[Image.Image],
        prompt: str,
        max_new_tokens: int,
        temperature: float,
    ) -> str:
        """Generate using SGLang runtime."""
        import sglang as sgl

        @sgl.function  # type: ignore[misc]
        def image_qa(s: Any, images: Any, prompt: Any) -> None:
            for img in images:
                s += sgl.image(img)
            s += prompt
            s += sgl.gen("answer", max_tokens=max_new_tokens, temperature=temperature)

        state = image_qa.run(images=images, prompt=prompt, backend=self.model)
        return str(state["answer"])  # type: ignore[no-any-return]

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

        # vLLM expects images in specific format
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


@vlm_registry.register(Gemma3VL)
class Gemma3Loader(VLMLoader):
    """Loader for Gemma 3 27B Vision Language Model.

    Gemma 3 27B excels at document analysis, OCR, and multilingual tasks
    with fast inference speed.
    """

    def load(self) -> None:
        """Load Gemma 3 model with configured settings."""
        try:
            logger.info(
                f"Loading Gemma 3 from {self.config.model_id} "
                f"with {self.config.quantization} quantization"
            )

            if self.config.framework == InferenceFramework.SGLANG:
                self._load_with_sglang()
            elif self.config.framework == InferenceFramework.VLLM:
                self._load_with_vllm()
            else:
                self._load_with_transformers()

            logger.info("Gemma 3 loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Gemma 3: {e}")
            raise RuntimeError(f"Model loading failed: {e}") from e

    def _load_with_sglang(self) -> None:
        """Load model using SGLang framework."""
        try:
            import sglang as sgl

            quantization_str = None
            if self.config.quantization == QuantizationType.FOUR_BIT:
                quantization_str = "bitsandbytes-4bit"

            runtime = sgl.Runtime(
                model_path=self.config.model_id,
                tokenizer_path=self.config.model_id,
                quantization=quantization_str,
                trust_remote_code=self.config.trust_remote_code,
                mem_fraction_static=0.8 if self.config.max_memory_gb else 0.9,
            )
            self.model = runtime
            logger.info("Model loaded with SGLang")
        except ImportError:
            logger.warning("SGLang not available, falling back to transformers")
            self._load_with_transformers()

    def _load_with_vllm(self) -> None:
        """Load model using vLLM framework."""
        try:
            from vllm import LLM

            quantization_str = None
            if self.config.quantization == QuantizationType.FOUR_BIT:
                quantization_str = "bitsandbytes"

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
        """Generate text response from images and prompt using Gemma 3."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        try:
            if self.config.framework == InferenceFramework.SGLANG:
                return self._generate_with_sglang(images, prompt, max_new_tokens, temperature)
            if self.config.framework == InferenceFramework.VLLM:
                return self._generate_with_vllm(images, prompt, max_new_tokens, temperature)
            return self._generate_with_transformers(images, prompt, max_new_tokens, temperature)
        except Exception as e:
            logger.error(f"Generation failed: {e}")
            raise RuntimeError(f"Text generation failed: {e}") from e

    def _generate_with_sglang(
        self,
        images: list[Image.Image],
        prompt: str,
        max_new_tokens: int,
        temperature: float,
    ) -> str:
        """Generate using SGLang runtime."""
        import sglang as sgl

        @sgl.function  # type: ignore[misc]
        def image_qa(s: Any, images: Any, prompt: Any) -> None:
            for img in images:
                s += sgl.image(img)
            s += prompt
            s += sgl.gen("answer", max_tokens=max_new_tokens, temperature=temperature)

        state = image_qa.run(images=images, prompt=prompt, backend=self.model)
        return str(state["answer"])  # type: ignore[no-any-return]

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


@vlm_registry.register(QwenVL)
@vlm_registry.register(Qwen3VL)
@vlm_registry.register(Tarsier2)
class Qwen25VLLoader(VLMLoader):
    """Loader for the Qwen-VL family and Qwen2-VL derivatives.

    Drives Qwen2.5-VL and Qwen3-VL via the sglang and vllm framework paths
    (both backends resolve the model class from ``model_id`` at runtime), and
    Tarsier2 via the HuggingFace Transformers path (Tarsier2 is built on the
    Qwen2-VL backbone and loads through :class:`Qwen2VLForConditionalGeneration`).
    """

    def load(self) -> None:
        """Load Qwen2.5-VL model with configured settings."""
        try:
            logger.info(
                f"Loading Qwen2.5-VL from {self.config.model_id} "
                f"with {self.config.quantization} quantization"
            )

            if self.config.framework == InferenceFramework.SGLANG:
                self._load_with_sglang()
            elif self.config.framework == InferenceFramework.VLLM:
                self._load_with_vllm()
            else:
                self._load_with_transformers()

            logger.info("Qwen2.5-VL loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Qwen2.5-VL: {e}")
            raise RuntimeError(f"Model loading failed: {e}") from e

    def _load_with_sglang(self) -> None:
        """Load model using SGLang framework."""
        try:
            import sglang as sgl

            quantization_str = None
            if self.config.quantization == QuantizationType.FOUR_BIT:
                quantization_str = "bitsandbytes-4bit"
            elif self.config.quantization == QuantizationType.AWQ:
                quantization_str = "awq"

            runtime = sgl.Runtime(
                model_path=self.config.model_id,
                tokenizer_path=self.config.model_id,
                quantization=quantization_str,
                trust_remote_code=self.config.trust_remote_code,
                mem_fraction_static=0.8 if self.config.max_memory_gb else 0.9,
            )
            self.model = runtime
            logger.info("Model loaded with SGLang")
        except ImportError:
            logger.warning("SGLang not available, falling back to transformers")
            self._load_with_transformers()

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

        self.model = Qwen2VLForConditionalGeneration.from_pretrained(
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
        """Generate text response from images and prompt using Qwen2.5-VL."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        try:
            if self.config.framework == InferenceFramework.SGLANG:
                return self._generate_with_sglang(images, prompt, max_new_tokens, temperature)
            if self.config.framework == InferenceFramework.VLLM:
                return self._generate_with_vllm(images, prompt, max_new_tokens, temperature)
            return self._generate_with_transformers(images, prompt, max_new_tokens, temperature)
        except Exception as e:
            logger.error(f"Generation failed: {e}")
            raise RuntimeError(f"Text generation failed: {e}") from e

    def _generate_with_sglang(
        self,
        images: list[Image.Image],
        prompt: str,
        max_new_tokens: int,
        temperature: float,
    ) -> str:
        """Generate using SGLang runtime."""
        import sglang as sgl

        @sgl.function  # type: ignore[misc]
        def image_qa(s: Any, images: Any, prompt: Any) -> None:
            for img in images:
                s += sgl.image(img)
            s += prompt
            s += sgl.gen("answer", max_tokens=max_new_tokens, temperature=temperature)

        state = image_qa.run(images=images, prompt=prompt, backend=self.model)
        return str(state["answer"])  # type: ignore[no-any-return]

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

        messages = [
            {
                "role": "user",
                "content": [
                    *[{"type": "image", "image": img} for img in images],
                    {"type": "text", "text": prompt},
                ],
            }
        ]

        text = self.processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        image_inputs, video_inputs = self.processor.process_vision_info(messages)
        inputs = self.processor(
            text=[text],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            return_tensors="pt",
        )
        inputs = {k: v.to(self.config.device) for k, v in inputs.items()}

        with torch.inference_mode():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                temperature=temperature,
                do_sample=True,
            )

        return self.tokenizer.decode(outputs[0], skip_special_tokens=True)


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

        inputs = self._processor(
            images=images[0] if images else None,
            text=prompt,
            return_tensors="pt",
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
