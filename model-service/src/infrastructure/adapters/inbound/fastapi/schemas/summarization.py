"""Pydantic schemas for video summarization endpoints.

This module defines request and response schemas for the /api/summarize endpoint.
"""

from typing import Any, Literal

from pydantic import Field

from src.infrastructure.adapters.inbound.fastapi.schemas.common import (
    ConfidenceScore,
    NonEmptyStr,
    ProcessingTime,
    StrictBaseModel,
)


class KeyFrame(StrictBaseModel):
    """Key frame information from video analysis.

    Attributes
    ----------
    frame_number : int
        Frame number in the video.
    timestamp : float
        Time in seconds from video start.
    description : str
        Frame description.
    confidence : float
        Model confidence score (0-1).
    """

    frame_number: int = Field(..., description="Frame number in the video")
    timestamp: float = Field(..., ge=0.0, description="Time in seconds from video start")
    description: str = Field(..., description="Frame description")
    confidence: ConfidenceScore = Field(default=0.0, description="Model confidence score")


class SummarizeRequest(StrictBaseModel):
    """Request model for video summarization endpoint.

    Attributes
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
        Frames to sample per second (1-10).
    max_frames : int
        Maximum frames to process (1-100).
    enable_audio : bool
        Enable audio transcription.
    audio_language : str | None
        Audio language code (e.g., 'en').
    enable_speaker_diarization : bool
        Enable speaker identification.
    fusion_strategy : str | None
        Audio-visual fusion strategy.
    """

    video_id: NonEmptyStr = Field(..., description="Unique identifier for the video")
    persona_id: NonEmptyStr = Field(..., description="Unique identifier for the persona")
    video_path: str | None = Field(default=None, description="Optional full path to video file")
    persona_role: str | None = Field(default=None, description="Optional persona role for context")
    information_need: str | None = Field(
        default=None, description="Optional information need for context"
    )
    frame_sample_rate: int = Field(
        default=1, ge=1, le=10, description="Frames to sample per second"
    )
    max_frames: int = Field(default=30, ge=1, le=100, description="Maximum frames to process")

    # Audio configuration
    enable_audio: bool = Field(default=False, description="Enable audio transcription")
    audio_language: str | None = Field(default=None, description="Audio language code (e.g., 'en')")
    enable_speaker_diarization: bool = Field(
        default=False, description="Enable speaker identification"
    )
    fusion_strategy: (
        Literal["sequential", "timestamp_aligned", "native_multimodal", "hybrid"] | None
    ) = Field(default="sequential", description="Audio-visual fusion strategy")


class SummarizeResponse(StrictBaseModel):
    """Response model for video summarization endpoint.

    Attributes
    ----------
    id : str
        Unique identifier for this summary.
    video_id : str
        Video identifier.
    persona_id : str
        Persona identifier.
    summary : str
        Text summary of video content.
    visual_analysis : str | None
        Detailed visual content analysis.
    audio_transcript : str | None
        Transcribed audio content.
    key_frames : list[KeyFrame]
        Key frames with descriptions.
    confidence : float
        Overall confidence score.
    """

    id: NonEmptyStr = Field(..., description="Unique identifier for this summary")
    video_id: NonEmptyStr = Field(..., description="Video identifier")
    persona_id: NonEmptyStr = Field(..., description="Persona identifier")
    summary: str = Field(..., description="Text summary of video content")
    visual_analysis: str | None = Field(
        default=None, description="Detailed visual content analysis"
    )
    audio_transcript: str | None = Field(default=None, description="Transcribed audio content")
    key_frames: list[KeyFrame] = Field(
        default_factory=list, description="Key frames with descriptions"
    )
    confidence: ConfidenceScore = Field(default=0.0, description="Overall confidence score")

    # Audio metadata fields
    transcript_json: dict[str, Any] | None = Field(
        default=None, description="Structured transcript with segments"
    )
    audio_language: str | None = Field(default=None, description="Detected audio language code")
    speaker_count: int | None = Field(default=None, ge=0, description="Number of distinct speakers")
    audio_model_used: str | None = Field(default=None, description="Audio transcription model name")
    visual_model_used: str | None = Field(default=None, description="Visual analysis model name")
    fusion_strategy: str | None = Field(default=None, description="Fusion strategy used")
    processing_time_audio: ProcessingTime | None = Field(
        default=None, description="Audio processing time in seconds"
    )
    processing_time_visual: ProcessingTime | None = Field(
        default=None, description="Visual processing time in seconds"
    )
    processing_time_fusion: ProcessingTime | None = Field(
        default=None, description="Fusion processing time in seconds"
    )
