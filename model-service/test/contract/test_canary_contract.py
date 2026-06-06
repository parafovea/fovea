"""Contract test for :class:`CanaryQwenLoader`."""

from __future__ import annotations

import sys

import pytest

from src.domain.entities.architectures import NemoCanary
from src.infrastructure.adapters.outbound.models.audio.canary import CanaryQwenLoader
from src.infrastructure.adapters.outbound.models.audio.loader import (
    AudioFramework,
    AudioTranscriptionLoader,
    TranscriptionConfig,
    audio_registry,
    create_audio_loader,
)


def _arch() -> NemoCanary:
    return NemoCanary()


def _config() -> TranscriptionConfig:
    return TranscriptionConfig(
        model_id="nvidia/canary-qwen-2.5b",
        framework=AudioFramework.NEMO_CANARY,
        device="cpu",
    )


def test_canary_loader_is_subclass_of_base() -> None:
    """CanaryQwenLoader extends the shared transcription base."""
    assert issubclass(CanaryQwenLoader, AudioTranscriptionLoader)


def test_canary_transcribe_without_nemo_raises_importerror(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Calling transcribe without NeMo installed raises a clear ImportError."""
    monkeypatch.setitem(sys.modules, "nemo", None)
    monkeypatch.setitem(sys.modules, "nemo.collections", None)
    monkeypatch.setitem(sys.modules, "nemo.collections.asr", None)
    monkeypatch.setitem(sys.modules, "nemo.collections.asr.models", None)
    loader = CanaryQwenLoader(_arch(), _config())
    with pytest.raises(ImportError, match="NeMo"):
        loader.transcribe("audio.wav")


def test_canary_loader_registered_in_factory() -> None:
    """The audio registry resolves :class:`NemoCanary` to the Canary loader."""
    assert audio_registry.lookup(NemoCanary) is CanaryQwenLoader
    loader = create_audio_loader(_arch(), _config())
    assert isinstance(loader, CanaryQwenLoader)
