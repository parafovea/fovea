"""Fake ITranscriber for use case testing."""

from __future__ import annotations

from src.application.ports.outbound.transcriber import (
    ITranscriber,
    TranscriptionResultDTO,
    TranscriptSegmentDTO,
)


class FakeTranscriber(ITranscriber):
    """In-memory transcriber returning canned results."""

    def __init__(
        self,
        *,
        result: TranscriptionResultDTO | None = None,
        raise_on_transcribe: Exception | None = None,
    ) -> None:
        self._result = result or TranscriptionResultDTO(
            text="hello world",
            segments=[
                TranscriptSegmentDTO(
                    start=0.0, end=1.0, text="hello world", confidence=0.95, speaker="S1"
                ),
            ],
            language="en",
            speaker_count=1,
            processing_time=0.1,
        )
        self._raise = raise_on_transcribe
        self.transcribe_calls: list[str] = []

    async def transcribe_video(
        self,
        video_path: str,
        *,
        language: str | None = None,
        enable_diarization: bool = False,
    ) -> TranscriptionResultDTO:
        if self._raise is not None:
            raise self._raise
        self.transcribe_calls.append(video_path)
        return self._result
