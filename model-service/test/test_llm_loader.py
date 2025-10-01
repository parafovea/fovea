"""Tests for LLM loader with multi-model support and quantization."""

from pathlib import Path
from unittest.mock import Mock, patch

import pytest
import torch

from src.llm_loader import (
    GenerationConfig,
    GenerationResult,
    LLMConfig,
    LLMFramework,
    LLMLoader,
    create_llm_config_from_dict,
    create_llm_loader_with_fallback,
)


@pytest.fixture
def mock_model() -> Mock:
    """Create a mock language model."""
    model = Mock()
    model.eval = Mock()
    model.generate = Mock(return_value=torch.tensor([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]))
    mock_param = Mock()
    mock_param.device = "cpu"
    model.parameters = Mock(return_value=iter([mock_param]))
    return model


@pytest.fixture
def mock_tokenizer() -> Mock:
    """Create a mock tokenizer."""
    tokenizer = Mock()
    tokenizer.pad_token = None
    tokenizer.eos_token = "<eos>"
    tokenizer.eos_token_id = 2
    tokenizer.pad_token_id = 0
    tokenizer.return_value = {
        "input_ids": torch.tensor([[1, 2, 3, 4, 5]]),
        "attention_mask": torch.tensor([[1, 1, 1, 1, 1]]),
    }
    tokenizer.decode = Mock(return_value="Generated text response")
    return tokenizer


class TestLLMConfig:
    """Tests for LLMConfig dataclass."""

    def test_llm_config_creation(self) -> None:
        """Test creating an LLM configuration."""
        config = LLMConfig(
            model_id="meta-llama/Llama-4-Scout",
            quantization="4bit",
            framework=LLMFramework.SGLANG,
            max_tokens=2048,
            temperature=0.8,
            top_p=0.95,
            context_length=100000,
        )

        assert config.model_id == "meta-llama/Llama-4-Scout"
        assert config.quantization == "4bit"
        assert config.framework == LLMFramework.SGLANG
        assert config.max_tokens == 2048
        assert config.temperature == 0.8
        assert config.top_p == 0.95
        assert config.context_length == 100000

    def test_llm_config_defaults(self) -> None:
        """Test LLM configuration with default values."""
        config = LLMConfig(
            model_id="google/gemma-3-27b-it",
            quantization="none",
            framework=LLMFramework.TRANSFORMERS,
        )

        assert config.max_tokens == 4096
        assert config.temperature == 0.7
        assert config.top_p == 0.9
        assert config.context_length == 131072


class TestGenerationConfig:
    """Tests for GenerationConfig dataclass."""

    def test_generation_config_creation(self) -> None:
        """Test creating a generation configuration."""
        config = GenerationConfig(
            max_tokens=512,
            temperature=0.5,
            top_p=0.85,
            stop_sequences=["END", "STOP"],
        )

        assert config.max_tokens == 512
        assert config.temperature == 0.5
        assert config.top_p == 0.85
        assert config.stop_sequences == ["END", "STOP"]

    def test_generation_config_defaults(self) -> None:
        """Test generation configuration with default values."""
        config = GenerationConfig()

        assert config.max_tokens == 4096
        assert config.temperature == 0.7
        assert config.top_p == 0.9
        assert config.stop_sequences is None


