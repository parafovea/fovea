"""Base interface for external audio API clients.

This module defines the common interface and data structures for all external
audio transcription services.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class TranscriptSegment:
    """Single segment of transcribed text with timing.

    Parameters
    ----------
    start : float
        Start time in seconds.
    end : float
        End time in seconds.
    text : str
        Transcribed text for this segment.
    confidence : float
        Confidence score (0.0 to 1.0).
    speaker : str | None, default=None
        Speaker label if diarization is enabled.
    """

    start: float
    end: float
    text: str
    confidence: float
    speaker: str | None = None


@dataclass
class TranscriptResult:
    """Complete transcription result from an external API.

    Parameters
    ----------
    text : str
        Full transcription text.
    segments : list[TranscriptSegment]
        List of segments with timestamps and speaker labels.
    language : str
        Detected or specified language code.
    duration : float
        Audio duration in seconds.
    confidence : float
        Overall confidence score (0.0 to 1.0).
    words : list[dict[str, float | str]] | None, default=None
        Word-level timestamps if available.
    """

    text: str
    segments: list[TranscriptSegment]
    language: str
    duration: float
    confidence: float
    words: list[dict[str, float | str]] | None = None


class AudioAPIClient(ABC):
    """Abstract base class for external audio API clients.

    All audio API clients must implement the transcribe method and handle
    authentication, request formatting, and response parsing.
    """

    def __init__(self, api_key: str) -> None:
        """Initialize the audio API client with authentication.

        Parameters
        ----------
        api_key : str
            API key for authentication.
        """
        self.api_key = api_key

    @abstractmethod
    async def transcribe(
        self,
        audio_path: str,
        language: str | None = None,
        enable_diarization: bool = False,
        enable_sentiment: bool = False,
    ) -> TranscriptResult:
        """Transcribe audio file using the external API.

        Parameters
        ----------
        audio_path : str
            Path to audio file to transcribe.
        language : str | None, default=None
            Target language code. If None, auto-detects.
        enable_diarization : bool, default=False
            Enable speaker diarization.
        enable_sentiment : bool, default=False
            Enable sentiment analysis.

        Returns
        -------
        TranscriptResult
            Transcription result with segments and metadata.

        Raises
        ------
        RuntimeError
            If transcription fails or API returns an error.
        """
        pass
