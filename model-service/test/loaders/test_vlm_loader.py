"""Tests for Vision Language Model loader."""

from unittest.mock import MagicMock, patch

import pytest
import torch
from PIL import Image

from src.vlm_loader import (
    Gemma3Loader,
    InferenceFramework,
    InternVL3Loader,
    Llama4MaverickLoader,
    PixtralLargeLoader,
    QuantizationType,
    Qwen25VLLoader,
    VLMConfig,
    create_vlm_loader,
)

pytestmark = pytest.mark.requires_models


@pytest.fixture
def sample_image():
    """Create a sample PIL image for testing."""
    return Image.new("RGB", (224, 224), color="red")


@pytest.fixture
def sample_images(sample_image):
    """Create a list of sample PIL images for testing."""
    return [sample_image]


@pytest.fixture
def vlm_config():
    """Create a basic VLM configuration for testing."""
    return VLMConfig(
        model_id="test-model",
        quantization=QuantizationType.FOUR_BIT,
        framework=InferenceFramework.TRANSFORMERS,
        device="cpu",
    )


class TestVLMConfig:
    """Tests for VLMConfig dataclass."""

    def test_default_values(self):
        """Verify default configuration values."""
        config = VLMConfig(model_id="test-model")
        assert config.model_id == "test-model"
        assert config.quantization == QuantizationType.FOUR_BIT
        assert config.framework == InferenceFramework.SGLANG
        assert config.max_memory_gb is None
        assert config.device == "cuda"
        assert config.trust_remote_code is True

    def test_custom_values(self):
        """Verify custom configuration values."""
        config = VLMConfig(
            model_id="custom-model",
            quantization=QuantizationType.EIGHT_BIT,
            framework=InferenceFramework.VLLM,
            max_memory_gb=48,
            device="cuda:1",
            trust_remote_code=False,
        )
        assert config.model_id == "custom-model"
        assert config.quantization == QuantizationType.EIGHT_BIT
        assert config.framework == InferenceFramework.VLLM
        assert config.max_memory_gb == 48
        assert config.device == "cuda:1"
        assert config.trust_remote_code is False


