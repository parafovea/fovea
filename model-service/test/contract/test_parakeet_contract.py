"""Contract test for :class:`ParakeetTDTLoader`."""

from __future__ import annotations

import sys

import pytest

from src.infrastructure.adapters.outbound.models.audio.loader import (
    AudioFramework,
    AudioTranscriptionLoader,
    TranscriptionConfig,
)
from src.infrastructure.adapters.outbound.models.audio.parakeet import ParakeetTDTLoader


def _config() -> TranscriptionConfig:
    return TranscriptionConfig(
        model_id="nvidia/parakeet-tdt-1.1b",
        framework=AudioFramework.NEMO_PARAKEET,
        device="cpu",
    )


def test_parakeet_loader_is_subclass_of_base() -> None:
    """ParakeetTDTLoader extends the shared transcription base."""
    assert issubclass(ParakeetTDTLoader, AudioTranscriptionLoader)


def test_parakeet_loader_exposes_streaming() -> None:
    """ParakeetTDTLoader must expose a ``transcribe_streaming`` coroutine."""
    assert hasattr(ParakeetTDTLoader, "transcribe_streaming")


def test_parakeet_transcribe_without_nemo_raises_importerror(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Calling transcribe without NeMo installed raises a clear ImportError."""
    monkeypatch.setitem(sys.modules, "nemo", None)
    monkeypatch.setitem(sys.modules, "nemo.collections", None)
    monkeypatch.setitem(sys.modules, "nemo.collections.asr", None)
    monkeypatch.setitem(sys.modules, "nemo.collections.asr.models", None)
    loader = ParakeetTDTLoader(_config())
    with pytest.raises(ImportError, match="NeMo"):
        loader.transcribe("audio.wav")


def test_parakeet_registered_in_factory() -> None:
    """Factory resolves ``nemo_parakeet`` framework to the Parakeet loader."""
    from src.infrastructure.adapters.outbound.models.audio.loader import (
        create_transcription_loader,
    )

    loader = create_transcription_loader("nvidia/parakeet-tdt", _config())
    assert isinstance(loader, ParakeetTDTLoader)
