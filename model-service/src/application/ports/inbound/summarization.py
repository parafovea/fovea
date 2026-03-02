"""Summarization Service port definition.

This module defines the interface for video summarization services.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from src.domain.types import FusionStrategy


@dataclass
class SummarizeInput:
    """Input for video summarization.

    Parameters
    ----------
    video_id : str
        Unique identifier for the video.
    persona_id : str
        Unique identifier for the persona.
    video_path : str | None
        Optional full path to video file.
    persona_role : str | None
        Optional persona role for context.
    information_need : str | None
        Optional information need for context.
    frame_sample_rate : int
        Frames to sample per second.
    max_frames : int
        Maximum frames to process.
    enable_audio : bool
        Enable audio transcription.
    audio_language : str | None
        Audio language code.
    enable_speaker_diarization : bool
        Enable speaker identification.
    fusion_strategy : FusionStrategy | None
        Audio-visual fusion strategy.
    """

    video_id: str
    persona_id: str
    video_path: str | None = None
    persona_role: str | None = None
    information_need: str | None = None
    frame_sample_rate: int = 1
    max_frames: int = 30
    enable_audio: bool = False
    audio_language: str | None = None
    enable_speaker_diarization: bool = False
    fusion_strategy: str | None = "sequential"


@dataclass
class KeyFrameOutput:
    """Key frame in summarization output."""

    frame_number: int
    timestamp: float
    description: str
    confidence: float


@dataclass
class SummarizeOutput:
    """Output from video summarization.

    Parameters
    ----------
    summary_id : str
        Unique identifier for the summary.
    video_id : str
        Video identifier.
    persona_id : str
        Persona identifier.
    summary : str
        Generated summary text.
    visual_analysis : str | None
        Detailed visual analysis.
    audio_transcript : str | None
        Transcribed audio.
    key_frames : list[KeyFrameOutput]
        Key frames with descriptions.
    confidence : float
        Overall confidence score.
    transcript_json : dict | None
        Structured transcript.
    audio_language : str | None
        Detected audio language.
    speaker_count : int | None
        Number of speakers.
    audio_model_used : str | None
        Audio model name.
    visual_model_used : str | None
        Visual model name.
    fusion_strategy : str | None
        Fusion strategy used.
    processing_time_audio : float | None
        Audio processing time.
    processing_time_visual : float | None
        Visual processing time.
    processing_time_fusion : float | None
        Fusion processing time.
    """

    summary_id: str
    video_id: str
    persona_id: str
    summary: str
    visual_analysis: str | None = None
    audio_transcript: str | None = None
    key_frames: list[KeyFrameOutput] = field(default_factory=list)
    confidence: float = 0.0
    transcript_json: dict[str, Any] | None = None
    audio_language: str | None = None
    speaker_count: int | None = None
    audio_model_used: str | None = None
    visual_model_used: str | None = None
    fusion_strategy: str | None = None
    processing_time_audio: float | None = None
    processing_time_visual: float | None = None
    processing_time_fusion: float | None = None


class ISummarizationService(ABC):
    """Interface for video summarization services.

    Implementors provide video summarization with optional audio processing.
    """

    @abstractmethod
    async def summarize(self, input: SummarizeInput) -> SummarizeOutput:
        """Summarize a video.

        Parameters
        ----------
        input : SummarizeInput
            Summarization parameters.

        Returns
        -------
        SummarizeOutput
            Generated summary with metadata.

        Raises
        ------
        VideoNotFoundError
            If video cannot be found.
        InferenceError
            If summarization fails.
        """
        ...
