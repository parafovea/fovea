"""Mappers between summarization schemas and summarization DTOs."""

from __future__ import annotations

from src.application.dto.summarization import (
    KeyFrameDTO,
    SummarizeRequestDTO,
    SummarizeResponseDTO,
)
from src.infrastructure.adapters.inbound.fastapi.mappers.reasoning import (
    thinking_trace_dto_to_schema,
)
from src.infrastructure.adapters.inbound.fastapi.schemas.summarization import (
    KeyFrame,
    SummarizeRequest,
    SummarizeResponse,
)


def summarize_request_schema_to_dto(schema: SummarizeRequest) -> SummarizeRequestDTO:
    """Convert a :class:`SummarizeRequest` schema into a DTO."""
    return SummarizeRequestDTO(
        video_id=schema.video_id,
        persona_id=schema.persona_id,
        video_path=schema.video_path,
        persona_role=schema.persona_role,
        information_need=schema.information_need,
        frame_sample_rate=schema.frame_sample_rate,
        max_frames=schema.max_frames,
        enable_audio=schema.enable_audio,
        audio_language=schema.audio_language,
        enable_speaker_diarization=schema.enable_speaker_diarization,
        fusion_strategy=schema.fusion_strategy,
    )


def key_frame_dto_to_schema(dto: KeyFrameDTO) -> KeyFrame:
    """Convert a :class:`KeyFrameDTO` into a :class:`KeyFrame` schema."""
    return KeyFrame(
        frame_number=dto.frame_number,
        timestamp=dto.timestamp,
        description=dto.description,
        confidence=dto.confidence,
    )


def summarize_response_dto_to_schema(dto: SummarizeResponseDTO) -> SummarizeResponse:
    """Convert a :class:`SummarizeResponseDTO` into a :class:`SummarizeResponse` schema."""
    return SummarizeResponse(
        id=dto.id,
        video_id=dto.video_id,
        persona_id=dto.persona_id,
        summary=dto.summary,
        visual_analysis=dto.visual_analysis,
        audio_transcript=dto.audio_transcript,
        key_frames=[key_frame_dto_to_schema(kf) for kf in dto.key_frames],
        confidence=dto.confidence,
        transcript_json=dto.transcript_json,
        audio_language=dto.audio_language,
        speaker_count=dto.speaker_count,
        audio_model_used=dto.audio_model_used,
        visual_model_used=dto.visual_model_used,
        fusion_strategy=dto.fusion_strategy,
        processing_time_audio=dto.processing_time_audio,
        processing_time_visual=dto.processing_time_visual,
        processing_time_fusion=dto.processing_time_fusion,
        thinking=(
            thinking_trace_dto_to_schema(dto.reasoning_trace)
            if dto.reasoning_trace is not None
            else None
        ),
    )
