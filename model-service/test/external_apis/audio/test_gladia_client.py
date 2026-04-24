"""Tests for the Gladia audio transcription client.

Patches ``httpx.AsyncClient`` so no network I/O occurs. The fake client
returns queued responses for POST (job creation) and GET (polling/result)
so the test controls which branch of ``_poll_transcription`` fires.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.infrastructure.adapters.outbound.external_apis.audio.gladia_client import (
    GladiaClient,
)

if TYPE_CHECKING:
    from collections.abc import Iterator


def _make_response(payload: dict[str, Any], status: int = 200) -> MagicMock:
    resp = MagicMock()
    resp.json.return_value = payload
    resp.status_code = status
    resp.raise_for_status = MagicMock()
    return resp


class _FakeAsyncClient:
    """Minimal async context manager that returns queued HTTP responses."""

    def __init__(self, post_responses: list[MagicMock], get_responses: list[MagicMock]) -> None:
        self._post: Iterator[MagicMock] = iter(post_responses)
        self._get: Iterator[MagicMock] = iter(get_responses)
        self.post = AsyncMock(side_effect=lambda *_a, **_kw: next(self._post))
        self.get = AsyncMock(side_effect=lambda *_a, **_kw: next(self._get))

    async def __aenter__(self) -> _FakeAsyncClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        return None


@pytest.fixture
def tmp_audio(tmp_path: Any) -> str:
    p = tmp_path / "clip.wav"
    p.write_bytes(b"RIFF....WAVE")
    return str(p)


class TestGladiaTranscribe:
    @pytest.mark.asyncio
    async def test_happy_path_builds_transcript_result(self, tmp_audio: str) -> None:
        post = _make_response({"result": {"id": "job-1"}})
        poll_done = _make_response(
            {
                "status": "done",
                "result": {
                    "transcription": {
                        "language": "en",
                        "utterances": [
                            {
                                "speaker": 0,
                                "words": [
                                    {"start": 0.0, "end": 0.5, "word": "hi", "confidence": 0.9},
                                    {"start": 0.5, "end": 1.0, "word": "there", "confidence": 0.8},
                                ],
                            }
                        ],
                    }
                },
            }
        )
        fake = _FakeAsyncClient(post_responses=[post], get_responses=[poll_done])

        with patch(
            "src.infrastructure.adapters.outbound.external_apis.audio.gladia_client.httpx.AsyncClient",
            return_value=fake,
        ):
            client = GladiaClient("api-key")
            result = await client.transcribe(tmp_audio, language="en", enable_diarization=True)

        assert result.text == "hi there"
        assert len(result.segments) == 2
        assert result.segments[0].speaker == "SPEAKER_0"
        assert result.language == "en"
        assert result.duration == 1.0
        assert result.confidence == pytest.approx(0.85)

    @pytest.mark.asyncio
    async def test_no_utterances_yields_empty(self, tmp_audio: str) -> None:
        post = _make_response({"result": {"id": "job-1"}})
        poll_done = _make_response(
            {"status": "done", "result": {"transcription": {"utterances": []}}}
        )
        fake = _FakeAsyncClient(post_responses=[post], get_responses=[poll_done])

        with patch(
            "src.infrastructure.adapters.outbound.external_apis.audio.gladia_client.httpx.AsyncClient",
            return_value=fake,
        ):
            client = GladiaClient("key")
            result = await client.transcribe(tmp_audio)

        assert result.text == ""
        assert result.segments == []
        assert result.duration == 0.0
        assert result.confidence == 0.0

    @pytest.mark.asyncio
    async def test_poll_error_status_raises(self, tmp_audio: str) -> None:
        post = _make_response({"result": {"id": "job-1"}})
        poll_error = _make_response({"status": "error", "error": "bad audio"})
        fake = _FakeAsyncClient(post_responses=[post], get_responses=[poll_error])

        with patch(
            "src.infrastructure.adapters.outbound.external_apis.audio.gladia_client.httpx.AsyncClient",
            return_value=fake,
        ):
            client = GladiaClient("key")
            with pytest.raises(RuntimeError, match="Gladia API error"):
                await client.transcribe(tmp_audio)

    @pytest.mark.asyncio
    async def test_post_failure_wrapped_in_runtime_error(self, tmp_audio: str) -> None:
        fake = _FakeAsyncClient(post_responses=[], get_responses=[])
        fake.post = AsyncMock(side_effect=RuntimeError("connection refused"))

        with patch(
            "src.infrastructure.adapters.outbound.external_apis.audio.gladia_client.httpx.AsyncClient",
            return_value=fake,
        ):
            client = GladiaClient("key")
            with pytest.raises(RuntimeError, match="Gladia API error"):
                await client.transcribe(tmp_audio)

    @pytest.mark.asyncio
    async def test_poll_timeout_raises(self, tmp_audio: str) -> None:
        post = _make_response({"result": {"id": "job-1"}})
        pending = _make_response({"status": "pending"})
        fake = _FakeAsyncClient(post_responses=[post], get_responses=[pending])

        counter = [0.0]

        def _now() -> float:
            counter[0] += 500.0
            return counter[0]

        with (
            patch(
                "src.infrastructure.adapters.outbound.external_apis.audio.gladia_client.httpx.AsyncClient",
                return_value=fake,
            ),
            patch(
                "src.infrastructure.adapters.outbound.external_apis.audio.gladia_client.time.time",
                side_effect=_now,
            ),
            patch(
                "src.infrastructure.adapters.outbound.external_apis.audio.gladia_client.asyncio.sleep",
                new_callable=AsyncMock,
            ),
        ):
            client = GladiaClient("key")
            with pytest.raises(RuntimeError, match="Gladia API error"):
                await client.transcribe(tmp_audio)
