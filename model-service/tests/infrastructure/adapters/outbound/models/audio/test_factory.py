"""Tests for the Audio family loader factory.

These tests pin the architecture-keyed dispatch contract for
:func:`create_audio_loader`:

  * every in-process audio architecture (Whisper, FasterWhisper,
    WhisperX, NemoCanary, NemoParakeet) resolves to the loader class
    declared by ``@audio_registry.register(...)`` in its loader module
  * the dispatch is pure: there is no framework-level pre-branch, no
    substring matching on ``model_id``, no checkpoint-name heuristic
  * an architecture from a different family (VLM, Detection, etc.) and
    an external-API audio architecture (AssemblyAI, Deepgram, and the
    rest) both raise :class:`UnknownArchitectureError` with the audio
    family in the message; external-API entries deliberately stay
    unregistered because they are routed via the application-layer
    external API router upstream of any loader factory

No test in this module may inspect ``model_id`` substrings. The
architecture Pydantic class is the only legitimate dispatch key.
"""

from __future__ import annotations

import pytest

from src.domain.entities.architectures import (
    AssemblyAI,
    AWSTranscribe,
    AzureSpeech,
    Deepgram,
    FasterWhisper,
    Gladia,
    GoogleSpeech,
    NemoCanary,
    NemoParakeet,
    QwenLLM,
    RevAI,
    Whisper,
    WhisperX,
    YOLOWorld,
)
from src.infrastructure.adapters.outbound.models.audio.canary import CanaryQwenLoader
from src.infrastructure.adapters.outbound.models.audio.loader import (
    AudioFramework,
    AudioTranscriptionLoader,
    FasterWhisperLoader,
    TranscriptionConfig,
    WhisperLoader,
    audio_registry,
    create_audio_loader,
)
from src.infrastructure.adapters.outbound.models.audio.parakeet import ParakeetTDTLoader
from src.infrastructure.adapters.outbound.models.audio.whisperx import WhisperXLoader
from src.infrastructure.adapters.outbound.models.registry import UnknownArchitectureError


def _config(model_id: str = "fake-model") -> TranscriptionConfig:
    """Build a TranscriptionConfig suitable for dispatch-only tests.

    The factory never touches the network or filesystem at construction
    time, so a placeholder model id and CPU device are sufficient for
    pinning the architecture-to-loader mapping.
    """
    return TranscriptionConfig(
        model_id=model_id,
        framework=AudioFramework.WHISPER,
        device="cpu",
        compute_type="int8",
    )


class TestRegistryWiring:
    """``audio_registry`` exposes the five in-process audio architectures."""

    def test_registry_family_label_is_audio(self) -> None:
        """The registry's family label appears in error messages."""
        assert audio_registry.family == "audio"

    @pytest.mark.parametrize(
        "architecture_cls,loader_cls",
        [
            (Whisper, WhisperLoader),
            (FasterWhisper, FasterWhisperLoader),
            (WhisperX, WhisperXLoader),
            (NemoCanary, CanaryQwenLoader),
            (NemoParakeet, ParakeetTDTLoader),
        ],
    )
    def test_registry_lookup_returns_registered_loader(
        self,
        architecture_cls: type,
        loader_cls: type,
    ) -> None:
        """Each in-process architecture binds to its decorator-declared loader."""
        assert audio_registry.lookup(architecture_cls) is loader_cls

    def test_registry_contains_exactly_the_in_process_architectures(self) -> None:
        """No external-API arch sneaks into the loader registry.

        The registry must list the five in-process architectures and no
        more; AssemblyAI / Deepgram / RevAI / Gladia / AWSTranscribe /
        GoogleSpeech / AzureSpeech are dispatched upstream by the
        external API router and must NOT be loader-resolvable.
        """
        registered = set(audio_registry.registered_architectures)
        assert registered == {
            Whisper,
            FasterWhisper,
            WhisperX,
            NemoCanary,
            NemoParakeet,
        }


