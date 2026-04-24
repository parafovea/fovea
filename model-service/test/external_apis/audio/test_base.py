"""Tests for the base audio API client interface and result dataclasses."""

from __future__ import annotations

import inspect

import pytest

from src.infrastructure.adapters.outbound.external_apis.audio.base import (
    AudioAPIClient,
    TranscriptResult,
    TranscriptSegment,
)


class TestTranscriptSegment:
    def test_defaults_speaker_to_none(self) -> None:
        seg = TranscriptSegment(start=0.0, end=1.0, text="hi", confidence=0.9)
        assert seg.speaker is None

    def test_carries_all_fields(self) -> None:
        seg = TranscriptSegment(
            start=1.5, end=2.0, text="hello", confidence=0.8, speaker="SPEAKER_0"
        )
        assert (seg.start, seg.end, seg.text, seg.confidence, seg.speaker) == (
            1.5,
            2.0,
            "hello",
            0.8,
            "SPEAKER_0",
        )


class TestTranscriptResult:
    def test_defaults_words_to_none(self) -> None:
        res = TranscriptResult(
            text="hi", segments=[], language="en", duration=0.0, confidence=0.0
        )
        assert res.words is None

    def test_holds_segments_and_words(self) -> None:
        seg = TranscriptSegment(start=0, end=1, text="a", confidence=1.0)
        words: list[dict[str, float | str]] = [
            {"word": "a", "start": 0.0, "end": 1.0, "confidence": 1.0}
        ]
        res = TranscriptResult(
            text="a",
            segments=[seg],
            language="en",
            duration=1.0,
            confidence=1.0,
            words=words,
        )
        assert res.segments == [seg]
        assert res.words == words


class TestAudioAPIClient:
    def test_is_abstract(self) -> None:
        assert inspect.isabstract(AudioAPIClient)

    def test_cannot_instantiate_without_transcribe(self) -> None:
        with pytest.raises(TypeError):
            AudioAPIClient("key")  # type: ignore[abstract]

    def test_concrete_subclass_stores_api_key(self) -> None:
        class _Concrete(AudioAPIClient):
            async def transcribe(
                self,
                audio_path: str,
                language: str | None = None,
                enable_diarization: bool = False,
                enable_sentiment: bool = False,
            ) -> TranscriptResult:
                return TranscriptResult(
                    text="", segments=[], language="en", duration=0.0, confidence=0.0
                )

        client = _Concrete("my-key")
        assert client.api_key == "my-key"