class TestLLMLoader:
    """Tests for LLM loader functionality."""

    def test_llm_loader_initialization(self) -> None:
        """Test LLM loader initialization."""
        config = LLMConfig(
            model_id="meta-llama/Llama-3.3-70B-Instruct",
            quantization="4bit",
            framework=LLMFramework.TRANSFORMERS,
        )
        cache_dir = Path("/tmp/models")

        loader = LLMLoader(config, cache_dir)

        assert loader.config == config
        assert loader.cache_dir == cache_dir
        assert loader.model is None
        assert loader.tokenizer is None
        assert not loader.is_loaded()

    def test_create_quantization_config_4bit(self) -> None:
        """Test creating 4-bit quantization configuration."""
        config = LLMConfig(
            model_id="deepseek-ai/DeepSeek-V3",
            quantization="4bit",
            framework=LLMFramework.SGLANG,
        )
        loader = LLMLoader(config)

        quant_config = loader._create_quantization_config()

        assert quant_config is not None
        assert quant_config.load_in_4bit is True
        assert quant_config.bnb_4bit_compute_dtype == torch.float16
        assert quant_config.bnb_4bit_use_double_quant is True
        assert quant_config.bnb_4bit_quant_type == "nf4"

    def test_create_quantization_config_8bit(self) -> None:
        """Test creating 8-bit quantization configuration."""
        config = LLMConfig(
            model_id="google/gemma-3-27b-it",
            quantization="8bit",
            framework=LLMFramework.TRANSFORMERS,
        )
        loader = LLMLoader(config)

        quant_config = loader._create_quantization_config()

        assert quant_config is not None
        assert quant_config.load_in_8bit is True

    def test_create_quantization_config_none(self) -> None:
        """Test creating configuration with no quantization."""
        config = LLMConfig(
            model_id="meta-llama/Llama-4-Scout",
            quantization="none",
            framework=LLMFramework.SGLANG,
        )
        loader = LLMLoader(config)

        quant_config = loader._create_quantization_config()

        assert quant_config is None

    @pytest.mark.asyncio
    async def test_load_model_success(
        self, mock_model: Mock, mock_tokenizer: Mock
    ) -> None:
        """Test successful model loading."""
        config = LLMConfig(
            model_id="meta-llama/Llama-4-Scout",
            quantization="4bit",
            framework=LLMFramework.SGLANG,
        )
        loader = LLMLoader(config)

        with (
            patch(
                "src.llm_loader.AutoTokenizer.from_pretrained",
                return_value=mock_tokenizer,
            ),
            patch(
                "src.llm_loader.AutoModelForCausalLM.from_pretrained",
                return_value=mock_model,
            ),
        ):
            await loader.load()

            assert loader.is_loaded()
            assert loader.tokenizer is not None
            assert loader.model is not None
            mock_model.eval.assert_called_once()

    @pytest.mark.asyncio
    async def test_load_model_sets_pad_token(
        self, mock_model: Mock, mock_tokenizer: Mock
    ) -> None:
        """Test that pad token is set if missing."""
        mock_tokenizer.pad_token = None
        config = LLMConfig(
            model_id="google/gemma-3-27b-it",
            quantization="none",
            framework=LLMFramework.TRANSFORMERS,
        )
        loader = LLMLoader(config)

        with (
            patch(
                "src.llm_loader.AutoTokenizer.from_pretrained",
                return_value=mock_tokenizer,
            ),
            patch(
                "src.llm_loader.AutoModelForCausalLM.from_pretrained",
                return_value=mock_model,
            ),
        ):
            await loader.load()

            assert mock_tokenizer.pad_token == mock_tokenizer.eos_token

    @pytest.mark.asyncio
    async def test_load_model_failure(self) -> None:
        """Test model loading failure handling."""
        config = LLMConfig(
            model_id="invalid/model-id",
            quantization="4bit",
            framework=LLMFramework.TRANSFORMERS,
        )
        loader = LLMLoader(config)

        with patch(
            "src.llm_loader.AutoTokenizer.from_pretrained",
            side_effect=ValueError("Model not found"),
        ):
            with pytest.raises(RuntimeError, match="Failed to load model"):
                await loader.load()

            assert not loader.is_loaded()

    @pytest.mark.asyncio
    async def test_load_model_idempotent(
        self, mock_model: Mock, mock_tokenizer: Mock
    ) -> None:
        """Test that loading an already-loaded model is idempotent."""
        config = LLMConfig(
            model_id="meta-llama/Llama-3.3-70B-Instruct",
            quantization="4bit",
            framework=LLMFramework.TRANSFORMERS,
        )
        loader = LLMLoader(config)

        with (
            patch(
                "src.llm_loader.AutoTokenizer.from_pretrained",
                return_value=mock_tokenizer,
            ) as mock_tokenizer_load,
            patch(
                "src.llm_loader.AutoModelForCausalLM.from_pretrained",
                return_value=mock_model,
            ) as mock_model_load,
        ):
            await loader.load()
            await loader.load()

            mock_tokenizer_load.assert_called_once()
            mock_model_load.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_text_success(
        self, mock_model: Mock, mock_tokenizer: Mock
    ) -> None:
        """Test successful text generation."""
        config = LLMConfig(
            model_id="deepseek-ai/DeepSeek-V3",
            quantization="4bit",
            framework=LLMFramework.SGLANG,
        )
        loader = LLMLoader(config)
        loader.model = mock_model
        loader.tokenizer = mock_tokenizer

        mock_model.generate.return_value = torch.tensor([[1, 2, 3, 4, 5, 6, 7, 8, 9, 2]])

        result = await loader.generate("Test prompt for ontology augmentation")

        assert isinstance(result, GenerationResult)
        assert result.text == "Generated text response"
        assert result.tokens_used == 5
        assert result.finish_reason == "eos"
        mock_tokenizer.assert_called_once()
        mock_model.generate.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_with_custom_config(
        self, mock_model: Mock, mock_tokenizer: Mock
    ) -> None:
        """Test text generation with custom generation config."""
        config = LLMConfig(
            model_id="meta-llama/Llama-4-Scout",
            quantization="4bit",
            framework=LLMFramework.SGLANG,
        )
        loader = LLMLoader(config)
        loader.model = mock_model
        loader.tokenizer = mock_tokenizer

        gen_config = GenerationConfig(
            max_tokens=1024, temperature=0.3, top_p=0.8, stop_sequences=["END"]
        )

        await loader.generate("Custom config prompt", gen_config)

        call_kwargs = mock_model.generate.call_args.kwargs
        assert call_kwargs["max_new_tokens"] == 1024
        assert call_kwargs["temperature"] == 0.3
        assert call_kwargs["top_p"] == 0.8

    @pytest.mark.asyncio
    async def test_generate_model_not_loaded(self) -> None:
        """Test generation fails if model is not loaded."""
        config = LLMConfig(
            model_id="google/gemma-3-27b-it",
            quantization="4bit",
            framework=LLMFramework.TRANSFORMERS,
        )
        loader = LLMLoader(config)

        with pytest.raises(RuntimeError, match="Model not loaded"):
            await loader.generate("Test prompt")

    @pytest.mark.asyncio
    async def test_generate_failure(self, mock_model: Mock, mock_tokenizer: Mock) -> None:
        """Test generation failure handling."""
        config = LLMConfig(
            model_id="meta-llama/Llama-3.3-70B-Instruct",
            quantization="4bit",
            framework=LLMFramework.TRANSFORMERS,
        )
        loader = LLMLoader(config)
        loader.model = mock_model
        loader.tokenizer = mock_tokenizer

        mock_model.generate.side_effect = RuntimeError("CUDA out of memory")

        with pytest.raises(RuntimeError, match="Generation failed"):
            await loader.generate("Test prompt")

    @pytest.mark.asyncio
    async def test_unload_model(self, mock_model: Mock, mock_tokenizer: Mock) -> None:
        """Test unloading model from memory."""
        config = LLMConfig(
            model_id="deepseek-ai/DeepSeek-V3",
            quantization="4bit",
            framework=LLMFramework.SGLANG,
        )
        loader = LLMLoader(config)
        loader.model = mock_model
        loader.tokenizer = mock_tokenizer

        assert loader.is_loaded()

        with patch("src.llm_loader.torch.cuda.is_available", return_value=True), patch(
            "src.llm_loader.torch.cuda.empty_cache"
        ) as mock_empty_cache:
            await loader.unload()

            assert not loader.is_loaded()
            assert loader.model is None
            assert loader.tokenizer is None
            mock_empty_cache.assert_called_once()

    @pytest.mark.asyncio
    async def test_unload_model_idempotent(self) -> None:
        """Test that unloading an already-unloaded model is safe."""
        config = LLMConfig(
            model_id="meta-llama/Llama-4-Scout",
            quantization="4bit",
            framework=LLMFramework.SGLANG,
        )
        loader = LLMLoader(config)

        await loader.unload()
        await loader.unload()

        assert not loader.is_loaded()

    def test_get_memory_usage_cuda_available(self) -> None:
        """Test getting memory usage when CUDA is available."""
        config = LLMConfig(
            model_id="google/gemma-3-27b-it",
            quantization="4bit",
            framework=LLMFramework.TRANSFORMERS,
        )
        loader = LLMLoader(config)

        with patch("src.llm_loader.torch.cuda.is_available", return_value=True), patch(
            "src.llm_loader.torch.cuda.memory_allocated", return_value=1024 * 1024 * 1024
        ), patch(
            "src.llm_loader.torch.cuda.memory_reserved", return_value=2 * 1024 * 1024 * 1024
        ):
            usage = loader.get_memory_usage()

            assert usage["allocated"] == 1024 * 1024 * 1024
            assert usage["reserved"] == 2 * 1024 * 1024 * 1024

    def test_get_memory_usage_cuda_not_available(self) -> None:
        """Test getting memory usage when CUDA is not available."""
        config = LLMConfig(
            model_id="meta-llama/Llama-3.3-70B-Instruct",
            quantization="none",
            framework=LLMFramework.TRANSFORMERS,
        )
        loader = LLMLoader(config)

        with patch("src.llm_loader.torch.cuda.is_available", return_value=False):
            usage = loader.get_memory_usage()

            assert usage["allocated"] == 0
            assert usage["reserved"] == 0


