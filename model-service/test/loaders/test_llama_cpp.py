"""Tests for llama.cpp LLM and VLM loaders."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, Mock, patch

import pytest

from src.domain.entities.architectures import Llama3LLM, QwenVL

# Default LLM architecture for legacy tests that predate the
# architecture-keyed dispatch and constructed LlamaCppLLMLoader with a
# single config arg.
_DEFAULT_LLM_ARCH = Llama3LLM()
from src.infrastructure.adapters.outbound.models.llama_cpp.base import LlamaCppConfig
from src.infrastructure.adapters.outbound.models.llama_cpp.llm import LlamaCppLLMLoader
from src.infrastructure.adapters.outbound.models.llama_cpp.vlm import LlamaCppVLMLoader
from src.infrastructure.adapters.outbound.models.llm.loader import (
    GenerationConfig,
    GenerationResult,
    LLMConfig,
    LLMFramework,
    LLMLoader,
    create_llm_loader,
)

pytestmark = pytest.mark.requires_models


# ---------------------------------------------------------------------------
# LlamaCppConfig
# ---------------------------------------------------------------------------


class TestLlamaCppConfig:
    """Tests for the LlamaCppConfig dataclass and model resolution."""

    def test_creation_with_defaults(self) -> None:
        config = LlamaCppConfig(model_id="TheBloke/Llama-2-7B-GGUF")

        assert config.model_id == "TheBloke/Llama-2-7B-GGUF"
        assert config.gguf_filename == ""
        assert config.n_ctx == 4096
        assert config.n_threads == 4
        assert config.n_gpu_layers == 0
        assert config.verbose is False
        assert config.cache_dir is None

    def test_creation_with_custom_values(self) -> None:
        config = LlamaCppConfig(
            model_id="TheBloke/Llama-2-7B-GGUF",
            gguf_filename="llama-2-7b.Q4_K_M.gguf",
            n_ctx=8192,
            n_threads=8,
            n_gpu_layers=10,
            verbose=True,
            cache_dir=Path("/tmp/models"),
        )

        assert config.gguf_filename == "llama-2-7b.Q4_K_M.gguf"
        assert config.n_ctx == 8192
        assert config.n_threads == 8
        assert config.n_gpu_layers == 10
        assert config.verbose is True
        assert config.cache_dir == Path("/tmp/models")

    @patch("huggingface_hub.hf_hub_download", return_value="/cache/model.gguf")
    def test_resolve_model_path_with_explicit_filename(self, mock_download: Mock) -> None:
        config = LlamaCppConfig(
            model_id="TheBloke/Llama-2-7B-GGUF",
            gguf_filename="llama-2-7b.Q4_K_M.gguf",
        )

        path = config.resolve_model_path()

        assert path == "/cache/model.gguf"
        mock_download.assert_called_once_with(
            repo_id="TheBloke/Llama-2-7B-GGUF",
            filename="llama-2-7b.Q4_K_M.gguf",
            cache_dir=None,
        )

    @patch("huggingface_hub.hf_hub_download", return_value="/cache/auto.gguf")
    @patch(
        "huggingface_hub.list_repo_files",
        return_value=[
            "README.md",
            "model-q4_k_m.gguf",
            "model-q5_k_m.gguf",
        ],
    )
    def test_resolve_model_path_auto_detects_q4_k_m(
        self, _mock_list: Mock, mock_download: Mock
    ) -> None:
        config = LlamaCppConfig(model_id="TheBloke/Llama-2-7B-GGUF")

        path = config.resolve_model_path()

        assert path == "/cache/auto.gguf"
        mock_download.assert_called_once_with(
            repo_id="TheBloke/Llama-2-7B-GGUF",
            filename="model-q4_k_m.gguf",
            cache_dir=None,
        )

    @patch("huggingface_hub.hf_hub_download", return_value="/cache/fallback.gguf")
    @patch(
        "huggingface_hub.list_repo_files",
        return_value=["README.md", "model-f16.gguf"],
    )
    def test_resolve_model_path_falls_back_to_first_gguf(
        self, _mock_list: Mock, mock_download: Mock
    ) -> None:
        config = LlamaCppConfig(model_id="TheBloke/Llama-2-7B-GGUF")

        path = config.resolve_model_path()

        assert path == "/cache/fallback.gguf"
        mock_download.assert_called_once_with(
            repo_id="TheBloke/Llama-2-7B-GGUF",
            filename="model-f16.gguf",
            cache_dir=None,
        )

    @patch(
        "huggingface_hub.list_repo_files",
        return_value=["README.md", "config.json"],
    )
    def test_resolve_model_path_raises_when_no_gguf(self, _mock_list: Mock) -> None:
        config = LlamaCppConfig(model_id="TheBloke/Llama-2-7B-GGUF")

        with pytest.raises(FileNotFoundError, match="No GGUF files found"):
            config.resolve_model_path()


# ---------------------------------------------------------------------------
# LlamaCppLLMLoader
# ---------------------------------------------------------------------------


class TestLlamaCppLLMLoader:
    """Tests for the llama.cpp LLM loader async lifecycle and generation."""

    def test_is_loaded_initially_false(self) -> None:
        config = LlamaCppConfig(model_id="TheBloke/Llama-2-7B-GGUF")
        loader = LlamaCppLLMLoader(_DEFAULT_LLM_ARCH, config)

        assert loader.is_loaded is False

    @pytest.mark.asyncio
    @patch.object(LlamaCppConfig, "resolve_model_path", return_value="/fake/model.gguf")
    async def test_load_initializes_model(self, _mock_resolve: Mock) -> None:
        mock_llama_cls = MagicMock()
        mock_llama_mod = MagicMock()
        mock_llama_mod.Llama = mock_llama_cls

        config = LlamaCppConfig(model_id="TheBloke/Llama-2-7B-GGUF")
        loader = LlamaCppLLMLoader(_DEFAULT_LLM_ARCH, config)

        with patch.dict("sys.modules", {"llama_cpp": mock_llama_mod}):
            await loader.load()

        assert loader.is_loaded
        mock_llama_cls.assert_called_once_with(
            model_path="/fake/model.gguf",
            n_ctx=4096,
            n_threads=4,
            n_gpu_layers=0,
            verbose=False,
        )

    @pytest.mark.asyncio
    async def test_generate_raises_when_not_loaded(self) -> None:
        config = LlamaCppConfig(model_id="TheBloke/Llama-2-7B-GGUF")
        loader = LlamaCppLLMLoader(_DEFAULT_LLM_ARCH, config)

        with pytest.raises(RuntimeError, match="Model not loaded"):
            await loader.generate("Hello")

    @pytest.mark.asyncio
    async def test_generate_returns_result(self) -> None:
        config = LlamaCppConfig(model_id="TheBloke/Llama-2-7B-GGUF")
        loader = LlamaCppLLMLoader(_DEFAULT_LLM_ARCH, config)

        mock_model = MagicMock()
        mock_model.create_completion.return_value = {
            "choices": [{"text": "Generated text", "finish_reason": "stop"}],
            "usage": {"total_tokens": 42},
        }
        loader._model = mock_model

        result = await loader.generate("Hello", GenerationConfig(max_tokens=100))

        assert isinstance(result, GenerationResult)
        assert result.text == "Generated text"
        assert result.tokens_used == 42
        assert result.finish_reason == "stop"

    @pytest.mark.asyncio
    async def test_generate_passes_stop_sequences(self) -> None:
        config = LlamaCppConfig(model_id="TheBloke/Llama-2-7B-GGUF")
        loader = LlamaCppLLMLoader(_DEFAULT_LLM_ARCH, config)

        mock_model = MagicMock()
        mock_model.create_completion.return_value = {
            "choices": [{"text": "output", "finish_reason": "stop"}],
            "usage": {"total_tokens": 10},
        }
        loader._model = mock_model

        gen_config = GenerationConfig(max_tokens=50, stop_sequences=["---END---"])
        await loader.generate("prompt", gen_config)

        call_kwargs = mock_model.create_completion.call_args[1]
        assert call_kwargs["stop"] == ["---END---"]

    @pytest.mark.asyncio
    async def test_unload_clears_model(self) -> None:
        config = LlamaCppConfig(model_id="TheBloke/Llama-2-7B-GGUF")
        loader = LlamaCppLLMLoader(_DEFAULT_LLM_ARCH, config)
        loader._model = MagicMock()

        await loader.unload()

        assert loader._model is None
        assert loader.is_loaded is False


# ---------------------------------------------------------------------------
# LlamaCppVLMLoader
# ---------------------------------------------------------------------------


class TestLlamaCppVLMLoader:
    """Tests for the llama.cpp VLM loader with multimodal generation."""

    def test_is_loaded_initially_false(self) -> None:
        config = LlamaCppConfig(model_id="qwen/qwen2.5-vl-3b-gguf")
        loader = LlamaCppVLMLoader(QwenVL(), config)

        assert loader.is_loaded is False

    def test_generate_raises_when_not_loaded(self) -> None:
        config = LlamaCppConfig(model_id="qwen/qwen2.5-vl-3b-gguf")
        loader = LlamaCppVLMLoader(QwenVL(), config)

        from PIL import Image

        img = Image.new("RGB", (100, 100))

        with pytest.raises(RuntimeError, match="Model not loaded"):
            loader.generate(images=[img], prompt="Describe this image")

    def test_generate_returns_text(self) -> None:
        config = LlamaCppConfig(model_id="qwen/qwen2.5-vl-3b-gguf")
        loader = LlamaCppVLMLoader(QwenVL(), config)

        mock_model = MagicMock()
        mock_model.create_chat_completion.return_value = {
            "choices": [{"message": {"content": "A cat sitting on a mat."}}]
        }
        loader._model = mock_model

        from PIL import Image

        img = Image.new("RGB", (100, 100))

        result = loader.generate(images=[img], prompt="What is in this image?")

        assert result == "A cat sitting on a mat."
        mock_model.create_chat_completion.assert_called_once()

    def test_unload_clears_model(self) -> None:
        config = LlamaCppConfig(model_id="qwen/qwen2.5-vl-3b-gguf")
        loader = LlamaCppVLMLoader(QwenVL(), config)
        loader._model = MagicMock()

        loader.unload()

        assert loader._model is None
        assert loader.is_loaded is False


# ---------------------------------------------------------------------------
# create_llm_loader factory
# ---------------------------------------------------------------------------


class TestCreateLLMLoaderFactory:
    """Tests for the create_llm_loader factory function dispatch."""

    def test_dispatches_to_llama_cpp_loader(self) -> None:
        config = LLMConfig(
            model_id="TheBloke/Llama-2-7B-GGUF",
            quantization="gguf_q4_k_m",
            framework=LLMFramework.LLAMA_CPP,
            max_tokens=2048,
        )

        loader = create_llm_loader(_DEFAULT_LLM_ARCH, config, cache_dir=Path("/tmp/models"))

        assert isinstance(loader, LlamaCppLLMLoader)
        assert loader.config.model_id == "TheBloke/Llama-2-7B-GGUF"
        assert loader.config.n_ctx == 2048
        assert loader.config.cache_dir == Path("/tmp/models")

    def test_dispatches_to_transformers_loader(self) -> None:
        config = LLMConfig(
            model_id="Qwen/Qwen2.5-1.5B-Instruct",
            quantization="none",
            framework=LLMFramework.TRANSFORMERS,
        )

        loader = create_llm_loader(_DEFAULT_LLM_ARCH, config)

        assert isinstance(loader, LLMLoader)
