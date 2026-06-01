"""Tests for the VLM family loader factory.

These tests pin the architecture-keyed dispatch contract for
:func:`create_vlm_loader`:

  * every registered architecture resolves to the loader class declared
    by ``@vlm_registry.register(...)`` in :mod:`vlm.loader`
  * the framework-level pre-dispatch (``InferenceFramework.LLAMA_CPP``)
    returns the GGUF loader for any architecture
  * an architecture from a different family (LLM, Detection, etc.)
    raises :class:`UnknownArchitectureError` with the VLM family in the
    message rather than silently returning a misconfigured loader

No test in this module may inspect ``model_id`` substrings. The
architecture Pydantic class is the only legitimate dispatch key.
"""

from __future__ import annotations

import pytest

from src.domain.entities.architectures import (
    Gemma3VL,
    InternVL3,
    Llama4Maverick,
    Moondream,
    Pixtral,
    QwenLLM,
    Qwen3VL,
    QwenVL,
    SmolVLM,
    Tarsier2,
)
from src.infrastructure.adapters.outbound.models.llama_cpp.vlm import LlamaCppVLMLoader
from src.infrastructure.adapters.outbound.models.registry import UnknownArchitectureError
from src.infrastructure.adapters.outbound.models.vlm.loader import (
    Gemma3Loader,
    InferenceFramework,
    InternVL3Loader,
    Llama4MaverickLoader,
    PixtralLargeLoader,
    QuantizationType,
    Qwen25VLLoader,
    SmallVLMLoader,
    VLMConfig,
    create_vlm_loader,
    vlm_registry,
)


def _transformers_config(model_id: str = "fake-model") -> VLMConfig:
    """Build a VLMConfig pinned to the Transformers framework.

    The factory never reaches into HuggingFace at construction time, so a
    placeholder model id is sufficient for dispatch-only tests.
    """
    return VLMConfig(
        model_id=model_id,
        quantization=QuantizationType.NONE,
        framework=InferenceFramework.TRANSFORMERS,
        device="cpu",
    )


class TestRegistryBindings:
    """Each VLMArchitecture subclass binds to exactly the loader it should."""

    @pytest.mark.parametrize(
        ("architecture", "loader_cls"),
        [
            (Llama4Maverick(), Llama4MaverickLoader),
            (Gemma3VL(), Gemma3Loader),
            (InternVL3(), InternVL3Loader),
            (Pixtral(), PixtralLargeLoader),
            (QwenVL(), Qwen25VLLoader),
            (Qwen3VL(), Qwen25VLLoader),
            (Tarsier2(), Qwen25VLLoader),
            (SmolVLM(), SmallVLMLoader),
            (Moondream(), SmallVLMLoader),
        ],
    )
    def test_create_dispatches_to_registered_loader(
        self,
        architecture: object,
        loader_cls: type,
    ) -> None:
        loader = create_vlm_loader(architecture, _transformers_config())  # type: ignore[arg-type]
        assert isinstance(loader, loader_cls)
        assert loader.arch is architecture
        assert loader.config.framework == InferenceFramework.TRANSFORMERS

    def test_every_vlm_architecture_has_a_loader(self) -> None:
        """The registry covers every VLMArchitecture subclass in the union."""
        from src.domain.entities.architectures import VLMArchitecture  # noqa: PLC0415
        from typing import get_args

        # VLMArchitecture is Annotated[Union[...], Field(...)]; unwrap to the union.
        union_type = get_args(VLMArchitecture)[0]
        members = set(get_args(union_type))
        registered = set(vlm_registry.registered_architectures)
        missing = members - registered
        assert not missing, (
            f"VLMArchitecture subclasses without a registered loader: "
            f"{sorted(c.__name__ for c in missing)}"
        )


class TestFrameworkPreDispatch:
    """LLAMA_CPP short-circuits architecture dispatch into the GGUF loader."""

    @pytest.mark.parametrize(
        "architecture",
        [QwenVL(), Moondream(), SmolVLM(), Qwen3VL()],
    )
    def test_llama_cpp_framework_returns_gguf_loader(self, architecture: object) -> None:
        config = VLMConfig(
            model_id="Qwen/Qwen2.5-VL-3B-Instruct-GGUF",
            quantization=QuantizationType.NONE,
            framework=InferenceFramework.LLAMA_CPP,
            device="cpu",
        )
        loader = create_vlm_loader(architecture, config)  # type: ignore[arg-type]
        assert isinstance(loader, LlamaCppVLMLoader)
        assert loader.arch is architecture
        # The GGUF loader carries its own LlamaCppConfig wrapping the model id;
        # we only assert dispatch-time invariants here, not load-time behavior.
        assert loader.config.model_id == "Qwen/Qwen2.5-VL-3B-Instruct-GGUF"

    def test_transformers_smolvlm_returns_small_vlm_loader(self) -> None:
        """Sanity-check the non-LLAMA_CPP path for the smallest CPU VLM."""
        arch = SmolVLM()
        loader = create_vlm_loader(arch, _transformers_config())
        assert isinstance(loader, SmallVLMLoader)
        assert loader.arch is arch


class TestUnknownArchitecture:
    """An architecture from a different family must fail loudly."""

    def test_llm_architecture_raises_unknown_architecture_error(self) -> None:
        # QwenLLM lives in the LLM family; the VLM registry has no entry for it
        # and must NOT silently fall through to a default loader.
        with pytest.raises(UnknownArchitectureError) as exc_info:
            create_vlm_loader(QwenLLM(), _transformers_config())  # type: ignore[arg-type]

        err = exc_info.value
        assert err.family == "vlm"
        assert err.architecture is QwenLLM
        # The error lists the registered VLM architectures so a misconfigured
        # YAML produces an actionable message.
        assert "Llama4Maverick" in err.registered
        assert "SmolVLM" in err.registered