class TestConfigUtilities:
    """Tests for configuration utility functions."""

    def test_create_llm_config_from_dict(self) -> None:
        """Test creating LLM config from dictionary."""
        model_dict = {
            "model_id": "meta-llama/Llama-4-Scout",
            "quantization": "4bit",
            "framework": "sglang",
            "max_tokens": 2048,
            "temperature": 0.8,
            "top_p": 0.95,
            "context_length": 1000000,
        }

        config = create_llm_config_from_dict(model_dict)

        assert config.model_id == "meta-llama/Llama-4-Scout"
        assert config.quantization == "4bit"
        assert config.framework == LLMFramework.SGLANG
        assert config.max_tokens == 2048
        assert config.temperature == 0.8
        assert config.top_p == 0.95
        assert config.context_length == 1000000

    def test_create_llm_config_from_dict_minimal(self) -> None:
        """Test creating LLM config with minimal dictionary."""
        model_dict = {
            "model_id": "google/gemma-3-27b-it",
            "quantization": "none",
            "framework": "transformers",
        }

        config = create_llm_config_from_dict(model_dict)

        assert config.model_id == "google/gemma-3-27b-it"
        assert config.quantization == "none"
        assert config.framework == LLMFramework.TRANSFORMERS
        assert config.max_tokens == 4096
        assert config.temperature == 0.7

    def test_create_llm_config_missing_key(self) -> None:
        """Test error when required key is missing."""
        model_dict = {
            "model_id": "deepseek-ai/DeepSeek-V3",
            "quantization": "4bit",
        }

        with pytest.raises(ValueError, match="Missing required key: framework"):
            create_llm_config_from_dict(model_dict)

    def test_create_llm_config_invalid_framework(self) -> None:
        """Test error when framework is invalid."""
        model_dict = {
            "model_id": "meta-llama/Llama-3.3-70B-Instruct",
            "quantization": "4bit",
            "framework": "invalid_framework",
        }

        with pytest.raises(ValueError, match="Invalid framework"):
            create_llm_config_from_dict(model_dict)


