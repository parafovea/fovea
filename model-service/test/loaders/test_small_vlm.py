"""Tests for SmallVLMLoader and VLM factory dispatch on CPU paths."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
import torch

from src.domain.entities.architectures import Moondream, QwenLLM, QwenVL, SmolVLM
from src.infrastructure.adapters.outbound.models.llama_cpp.vlm import LlamaCppVLMLoader
from src.infrastructure.adapters.outbound.models.registry import UnknownArchitectureError
from src.infrastructure.adapters.outbound.models.vlm.loader import (
    InferenceFramework,
    SmallVLMLoader,
    VLMConfig,
    create_vlm_loader,
)

pytestmark = pytest.mark.requires_models


@pytest.fixture
def small_vlm_config() -> VLMConfig:
    """Create a VLM config for a small CPU model."""
    return VLMConfig(
        model_id="HuggingFaceTB/SmolVLM-256M-Instruct",
        framework=InferenceFramework.TRANSFORMERS,
    )


@pytest.fixture
def smolvlm_arch() -> SmolVLM:
    return SmolVLM()


@pytest.fixture
def moondream_arch() -> Moondream:
    return Moondream()


# ---------------------------------------------------------------------------
# SmallVLMLoader
# ---------------------------------------------------------------------------


class TestSmallVLMLoader:
    """Tests for the SmallVLMLoader Transformers-based CPU VLM."""

    def test_initial_state(self, smolvlm_arch: SmolVLM, small_vlm_config: VLMConfig) -> None:
        loader = SmallVLMLoader(smolvlm_arch, small_vlm_config)

        assert loader.arch is smolvlm_arch
        assert loader._model is None
        assert loader._processor is None

    @patch(
        "src.infrastructure.adapters.outbound.models.vlm.loaders.small_vlm.AutoModelForImageTextToText"
    )
    @patch("src.infrastructure.adapters.outbound.models.vlm.loaders.small_vlm.AutoProcessor")
    def test_load_initializes_model_and_processor(
        self,
        mock_processor_cls: MagicMock,
        mock_model_cls: MagicMock,
        smolvlm_arch: SmolVLM,
        small_vlm_config: VLMConfig,
    ) -> None:
        mock_processor_cls.from_pretrained.return_value = MagicMock()
        mock_model_cls.from_pretrained.return_value = MagicMock()

        loader = SmallVLMLoader(smolvlm_arch, small_vlm_config)
        loader.load()

        mock_processor_cls.from_pretrained.assert_called_once_with(
            "HuggingFaceTB/SmolVLM-256M-Instruct", trust_remote_code=True
        )
        mock_model_cls.from_pretrained.assert_called_once_with(
            "HuggingFaceTB/SmolVLM-256M-Instruct",
            torch_dtype=torch.float32,
            device_map="cpu",
            trust_remote_code=True,
        )

    def test_generate_raises_when_not_loaded(
        self, smolvlm_arch: SmolVLM, small_vlm_config: VLMConfig
    ) -> None:
        loader = SmallVLMLoader(smolvlm_arch, small_vlm_config)

        from PIL import Image

        img = Image.new("RGB", (100, 100))

        with pytest.raises(RuntimeError, match="Model not loaded"):
            loader.generate(images=[img], prompt="Describe")

    def test_generate_returns_decoded_text(
        self, smolvlm_arch: SmolVLM, small_vlm_config: VLMConfig
    ) -> None:
        loader = SmallVLMLoader(smolvlm_arch, small_vlm_config)

        mock_processor = MagicMock()
        mock_processor.return_value = {
            "input_ids": torch.tensor([[1, 2, 3, 4, 5]]),
        }
        mock_processor.decode.return_value = "A beautiful landscape"
        loader._processor = mock_processor

        mock_model = MagicMock()
        mock_model.generate.return_value = torch.tensor([[1, 2, 3, 4, 5, 6, 7, 8]])
        loader._model = mock_model

        from PIL import Image

        img = Image.new("RGB", (100, 100))

        result = loader.generate(images=[img], prompt="Describe this")

        assert result == "A beautiful landscape"
        mock_processor.decode.assert_called_once()

    def test_unload_clears_model_and_processor(
        self, smolvlm_arch: SmolVLM, small_vlm_config: VLMConfig
    ) -> None:
        loader = SmallVLMLoader(smolvlm_arch, small_vlm_config)
        loader._model = MagicMock()
        loader._processor = MagicMock()

        loader.unload()

        assert loader._model is None
        assert loader._processor is None


# ---------------------------------------------------------------------------
# create_vlm_loader factory dispatch
# ---------------------------------------------------------------------------


class TestCreateVLMLoaderDispatch:
    """Tests for the create_vlm_loader factory dispatching to CPU loaders.

    The factory's only legitimate dispatch keys are
    (a) ``config.framework`` (framework-level pre-dispatch into the GGUF
    loader) and (b) the architecture Pydantic class (registry lookup). No
    substring matching on ``model_id`` is permitted.
    """

    def test_dispatches_smolvlm_to_small_vlm_loader(self) -> None:
        config = VLMConfig(
            model_id="HuggingFaceTB/SmolVLM-256M-Instruct",
            framework=InferenceFramework.TRANSFORMERS,
        )

        loader = create_vlm_loader(SmolVLM(), config)

        assert isinstance(loader, SmallVLMLoader)

    def test_dispatches_moondream_to_small_vlm_loader(self) -> None:
        config = VLMConfig(
            model_id="vikhyatk/moondream2",
            framework=InferenceFramework.TRANSFORMERS,
        )

        loader = create_vlm_loader(Moondream(), config)

        assert isinstance(loader, SmallVLMLoader)

    def test_dispatches_llama_cpp_framework(self) -> None:
        config = VLMConfig(
            model_id="Qwen/Qwen2.5-VL-3B-Instruct-GGUF",
            framework=InferenceFramework.LLAMA_CPP,
        )

        loader = create_vlm_loader(QwenVL(), config)

        assert isinstance(loader, LlamaCppVLMLoader)

    def test_raises_for_architecture_outside_family(self) -> None:
        """An LLM architecture must not silently dispatch to a VLM loader."""
        config = VLMConfig(
            model_id="Qwen/Qwen2.5-1.5B-Instruct",
            framework=InferenceFramework.TRANSFORMERS,
        )

        with pytest.raises(UnknownArchitectureError):
            create_vlm_loader(QwenLLM(), config)  # type: ignore[arg-type]
