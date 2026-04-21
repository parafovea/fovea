"""Audio transcription port definition.

Narrow application-facing interface for audio transcription and optional
speaker diarization. Implementations live in the infrastructure layer.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class TranscriptSegmentDTO:
    """Segment of transcribed audio.

    Parameters
    ----------
    start : float
        Segment start in seconds.
    end : float
        Segment end in seconds.
    text : str
        Transcribed text.
    confidence : float
        Model confidence in [0.0, 1.0].
    speaker : str | None
        Speaker label if diarized.
    """

    start: float
    end: float
    text: str
    confidence: float = 0.0
    speaker: str | None = None


@dataclass
class TranscriptionResultDTO:
    """Result of a transcription request.

    Parameters
    ----------
    text : str
        Full transcript.
    segments : list[TranscriptSegmentDTO]
        Segment-level transcripts.
    language : str | None
        Detected language code.
    speaker_count : int | None
        Number of distinct speakers (if diarized).
    processing_time : float
        Wall-clock seconds spent.
    """

    text: str
    segments: list[TranscriptSegmentDTO] = field(default_factory=list)
    language: str | None = None
    speaker_count: int | None = None
    processing_time: float = 0.0


class ITranscriber(ABC):
    """Port for video/audio transcription providers."""

    @abstractmethod
    async def transcribe_video(
        self,
        video_path: str,
        *,
        language: str | None = None,
        enable_diarization: bool = False,
    ) -> TranscriptionResultDTO:
        """Transcribe audio from a video file.

        Parameters
        ----------
        video_path : str
            Path to the video file.
        language : str | None
            Optional target language code.
        enable_diarization : bool
            Whether to run speaker diarization.

        Returns
        -------
        TranscriptionResultDTO
            Transcription result. ``text`` is empty if no audio present.
        """
        ...