class TestFallbackLoading:
    """Tests for fallback model loading."""

    @pytest.mark.asyncio
    async def test_create_llm_loader_with_fallback_primary_success(
        self, mock_model: Mock, mock_tokenizer: Mock
    ) -> None:
        """Test fallback loader uses primary model when loading succeeds."""
        primary = LLMConfig(
            model_id="meta-llama/Llama-4-Scout",
            quantization="4bit",
            framework=LLMFramework.SGLANG,
        )
        fallback1 = LLMConfig(
            model_id="meta-llama/Llama-3.3-70B-Instruct",
            quantization="4bit",
            framework=LLMFramework.TRANSFORMERS,
        )
        fallback2 = LLMConfig(
            model_id="google/gemma-3-27b-it",
            quantization="4bit",
            framework=LLMFramework.TRANSFORMERS,
        )

        with (
            patch(
                "src.llm_loader.AutoTokenizer.from_pretrained",
                return_value=mock_tokenizer,
            ),
            patch(
                "src.llm_loader.AutoModelForCausalLM.from_pretrained",
                return_value=mock_model,
            ),
        ):
            loader = await create_llm_loader_with_fallback(
                primary, [fallback1, fallback2]
            )

            assert loader.is_loaded()
            assert loader.config.model_id == "meta-llama/Llama-4-Scout"

    @pytest.mark.asyncio
    async def test_create_llm_loader_with_fallback_uses_fallback(
        self, mock_model: Mock, mock_tokenizer: Mock
    ) -> None:
        """Test fallback loader uses fallback model when primary fails."""
        primary = LLMConfig(
            model_id="meta-llama/Llama-4-Scout",
            quantization="4bit",
            framework=LLMFramework.SGLANG,
        )
        fallback = LLMConfig(
            model_id="google/gemma-3-27b-it",
            quantization="4bit",
            framework=LLMFramework.TRANSFORMERS,
        )

        call_count = 0

        def mock_from_pretrained(*args: tuple, **kwargs: dict) -> Mock:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RuntimeError("Primary model failed")
            return mock_model

        with (
            patch(
                "src.llm_loader.AutoTokenizer.from_pretrained",
                return_value=mock_tokenizer,
            ),
            patch(
                "src.llm_loader.AutoModelForCausalLM.from_pretrained",
                side_effect=mock_from_pretrained,
            ),
            patch("builtins.print") as mock_print,
        ):
            loader = await create_llm_loader_with_fallback(primary, [fallback])

            assert loader.is_loaded()
            assert loader.config.model_id == "google/gemma-3-27b-it"
            mock_print.assert_any_call("Loaded fallback model: google/gemma-3-27b-it")

    @pytest.mark.asyncio
    async def test_create_llm_loader_with_fallback_all_fail(self) -> None:
        """Test fallback loader raises error when all models fail."""
        primary = LLMConfig(
            model_id="meta-llama/Llama-4-Scout",
            quantization="4bit",
            framework=LLMFramework.SGLANG,
        )
        fallback = LLMConfig(
            model_id="google/gemma-3-27b-it",
            quantization="4bit",
            framework=LLMFramework.TRANSFORMERS,
        )

        with (
            patch(
                "src.llm_loader.AutoTokenizer.from_pretrained",
                side_effect=RuntimeError("Model failed"),
            ),
            patch("builtins.print"),
        ):
            with pytest.raises(RuntimeError, match="All model loading attempts failed"):
                await create_llm_loader_with_fallback(primary, [fallback])


