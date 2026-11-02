"""Audio Model port definitions.

This module defines interfaces for audio transcription, speaker diarization,
and voice activity detection model adapters.
"""

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from src.domain.value_objects import TimeRange


class IAudioTranscriber(ABC):
    """Interface for audio transcription model adapters.

    Implementors must provide methods for transcribing audio and
    managing model lifecycle.
    """

    @abstractmethod
    def transcribe(
        self,
        audio_path: str,
        language: str | None = None,
    ) -> dict[str, Any]:
        """Transcribe audio to text.

        Parameters
        ----------
        audio_path : str
            Path to audio file.
        language : str | None, default=None
            Language code for transcription (auto-detect if None).

        Returns
        -------
        dict[str, Any]
            Transcription result with keys:
            - text: Full transcript text
            - segments: List of segment dicts with start, end, text
            - language: Detected or specified language
            - duration: Audio duration in seconds

        Raises
        ------
        AudioProcessingError
            If transcription fails.
        """
        pass

    @abstractmethod
    def transcribe_segment(
        self,
        audio_path: str,
        time_range: TimeRange,
        language: str | None = None,
    ) -> str:
        """Transcribe a specific segment of audio.

        Parameters
        ----------
        audio_path : str
            Path to audio file.
        time_range : TimeRange
            Time range to transcribe.
        language : str | None, default=None
            Language code for transcription.

        Returns
        -------
        str
            Transcribed text for the segment.

        Raises
        ------
        AudioProcessingError
            If transcription fails.
        """
        pass

    @abstractmethod
    def load(self) -> None:
        """Load the model into memory."""
        pass

    @abstractmethod
    def unload(self) -> None:
        """Unload the model from memory."""
        pass

    @property
    @abstractmethod
    def is_loaded(self) -> bool:
        """Check if model is currently loaded."""
        pass

    @property
    @abstractmethod
    def model_id(self) -> str:
        """Get the model identifier."""
        pass


class ISpeakerDiarizer(ABC):
    """Interface for speaker diarization model adapters.

    Implementors must provide methods for identifying speakers in audio.
    """

    @abstractmethod
    def diarize(
        self,
        audio_path: str,
        num_speakers: int | None = None,
        min_speakers: int | None = None,
        max_speakers: int | None = None,
    ) -> list[dict[str, Any]]:
        """Identify speakers in audio.

        Parameters
        ----------
        audio_path : str
            Path to audio file.
        num_speakers : int | None, default=None
            Exact number of speakers (if known).
        min_speakers : int | None, default=None
            Minimum expected speakers.
        max_speakers : int | None, default=None
            Maximum expected speakers.

        Returns
        -------
        list[dict[str, Any]]
            List of speaker segments with keys:
            - speaker: Speaker label
            - start: Start time in seconds
            - end: End time in seconds

        Raises
        ------
        AudioProcessingError
            If diarization fails.
        """
        pass

    @abstractmethod
    def load(self) -> None:
        """Load the model into memory."""
        pass

    @abstractmethod
    def unload(self) -> None:
        """Unload the model from memory."""
        pass

    @property
    @abstractmethod
    def is_loaded(self) -> bool:
        """Check if model is currently loaded."""
        pass

    @property
    @abstractmethod
    def model_id(self) -> str:
        """Get the model identifier."""
        pass


class IVoiceActivityDetector(ABC):
    """Interface for voice activity detection model adapters.

    Implementors must provide methods for detecting speech segments.
    """

    @abstractmethod
    def detect_speech(
        self,
        audio_path: str,
    ) -> list[tuple[float, float]]:
        """Detect speech segments in audio.

        Parameters
        ----------
        audio_path : str
            Path to audio file.

        Returns
        -------
        list[tuple[float, float]]
            List of (start, end) timestamps for speech segments.

        Raises
        ------
        AudioProcessingError
            If detection fails.
        """
        pass

    @abstractmethod
    def load(self) -> None:
        """Load the model into memory."""
        pass

    @abstractmethod
    def unload(self) -> None:
        """Unload the model from memory."""
        pass

    @property
    @abstractmethod
    def is_loaded(self) -> bool:
        """Check if model is currently loaded."""
        pass

    @property
    @abstractmethod
    def model_id(self) -> str:
        """Get the model identifier."""
        pass