class TestLlama4MaverickLoader:
    """Tests for Llama 4 Maverick VLM loader."""

    def test_initialization(self, vlm_config):
        """Verify loader initializes with correct configuration."""
        loader = Llama4MaverickLoader(vlm_config)
        assert loader.config == vlm_config
        assert loader.model is None
        assert loader.processor is None
        assert loader.tokenizer is None

    @patch("src.vlm_loader.AutoModelForVision2Seq")
    @patch("src.vlm_loader.AutoProcessor")
    @patch("src.vlm_loader.AutoTokenizer")
    def test_load_with_transformers(self, mock_tokenizer, mock_processor, mock_model, vlm_config):
        """Test loading model with HuggingFace Transformers."""
        mock_processor_instance = MagicMock()
        mock_tokenizer_instance = MagicMock()
        mock_model_instance = MagicMock()

        mock_processor.from_pretrained.return_value = mock_processor_instance
        mock_tokenizer.from_pretrained.return_value = mock_tokenizer_instance
        mock_model.from_pretrained.return_value = mock_model_instance

        loader = Llama4MaverickLoader(vlm_config)
        loader.load()

        assert loader.processor == mock_processor_instance
        assert loader.tokenizer == mock_tokenizer_instance
        assert loader.model == mock_model_instance

        mock_processor.from_pretrained.assert_called_once_with("test-model", trust_remote_code=True)
        mock_tokenizer.from_pretrained.assert_called_once_with("test-model", trust_remote_code=True)

    @patch("src.vlm_loader.AutoModelForVision2Seq")
    @patch("src.vlm_loader.AutoProcessor")
    @patch("src.vlm_loader.AutoTokenizer")
    def test_generate_with_transformers(
        self,
        mock_tokenizer_cls,
        mock_processor_cls,
        mock_model_cls,
        vlm_config,
        sample_images,
    ):
        """Test text generation with Transformers framework."""
        mock_processor = MagicMock()
        mock_tokenizer = MagicMock()
        mock_model = MagicMock()

        mock_processor_cls.from_pretrained.return_value = mock_processor
        mock_tokenizer_cls.from_pretrained.return_value = mock_tokenizer
        mock_model_cls.from_pretrained.return_value = mock_model

        mock_processor.return_value = {
            "pixel_values": torch.randn(1, 3, 224, 224),
            "input_ids": torch.randint(0, 1000, (1, 10)),
        }
        mock_model.generate.return_value = torch.tensor([[1, 2, 3, 4]])
        mock_tokenizer.decode.return_value = "Generated text response"

        loader = Llama4MaverickLoader(vlm_config)
        loader.load()

        result = loader.generate(
            sample_images, "What is in this image?", max_new_tokens=100, temperature=0.7
        )

        assert result == "Generated text response"
        mock_model.generate.assert_called_once()
        mock_tokenizer.decode.assert_called_once()

    def test_generate_without_loading_raises_error(self, vlm_config, sample_images):
        """Verify generation fails if model not loaded."""
        loader = Llama4MaverickLoader(vlm_config)

        with pytest.raises(RuntimeError, match="Model not loaded"):
            loader.generate(sample_images, "test prompt")

    @patch("src.vlm_loader.torch.cuda")
    def test_unload_clears_memory(self, mock_cuda, vlm_config):
        """Test that unload properly clears model from memory."""
        mock_cuda.is_available.return_value = True
        mock_cuda.empty_cache = MagicMock()

        loader = Llama4MaverickLoader(vlm_config)
        loader.model = MagicMock()
        loader.processor = MagicMock()
        loader.tokenizer = MagicMock()

        loader.unload()

        assert loader.model is None
        assert loader.processor is None
        assert loader.tokenizer is None
        mock_cuda.empty_cache.assert_called_once()

    def test_get_quantization_config_4bit(self, vlm_config):
        """Test 4-bit quantization config generation."""
        loader = Llama4MaverickLoader(vlm_config)
        config = loader._get_quantization_config()

        assert config is not None
        assert config.load_in_4bit is True
        assert config.bnb_4bit_compute_dtype == torch.bfloat16
        assert config.bnb_4bit_use_double_quant is True
        assert config.bnb_4bit_quant_type == "nf4"

    def test_get_quantization_config_8bit(self):
        """Test 8-bit quantization config generation."""
        config = VLMConfig(
            model_id="test-model",
            quantization=QuantizationType.EIGHT_BIT,
            framework=InferenceFramework.TRANSFORMERS,
            device="cpu",
        )
        loader = Llama4MaverickLoader(config)
        quant_config = loader._get_quantization_config()

        assert quant_config is not None
        assert quant_config.load_in_8bit is True
        assert quant_config.llm_int8_threshold == 6.0  # default bitsandbytes value

    def test_get_quantization_config_none(self):
        """Test no quantization returns None config."""
        config = VLMConfig(
            model_id="test-model",
            quantization=QuantizationType.NONE,
            framework=InferenceFramework.TRANSFORMERS,
            device="cpu",
        )
        loader = Llama4MaverickLoader(config)
        quant_config = loader._get_quantization_config()

        assert quant_config is None


class TestGemma3Loader:
    """Tests for Gemma 3 VLM loader."""

    def test_initialization(self, vlm_config):
        """Verify loader initializes correctly."""
        loader = Gemma3Loader(vlm_config)
        assert loader.config == vlm_config
        assert loader.model is None

    @patch("src.vlm_loader.AutoModelForVision2Seq.from_pretrained")
    @patch("src.vlm_loader.AutoProcessor.from_pretrained")
    @patch("src.vlm_loader.AutoTokenizer.from_pretrained")
    def test_load_with_transformers(self, mock_tokenizer, mock_processor, mock_model, vlm_config):
        """Test loading Gemma 3 with Transformers."""
        mock_processor_instance = MagicMock()
        mock_tokenizer_instance = MagicMock()
        mock_model_instance = MagicMock()

        mock_processor.return_value = mock_processor_instance
        mock_tokenizer.return_value = mock_tokenizer_instance
        mock_model.return_value = mock_model_instance

        loader = Gemma3Loader(vlm_config)
        loader.load()

        assert loader.model == mock_model_instance
        assert loader.processor == mock_processor_instance
        assert loader.tokenizer == mock_tokenizer_instance