class TestDiverseExamples:
    """Tests using diverse domain examples (not tactical analysis)."""

    @pytest.mark.asyncio
    async def test_medical_research_use_case(
        self, mock_model: Mock, mock_tokenizer: Mock
    ) -> None:
        """Test LLM generation for medical research ontology augmentation."""
        config = LLMConfig(
            model_id="meta-llama/Llama-4-Scout",
            quantization="4bit",
            framework=LLMFramework.SGLANG,
        )
        loader = LLMLoader(config)
        loader.model = mock_model
        loader.tokenizer = mock_tokenizer

        prompt = """Augment surgical procedure ontology with subtypes for laparoscopic
        appendectomy. Suggest relevant instrument types and procedure phases."""

        result = await loader.generate(prompt)

        assert isinstance(result, GenerationResult)
        assert len(result.text) > 0

    @pytest.mark.asyncio
    async def test_retail_analytics_use_case(
        self, mock_model: Mock, mock_tokenizer: Mock
    ) -> None:
        """Test LLM generation for retail customer behavior ontology."""
        config = LLMConfig(
            model_id="deepseek-ai/DeepSeek-V3",
            quantization="4bit",
            framework=LLMFramework.SGLANG,
        )
        loader = LLMLoader(config)
        loader.model = mock_model
        loader.tokenizer = mock_tokenizer

        prompt = """Generate entity types for retail store analysis: customer behaviors,
        product interactions, and staff activities. Focus on checkout flow events."""

        result = await loader.generate(prompt, GenerationConfig(temperature=0.5))

        assert isinstance(result, GenerationResult)
        assert result.tokens_used > 0

    @pytest.mark.asyncio
    async def test_wildlife_biology_use_case(
        self, mock_model: Mock, mock_tokenizer: Mock
    ) -> None:
        """Test LLM generation for wildlife tracking ontology."""
        config = LLMConfig(
            model_id="google/gemma-3-27b-it",
            quantization="4bit",
            framework=LLMFramework.TRANSFORMERS,
        )
        loader = LLMLoader(config)
        loader.model = mock_model
        loader.tokenizer = mock_tokenizer

        prompt = """Create event types for whale pod behavior analysis: feeding events,
        social interactions, migration patterns, and vocal communication."""

        result = await loader.generate(prompt, GenerationConfig(max_tokens=2048))

        assert isinstance(result, GenerationResult)
        assert result.finish_reason in ["eos", "length"]

    @pytest.mark.asyncio
    async def test_sports_analytics_use_case(
        self, mock_model: Mock, mock_tokenizer: Mock
    ) -> None:
        """Test LLM generation for basketball game analysis ontology."""
        config = LLMConfig(
            model_id="meta-llama/Llama-3.3-70B-Instruct",
            quantization="4bit",
            framework=LLMFramework.TRANSFORMERS,
        )
        loader = LLMLoader(config)
        loader.model = mock_model
        loader.tokenizer = mock_tokenizer

        prompt = """Suggest entity and event types for basketball game annotation:
        player positions, offensive plays, defensive formations, and scoring events."""

        result = await loader.generate(prompt)

        assert isinstance(result, GenerationResult)
        mock_model.generate.assert_called_once()
