"""Tests for the LLM loader factory and registry dispatch.

The LLM family migrated from substring-matching dispatch to
architecture-keyed registry dispatch. These tests lock the contract
end-to-end:

  * every local LLM architecture (transformers / sglang frameworks)
    resolves through :data:`llm_registry` to :class:`LLMLoader`
  * ``framework == LLMFramework.LLAMA_CPP`` short-circuits the
    registry and returns :class:`LlamaCppLLMLoader` regardless of the
    architecture, because GGUF inference is a framework-level decision
    orthogonal to the model family
  * external-API architectures (``ClaudeAPI``, ``OpenAIChat``,
    ``GeminiAPI``, ``GrokAPI``) deliberately do NOT register against
    :data:`llm_registry`; routes branch to the external-API path
    before the factory runs, so reaching the factory with one of these
    architectures is a route bug and must raise
    :class:`UnknownArchitectureError`
  * an architecture from a different family (e.g. a VLM architecture)
    raises :class:`UnknownArchitectureError` as well, so misconfigured
    YAML fails loudly with an actionable error message
"""

from __future__ import annotations

import pytest

pytest.importorskip("torch")  # requires the ML backend; skipped in the torch-free venv

import pytest

from src.domain.entities.architectures import (
    GLM4,
    ClaudeAPI,
    DeepSeekR1Distill,
    DeepSeekV3LLM,
    GeminiAPI,
    Gemma3LLM,
    GrokAPI,
    KimiK2,
    Llama3LLM,
    Llama4LLM,
    LLMArchitecture,
    OpenAIChat,
    Phi,
    QwenLLM,
    SmolVLM,
)
from src.infrastructure.adapters.outbound.models.llama_cpp.base import LlamaCppConfig
from src.infrastructure.adapters.outbound.models.llama_cpp.llm import LlamaCppLLMLoader
from src.infrastructure.adapters.outbound.models.llm.base import (
    LLMConfig,
    LLMFramework,
)
from src.infrastructure.adapters.outbound.models.llm.loader import (
    LLMLoader,
    create_llm_loader,
    llm_registry,
)
from src.infrastructure.adapters.outbound.models.registry import (
    UnknownArchitectureError,
)

LOCAL_LLM_ARCHITECTURES: list[LLMArchitecture] = [
    QwenLLM(),
    Phi(),
    DeepSeekR1Distill(),
    DeepSeekV3LLM(),
    Llama3LLM(),
    Llama4LLM(),
    Gemma3LLM(),
    KimiK2(),
    GLM4(),
]

EXTERNAL_API_ARCHITECTURES: list[LLMArchitecture] = [
    ClaudeAPI(),
    OpenAIChat(),
    GeminiAPI(),
    GrokAPI(),
]


def _transformers_config(model_id: str = "test/model") -> LLMConfig:
    return LLMConfig(
        model_id=model_id,
        quantization="4bit",
        framework=LLMFramework.TRANSFORMERS,
    )


def _llama_cpp_config(model_id: str = "test/model-gguf") -> LLMConfig:
    return LLMConfig(
        model_id=model_id,
        quantization="gguf_q4_k_m",
        framework=LLMFramework.LLAMA_CPP,
    )


class TestLLMRegistry:
    def test_every_local_llm_architecture_registers_against_llmloader(self) -> None:
        registered = set(llm_registry.registered_architectures)
        for arch in LOCAL_LLM_ARCHITECTURES:
            assert type(arch) in registered, (
                f"{type(arch).__name__} must be registered with llm_registry"
            )
            assert llm_registry.lookup(type(arch)) is LLMLoader

    def test_external_api_architectures_are_not_registered(self) -> None:
        """External-API architectures route through ``is_external_api`` paths.

        Reaching ``create_llm_loader`` with one of them is a route bug
        and must fail loudly with ``UnknownArchitectureError`` rather
        than dispatching to ``LLMLoader`` (which would then try to
        ``AutoModelForCausalLM.from_pretrained`` an API alias).
        """
        registered = set(llm_registry.registered_architectures)
        for arch in EXTERNAL_API_ARCHITECTURES:
            assert type(arch) not in registered


class TestCreateLLMLoader:
    @pytest.mark.parametrize(
        "architecture",
        LOCAL_LLM_ARCHITECTURES,
        ids=lambda a: type(a).__name__,
    )
    def test_transformers_dispatch_returns_llmloader_for_every_local_arch(
        self, architecture: LLMArchitecture
    ) -> None:
        loader = create_llm_loader(architecture, _transformers_config())
        assert isinstance(loader, LLMLoader)
        assert loader.arch is architecture
        assert loader.config.framework == LLMFramework.TRANSFORMERS

    @pytest.mark.parametrize(
        "architecture",
        LOCAL_LLM_ARCHITECTURES,
        ids=lambda a: type(a).__name__,
    )
    def test_llama_cpp_dispatch_returns_llamacpploader_regardless_of_arch(
        self, architecture: LLMArchitecture
    ) -> None:
        loader = create_llm_loader(architecture, _llama_cpp_config())
        assert isinstance(loader, LlamaCppLLMLoader)
        # The architecture is threaded through the pre-dispatch so
        # downstream per-architecture prompt formatting can land on
        # the architecture subclass without churning this signature.
        assert loader.arch is architecture

    @pytest.mark.parametrize(
        "architecture",
        EXTERNAL_API_ARCHITECTURES,
        ids=lambda a: type(a).__name__,
    )
    def test_external_api_architecture_raises_unknown_architecture(
        self, architecture: LLMArchitecture
    ) -> None:
        with pytest.raises(UnknownArchitectureError) as exc_info:
            create_llm_loader(architecture, _transformers_config())
        err = exc_info.value
        assert err.family == "llm"
        assert err.architecture is type(architecture)

    def test_cross_family_architecture_raises_unknown_architecture(self) -> None:
        """A VLM architecture handed to the LLM factory must fail loudly.

        This is the safety net for a misconfigured YAML where a task
        section accidentally references a non-LLM kind discriminator.
        """
        with pytest.raises(UnknownArchitectureError) as exc_info:
            create_llm_loader(SmolVLM(), _transformers_config())  # type: ignore[arg-type]
        assert exc_info.value.family == "llm"
        assert exc_info.value.architecture is SmolVLM


class TestLLMLoaderConstructor:
    def test_llmloader_accepts_arch_as_first_positional_arg(self) -> None:
        arch = QwenLLM()
        config = _transformers_config()
        loader = LLMLoader(arch, config)
        assert loader.arch is arch
        assert loader.config is config
        assert loader.cache_dir is None

    def test_llamacpploader_accepts_arch_as_first_positional_arg(self) -> None:
        arch = QwenLLM()
        config = LlamaCppConfig(model_id="test/model-gguf", n_ctx=4096)
        loader = LlamaCppLLMLoader(arch, config)
        assert loader.arch is arch
        assert loader.config is config
