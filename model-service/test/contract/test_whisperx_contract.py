"""Contract test for :class:`WhisperXLoader` and its adapter."""

from __future__ import annotations

import pytest

pytest.importorskip("torch")  # requires the ML backend; skipped in the torch-free venv

import sys

import pytest

from src.application.ports.outbound.audio_model import (
    IAudioTranscriber,
    ISpeakerDiarizer,
)
from src.domain.entities.architectures import WhisperX
from src.infrastructure.adapters.outbound.models.audio.adapters import (
    WhisperXTranscriberAdapter,
)
from src.infrastructure.adapters.outbound.models.audio.loader import (
    AudioFramework,
    AudioTranscriptionLoader,
    TranscriptionConfig,
    audio_registry,
    create_audio_loader,
)
from src.infrastructure.adapters.outbound.models.audio.whisperx import WhisperXLoader


def _arch() -> WhisperX:
    return WhisperX()


def _config() -> TranscriptionConfig:
    return TranscriptionConfig(
        model_id="large-v3",
        framework=AudioFramework.WHISPERX,
        device="cpu",
        compute_type="int8",
    )


def test_whisperx_loader_is_subclass_of_base() -> None:
    """WhisperXLoader extends the shared transcription base."""
    assert issubclass(WhisperXLoader, AudioTranscriptionLoader)


def test_whisperx_adapter_is_both_transcriber_and_diarizer() -> None:
    """WhisperXTranscriberAdapter satisfies both audio ports."""
    assert issubclass(WhisperXTranscriberAdapter, IAudioTranscriber)
    assert issubclass(WhisperXTranscriberAdapter, ISpeakerDiarizer)


def test_whisperx_transcribe_without_package_raises_importerror(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Calling transcribe without whisperx installed raises a clear ImportError."""
    monkeypatch.setitem(sys.modules, "whisperx", None)
    loader = WhisperXLoader(_arch(), _config())
    with pytest.raises(ImportError, match="whisperx"):
        loader.transcribe("audio.wav")


def test_whisperx_registered_in_factory() -> None:
    """The audio registry resolves :class:`WhisperX` to the WhisperX loader."""
    assert audio_registry.lookup(WhisperX) is WhisperXLoader
    loader = create_audio_loader(_arch(), _config())
    assert isinstance(loader, WhisperXLoader)