class TestInternVL3Loader:
    """Tests for InternVL3 VLM loader."""

    def test_initialization(self, vlm_config):
        """Verify loader initializes correctly."""
        loader = InternVL3Loader(vlm_config)
        assert loader.config == vlm_config
        assert loader.model is None

    @patch("src.vlm_loader.AutoModel")
    @patch("src.vlm_loader.AutoTokenizer")
    def test_load_with_transformers(self, mock_tokenizer, mock_model, vlm_config):
        """Test loading InternVL3 with Transformers."""
        mock_tokenizer_instance = MagicMock()
        mock_model_instance = MagicMock()

        mock_tokenizer.from_pretrained.return_value = mock_tokenizer_instance
        mock_model.from_pretrained.return_value = mock_model_instance

        loader = InternVL3Loader(vlm_config)
        loader.load()

        assert loader.model == mock_model_instance
        assert loader.tokenizer == mock_tokenizer_instance

    @patch("src.vlm_loader.AutoModel.from_pretrained")
    @patch("src.vlm_loader.AutoTokenizer.from_pretrained")
    def test_generate(self, mock_tokenizer_cls, mock_model_cls, vlm_config, sample_images):
        """Test text generation with InternVL3."""
        mock_tokenizer = MagicMock()
        mock_model = MagicMock()

        mock_tokenizer_cls.return_value = mock_tokenizer
        mock_model_cls.return_value = mock_model

        # Mock the chained calls: load_image().to().cuda()
        mock_pixel_values = MagicMock()
        mock_pixel_values.to.return_value.cuda.return_value = torch.randn(1, 3, 224, 224)
        mock_model.load_image.return_value = mock_pixel_values
        mock_model.chat.return_value = "InternVL3 response"

        loader = InternVL3Loader(vlm_config)
        loader.load()

        result = loader.generate(sample_images, "Describe this image")

        assert result == "InternVL3 response"
        mock_model.chat.assert_called_once()


class TestPixtralLargeLoader:
    """Tests for Pixtral Large VLM loader."""

    def test_initialization(self, vlm_config):
        """Verify loader initializes correctly."""
        loader = PixtralLargeLoader(vlm_config)
        assert loader.config == vlm_config
        assert loader.model is None

    @patch("src.vlm_loader.AutoModelForVision2Seq.from_pretrained")
    @patch("src.vlm_loader.AutoProcessor.from_pretrained")
    @patch("src.vlm_loader.AutoTokenizer.from_pretrained")
    def test_load_with_transformers(self, mock_tokenizer, mock_processor, mock_model, vlm_config):
        """Test loading Pixtral Large with Transformers."""
        mock_processor_instance = MagicMock()
        mock_tokenizer_instance = MagicMock()
        mock_model_instance = MagicMock()

        mock_processor.return_value = mock_processor_instance
        mock_tokenizer.return_value = mock_tokenizer_instance
        mock_model.return_value = mock_model_instance

        loader = PixtralLargeLoader(vlm_config)
        loader.load()

        assert loader.model == mock_model_instance
        assert loader.processor == mock_processor_instance
        assert loader.tokenizer == mock_tokenizer_instance


class TestQwen25VLLoader:
    """Tests for Qwen2.5-VL VLM loader."""

    def test_initialization(self, vlm_config):
        """Verify loader initializes correctly."""
        loader = Qwen25VLLoader(vlm_config)
        assert loader.config == vlm_config
        assert loader.model is None

    @patch("src.vlm_loader.Qwen2VLForConditionalGeneration")
    @patch("src.vlm_loader.AutoProcessor")
    @patch("src.vlm_loader.AutoTokenizer")
    def test_load_with_transformers(self, mock_tokenizer, mock_processor, mock_model, vlm_config):
        """Test loading Qwen2.5-VL with Transformers."""
        mock_processor_instance = MagicMock()
        mock_tokenizer_instance = MagicMock()
        mock_model_instance = MagicMock()

        mock_processor.from_pretrained.return_value = mock_processor_instance
        mock_tokenizer.from_pretrained.return_value = mock_tokenizer_instance
        mock_model.from_pretrained.return_value = mock_model_instance

        loader = Qwen25VLLoader(vlm_config)
        loader.load()

        assert loader.model == mock_model_instance
        assert loader.processor == mock_processor_instance
        assert loader.tokenizer == mock_tokenizer_instance

    @patch("src.vlm_loader.Qwen2VLForConditionalGeneration")
    @patch("src.vlm_loader.AutoProcessor")
    @patch("src.vlm_loader.AutoTokenizer")
    def test_generate_with_transformers(
        self,
        mock_tokenizer_cls,
        mock_processor_cls,
        mock_model_cls,
        vlm_config,
        sample_images,
    ):
        """Test text generation with Qwen2.5-VL."""
        mock_processor = MagicMock()
        mock_tokenizer = MagicMock()
        mock_model = MagicMock()

        mock_processor_cls.from_pretrained.return_value = mock_processor
        mock_tokenizer_cls.from_pretrained.return_value = mock_tokenizer
        mock_model_cls.from_pretrained.return_value = mock_model

        mock_processor.apply_chat_template.return_value = "formatted prompt"
        mock_processor.process_vision_info.return_value = ([sample_images[0]], None)
        mock_processor.return_value = {
            "input_ids": torch.randint(0, 1000, (1, 10)),
        }
        mock_model.generate.return_value = torch.tensor([[1, 2, 3, 4]])
        mock_tokenizer.decode.return_value = "Qwen2.5-VL response"

        loader = Qwen25VLLoader(vlm_config)
        loader.load()

        result = loader.generate(sample_images, "What do you see?")

        assert result == "Qwen2.5-VL response"
        mock_model.generate.assert_called_once()


