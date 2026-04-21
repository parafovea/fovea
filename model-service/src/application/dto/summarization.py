"""DTOs for video summarization use cases.

Framework-neutral data transfer objects used by application-layer
use cases. No dependencies on FastAPI, Pydantic schemas, or infrastructure.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class KeyFrameDTO:
    """Key frame produced by video analysis.

    Parameters
    ----------
    frame_number : int
        Frame number in the video.
    timestamp : float
        Time in seconds from video start.
    description : str
        Frame description.
    confidence : float
        Confidence score in [0.0, 1.0].
    """

    frame_number: int
    timestamp: float
    description: str
    confidence: float = 0.0


@dataclass
class SummarizeRequestDTO:
    """Request parameters for video summarization.

    Parameters
    ----------
    video_id : str
        Unique identifier for the video.
    persona_id : str
        Unique identifier for the persona.
    video_path : str | None
        Optional full path to video file.
    persona_role : str | None
        Optional persona role.
    information_need : str | None
        Optional persona information need.
    frame_sample_rate : int
        Frames to sample per second.
    max_frames : int
        Maximum frames to process.
    enable_audio : bool
        Whether to transcribe audio.
    audio_language : str | None
        Audio language code.
    enable_speaker_diarization : bool
        Whether to perform diarization.
    fusion_strategy : str | None
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
class SummarizeResponseDTO:
    """Video summarization result.

    Parameters
    ----------
    id : str
        Unique identifier for this summary.
    video_id : str
        Video identifier.
    persona_id : str
        Persona identifier.
    summary : str
        Text summary.
    visual_analysis : str | None
        Detailed visual analysis.
    audio_transcript : str | None
        Transcribed audio.
    key_frames : list[KeyFrameDTO]
        Key frames with descriptions.
    confidence : float
        Overall confidence.
    transcript_json : dict[str, Any] | None
        Structured transcript with segments.
    audio_language : str | None
        Detected audio language code.
    speaker_count : int | None
        Number of distinct speakers.
    audio_model_used : str | None
        Audio model name.
    visual_model_used : str | None
        Visual model name.
    fusion_strategy : str | None
        Fusion strategy used.
    processing_time_audio : float | None
        Audio processing time in seconds.
    processing_time_visual : float | None
        Visual processing time in seconds.
    processing_time_fusion : float | None
        Fusion processing time in seconds.
    """

    id: str
    video_id: str
    persona_id: str
    summary: str
    visual_analysis: str | None = None
    audio_transcript: str | None = None
    key_frames: list[KeyFrameDTO] = field(default_factory=list)
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
