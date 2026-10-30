"""Reject videos without audio before invoking the ASR model."""

import sys
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from src.domain.entities.architectures import FasterWhisper
from src.domain.exceptions import AudioProcessingError
from src.infrastructure.adapters.outbound.models.audio.loader import (
    FasterWhisperLoader,
    TranscriptionConfig,
)


@pytest.mark.parametrize("has_audio", [False, True])
def test_faster_whisper_requires_an_audio_stream(
    monkeypatch: pytest.MonkeyPatch, has_audio: bool
) -> None:
    """A silent container fails before inference; an audio container proceeds."""
    av_module = MagicMock()
    av_module.open.return_value.__enter__.return_value.streams.audio = (
        [object()] if has_audio else []
    )
    monkeypatch.setitem(sys.modules, "av", av_module)
    loader = FasterWhisperLoader(
        FasterWhisper(), TranscriptionConfig(model_id="tiny", device="cpu")
    )
    model = MagicMock()
    model.transcribe.return_value = (iter([]), SimpleNamespace(language="en", duration=1.0))
    loader.model = model

    if has_audio:
        assert loader.transcribe("clip.webm").duration == 1.0
        model.transcribe.assert_called_once()
    else:
        with pytest.raises(AudioProcessingError, match="no audio stream"):
            loader.transcribe("clip.webm")
        model.transcribe.assert_not_called()
