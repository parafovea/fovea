"""Contract test for :class:`ParakeetTDTLoader`."""

from __future__ import annotations

import pytest

pytest.importorskip("torch")  # requires the ML backend; skipped in the torch-free venv

import sys

import pytest

from src.domain.entities.architectures import NemoParakeet
from src.infrastructure.adapters.outbound.models.audio.loader import (
    AudioFramework,
    AudioTranscriptionLoader,
    TranscriptionConfig,
    audio_registry,
    create_audio_loader,
)
from src.infrastructure.adapters.outbound.models.audio.parakeet import ParakeetTDTLoader


def _arch() -> NemoParakeet:
    return NemoParakeet()


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
    loader = ParakeetTDTLoader(_arch(), _config())
    with pytest.raises(ImportError, match="NeMo"):
        loader.transcribe("audio.wav")


def test_parakeet_registered_in_factory() -> None:
    """The audio registry resolves :class:`NemoParakeet` to the Parakeet loader."""
    assert audio_registry.lookup(NemoParakeet) is ParakeetTDTLoader
    loader = create_audio_loader(_arch(), _config())
    assert isinstance(loader, ParakeetTDTLoader)
