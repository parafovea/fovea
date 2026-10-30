"""Transcription input errors retain a client-error status."""

from __future__ import annotations

import os
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException

from src.domain.exceptions import AudioProcessingError
from src.infrastructure.adapters.inbound.fastapi.routes import transcribe as route

if TYPE_CHECKING:
    from pathlib import Path


@pytest.mark.asyncio
async def test_missing_audio_stream_returns_400(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A stored video without audio is invalid input rather than a server failure."""
    video = tmp_path / "silent.webm"
    video.touch()
    monkeypatch.setattr(route, "_AUDIO_PATH_ROOTS", (str(tmp_path) + os.sep,))
    model = Mock()
    model.transcribe.side_effect = AudioProcessingError(
        str(video), "The file contains no audio stream"
    )
    manager = Mock(tasks={"audio_transcription": Mock()})
    manager.load_model = AsyncMock(return_value=model)

    with pytest.raises(HTTPException) as exc:
        await route.transcribe(route.TranscribeRequest(audio_path=str(video)), manager)
    assert exc.value.status_code == 400
    assert "no audio stream" in exc.value.detail
