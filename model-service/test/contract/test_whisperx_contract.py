"""Contract test for :class:`WhisperXLoader` and its adapter."""

from __future__ import annotations

import sys

import pytest

from src.application.ports.outbound.audio_model import (
    IAudioTranscriber,
    ISpeakerDiarizer,
)
from src.infrastructure.adapters.outbound.models.audio.adapters import (
    WhisperXTranscriberAdapter,
)
from src.infrastructure.adapters.outbound.models.audio.loader import (
    AudioFramework,
    AudioTranscriptionLoader,
    TranscriptionConfig,
)
from src.infrastructure.adapters.outbound.models.audio.whisperx import WhisperXLoader


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
    loader = WhisperXLoader(_config())
    with pytest.raises(ImportError, match="whisperx"):
        loader.transcribe("audio.wav")


def test_whisperx_registered_in_factory() -> None:
    """Factory resolves ``whisperx`` framework to the WhisperX loader."""
    from src.infrastructure.adapters.outbound.models.audio.loader import (
        create_transcription_loader,
    )

    loader = create_transcription_loader("whisperx-large", _config())
    assert isinstance(loader, WhisperXLoader)
