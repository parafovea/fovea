"""Contract test for :class:`CanaryQwenLoader`."""

from __future__ import annotations

import sys

import pytest

from src.infrastructure.adapters.outbound.models.audio.canary import CanaryQwenLoader
from src.infrastructure.adapters.outbound.models.audio.loader import (
    AudioFramework,
    AudioTranscriptionLoader,
    TranscriptionConfig,
)


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
    loader = CanaryQwenLoader(_config())
    with pytest.raises(ImportError, match="NeMo"):
        loader.transcribe("audio.wav")


def test_canary_loader_registered_in_factory() -> None:
    """``create_transcription_loader`` returns the Canary loader for NEMO_CANARY."""
    from src.infrastructure.adapters.outbound.models.audio.loader import (
        create_transcription_loader,
    )

    loader = create_transcription_loader("nvidia/canary-qwen", _config())
    assert isinstance(loader, CanaryQwenLoader)
