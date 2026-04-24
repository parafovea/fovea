"""Tests for the Rev AI audio transcription client.

Patches ``httpx.AsyncClient`` so the POST (job submission), GET (job
status), and transcript-fetch flow can be exercised without network I/O.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.infrastructure.adapters.outbound.external_apis.audio.revai_client import (
    RevAIClient,
)

if TYPE_CHECKING:
    from collections.abc import Iterator


def _resp(payload: dict[str, Any]) -> MagicMock:
    r = MagicMock()
    r.json.return_value = payload
    r.raise_for_status = MagicMock()
    return r


class _FakeAsyncClient:
    def __init__(self, post: list[MagicMock], get: list[MagicMock]) -> None:
        self._post: Iterator[MagicMock] = iter(post)
        self._get: Iterator[MagicMock] = iter(get)
        self.post = AsyncMock(side_effect=lambda *_a, **_kw: next(self._post))
        self.get = AsyncMock(side_effect=lambda *_a, **_kw: next(self._get))

    async def __aenter__(self) -> _FakeAsyncClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        return None


@pytest.fixture
def tmp_audio(tmp_path: Any) -> str:
    p = tmp_path / "clip.wav"
    p.write_bytes(b"RIFF")
    return str(p)


class TestRevAITranscribe:
    @pytest.mark.asyncio
    async def test_happy_path_with_diarization(self, tmp_audio: str) -> None:
        post = _resp({"id": "job-1"})
        status_done = _resp({"id": "job-1", "status": "transcribed"})
        transcript = _resp(
            {
                "monologues": [
                    {
                        "speaker": 0,
                        "elements": [
                            {"type": "text", "ts": 0.0, "end_ts": 0.5, "value": "hello", "confidence": 0.9},
                            {"type": "punct", "value": ","},
                            {"type": "text", "ts": 0.5, "end_ts": 1.0, "value": "world", "confidence": 0.8},
                        ],
                    }
                ]
            }
        )
        fake = _FakeAsyncClient(post=[post], get=[status_done, transcript])

        with patch(
            "src.infrastructure.adapters.outbound.external_apis.audio.revai_client.httpx.AsyncClient",
            return_value=fake,
        ):
            client = RevAIClient("key")
            result = await client.transcribe(tmp_audio, enable_diarization=True)

        assert result.text == "hello world"
        assert [s.text for s in result.segments] == ["hello", "world"]
        assert result.segments[0].speaker == "SPEAKER_0"
        assert result.duration == 1.0

    @pytest.mark.asyncio
    async def test_without_diarization_omits_speaker(self, tmp_audio: str) -> None:
        fake = _FakeAsyncClient(
            post=[_resp({"id": "j"})],
            get=[
                _resp({"status": "transcribed"}),
                _resp(
                    {
                        "monologues": [
                            {
                                "speaker": 0,
                                "elements": [
                                    {"type": "text", "ts": 0, "end_ts": 1, "value": "hi", "confidence": 1.0}
                                ],
                            }
                        ]
                    }
                ),
            ],
        )
        with patch(
            "src.infrastructure.adapters.outbound.external_apis.audio.revai_client.httpx.AsyncClient",
            return_value=fake,
        ):
            client = RevAIClient("key")
            result = await client.transcribe(tmp_audio)

        assert result.segments[0].speaker is None

    @pytest.mark.asyncio
    async def test_failed_job_raises(self, tmp_audio: str) -> None:
        fake = _FakeAsyncClient(
            post=[_resp({"id": "j"})],
            get=[_resp({"status": "failed", "failure_detail": "bad media"})],
        )
        with patch(
            "src.infrastructure.adapters.outbound.external_apis.audio.revai_client.httpx.AsyncClient",
            return_value=fake,
        ):
            client = RevAIClient("key")
            with pytest.raises(RuntimeError, match="Rev AI API error"):
                await client.transcribe(tmp_audio)

    @pytest.mark.asyncio
    async def test_empty_monologues_yields_empty(self, tmp_audio: str) -> None:
        fake = _FakeAsyncClient(
            post=[_resp({"id": "j"})],
            get=[_resp({"status": "transcribed"}), _resp({"monologues": []})],
        )
        with patch(
            "src.infrastructure.adapters.outbound.external_apis.audio.revai_client.httpx.AsyncClient",
            return_value=fake,
        ):
            client = RevAIClient("key")
            result = await client.transcribe(tmp_audio)

        assert result.text == ""
        assert result.segments == []
        assert result.duration == 0.0

    @pytest.mark.asyncio
    async def test_poll_timeout_raises(self, tmp_audio: str) -> None:
        fake = _FakeAsyncClient(
            post=[_resp({"id": "j"})],
            get=[_resp({"status": "in_progress"})],
        )

        counter = [0.0]

        def _now() -> float:
            counter[0] += 500.0
            return counter[0]

        with (
            patch(
                "src.infrastructure.adapters.outbound.external_apis.audio.revai_client.httpx.AsyncClient",
                return_value=fake,
            ),
            patch(
                "src.infrastructure.adapters.outbound.external_apis.audio.revai_client.time.time",
                side_effect=_now,
            ),
            patch(
                "src.infrastructure.adapters.outbound.external_apis.audio.revai_client.asyncio.sleep",
                new_callable=AsyncMock,
            ),
        ):
            client = RevAIClient("key")
            with pytest.raises(RuntimeError, match="Rev AI API error"):
                await client.transcribe(tmp_audio)