class TestCreateAudioLoaderDispatch:
    """``create_audio_loader`` instantiates the loader class registered for the arch."""

    @pytest.mark.parametrize(
        "architecture,loader_cls",
        [
            (Whisper(), WhisperLoader),
            (FasterWhisper(), FasterWhisperLoader),
            (WhisperX(), WhisperXLoader),
            (NemoCanary(), CanaryQwenLoader),
            (NemoParakeet(), ParakeetTDTLoader),
        ],
    )
    def test_factory_returns_correct_loader_for_each_architecture(
        self,
        architecture: object,
        loader_cls: type,
    ) -> None:
        """The factory routes by ``type(architecture)`` for every audio family."""
        loader = create_audio_loader(architecture, _config())  # type: ignore[arg-type]
        assert isinstance(loader, loader_cls)

    def test_factory_threads_architecture_to_loader_constructor(self) -> None:
        """The loader receives the same architecture instance the caller passed."""
        arch = Whisper()
        loader = create_audio_loader(arch, _config())
        assert isinstance(loader, AudioTranscriptionLoader)
        assert loader.arch is arch

    def test_factory_threads_config_to_loader_constructor(self) -> None:
        """The loader receives the same TranscriptionConfig the caller passed."""
        config = _config(model_id="vendor/checkpoint-x")
        loader = create_audio_loader(Whisper(), config)
        assert loader.config is config


class TestCreateAudioLoaderRejectsForeignArchitectures:
    """Architectures outside the registered set raise loud, typed errors."""

    @pytest.mark.parametrize(
        "external_architecture",
        [
            AssemblyAI(),
            Deepgram(),
            RevAI(),
            Gladia(),
            AWSTranscribe(),
            GoogleSpeech(),
            AzureSpeech(),
        ],
    )
    def test_external_api_architectures_are_not_resolvable_by_factory(
        self,
        external_architecture: object,
    ) -> None:
        """External-API audio archs deliberately raise; they go via the API router."""
        with pytest.raises(UnknownArchitectureError) as exc_info:
            create_audio_loader(external_architecture, _config())  # type: ignore[arg-type]
        assert exc_info.value.family == "audio"

    def test_vlm_architecture_raises_in_audio_family(self) -> None:
        """An architecture from another family raises with the audio family label."""
        with pytest.raises(UnknownArchitectureError) as exc_info:
            create_audio_loader(YOLOWorld(), _config())  # type: ignore[arg-type]
        assert exc_info.value.family == "audio"
        assert "YOLOWorld" in str(exc_info.value)

    def test_llm_architecture_raises_in_audio_family(self) -> None:
        """An LLM architecture also raises with the audio family label."""
        with pytest.raises(UnknownArchitectureError) as exc_info:
            create_audio_loader(QwenLLM(), _config())  # type: ignore[arg-type]
        assert exc_info.value.family == "audio"


class TestRegistryDoesNotMatchOnModelId:
    """The dispatch path must never read ``model_id`` to pick a loader.

    These tests pass plausibly-misleading model identifiers (a Whisper
    model-id with a NemoCanary architecture, etc.) and assert dispatch
    follows the architecture every time. A regression that re-introduced
    substring matching on ``model_id`` would route these by the string
    and fail this test loudly.
    """

    def test_whisper_model_id_with_canary_arch_returns_canary_loader(self) -> None:
        loader = create_audio_loader(
            NemoCanary(), _config(model_id="openai/whisper-large-v3")
        )
        assert isinstance(loader, CanaryQwenLoader)

    def test_canary_model_id_with_whisper_arch_returns_whisper_loader(self) -> None:
        loader = create_audio_loader(
            Whisper(), _config(model_id="nvidia/canary-qwen-2.5b")
        )
        assert isinstance(loader, WhisperLoader)

    def test_parakeet_model_id_with_faster_whisper_arch_returns_faster_whisper(
        self,
    ) -> None:
        loader = create_audio_loader(
            FasterWhisper(), _config(model_id="nvidia/parakeet-tdt-1.1b")
        )
        assert isinstance(loader, FasterWhisperLoader)