class TestCreateVLMLoader:
    """Tests for VLM loader factory function."""

    def test_create_llama4_maverick_loader(self, vlm_config):
        """Test creating Llama 4 Maverick loader."""
        loader = create_vlm_loader("llama-4-maverick", vlm_config)
        assert isinstance(loader, Llama4MaverickLoader)
        assert loader.config == vlm_config

    def test_create_llama4_maverick_loader_alternate_name(self, vlm_config):
        """Test creating Llama 4 Maverick loader with alternate name."""
        loader = create_vlm_loader("llama4-maverick", vlm_config)
        assert isinstance(loader, Llama4MaverickLoader)

    def test_create_gemma3_loader(self, vlm_config):
        """Test creating Gemma 3 loader."""
        loader = create_vlm_loader("gemma-3-27b", vlm_config)
        assert isinstance(loader, Gemma3Loader)
        assert loader.config == vlm_config

    def test_create_gemma3_loader_short_name(self, vlm_config):
        """Test creating Gemma 3 loader with short name."""
        loader = create_vlm_loader("gemma3", vlm_config)
        assert isinstance(loader, Gemma3Loader)

    def test_create_internvl3_loader(self, vlm_config):
        """Test creating InternVL3 loader."""
        loader = create_vlm_loader("internvl3-78b", vlm_config)
        assert isinstance(loader, InternVL3Loader)
        assert loader.config == vlm_config

    def test_create_pixtral_loader(self, vlm_config):
        """Test creating Pixtral Large loader."""
        loader = create_vlm_loader("pixtral-large", vlm_config)
        assert isinstance(loader, PixtralLargeLoader)
        assert loader.config == vlm_config

    def test_create_pixtral_loader_short_name(self, vlm_config):
        """Test creating Pixtral loader with short name."""
        loader = create_vlm_loader("pixtral", vlm_config)
        assert isinstance(loader, PixtralLargeLoader)

    def test_create_qwen25vl_loader(self, vlm_config):
        """Test creating Qwen2.5-VL loader."""
        loader = create_vlm_loader("qwen2.5-vl-72b", vlm_config)
        assert isinstance(loader, Qwen25VLLoader)
        assert loader.config == vlm_config

    def test_create_qwen25vl_loader_short_name(self, vlm_config):
        """Test creating Qwen2.5-VL loader with short name."""
        loader = create_vlm_loader("qwen25vl", vlm_config)
        assert isinstance(loader, Qwen25VLLoader)

    def test_create_loader_case_insensitive(self, vlm_config):
        """Test factory function is case insensitive."""
        loader1 = create_vlm_loader("LLAMA-4-MAVERICK", vlm_config)
        loader2 = create_vlm_loader("Llama-4-Maverick", vlm_config)
        assert isinstance(loader1, Llama4MaverickLoader)
        assert isinstance(loader2, Llama4MaverickLoader)

    def test_create_loader_with_underscores(self, vlm_config):
        """Test factory function handles underscores."""
        loader = create_vlm_loader("llama_4_maverick", vlm_config)
        assert isinstance(loader, Llama4MaverickLoader)

    def test_create_loader_unknown_model_raises_error(self, vlm_config):
        """Test factory function raises error for unknown model."""
        with pytest.raises(ValueError, match="Unknown model name"):
            create_vlm_loader("unknown-model", vlm_config)


class TestQuantizationType:
    """Tests for QuantizationType enum."""

    def test_enum_values(self):
        """Verify enum has correct values."""
        assert QuantizationType.NONE == "none"
        assert QuantizationType.FOUR_BIT == "4bit"
        assert QuantizationType.EIGHT_BIT == "8bit"
        assert QuantizationType.AWQ == "awq"


class TestInferenceFramework:
    """Tests for InferenceFramework enum."""

    def test_enum_values(self):
        """Verify enum has correct values."""
        assert InferenceFramework.SGLANG == "sglang"
        assert InferenceFramework.VLLM == "vllm"
        assert InferenceFramework.TRANSFORMERS == "transformers"
