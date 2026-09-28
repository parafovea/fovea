"""Translate application DTOs into didactic wire response models.

The routes call use cases that return framework-neutral DTOs (plain
dataclasses shared with the codec lenses). This module builds the
:mod:`models` wire :class:`didactic.api.Model` instances the routes return.
It is the single seam between the application DTO layer and the HTTP wire
layer; the response-serialization direction lives here so the routes stay
thin and the DTOs stay free of any web-framework concern.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from src.infrastructure.adapters.inbound.fastapi import models

if TYPE_CHECKING:
    from src.application.dto.claims import ExtractedClaimDTO
    from src.application.dto.detection import DetectObjectsResponseDTO
    from src.application.dto.ontology import OntologyTypeDTO
    from src.application.dto.reasoning import ThinkingTrace
    from src.application.dto.summarization import SummarizeResponseDTO
    from src.application.dto.tracking import TrackObjectsResponseDTO


def thinking_trace(dto: ThinkingTrace | None) -> models.ThinkingTrace | None:
    """Build a wire :class:`~models.ThinkingTrace` from its DTO, or ``None``."""
    if dto is None:
        return None
    return models.ThinkingTrace(
        steps=tuple(
            models.ThinkingStep(content=step.content, tokens_used=step.tokens_used)
            for step in dto.steps
        ),
        model_id=dto.model_id,
        total_tokens=dto.total_tokens,
    )


def detection_response(dto: DetectObjectsResponseDTO) -> models.DetectionResponse:
    """Build a wire :class:`~models.DetectionResponse` from its DTO."""
    frames = tuple(
        models.FrameDetections(
            frame_number=frame.frame_number,
            timestamp=frame.timestamp,
            detections=tuple(
                models.Detection(
                    label=det.label,
                    bounding_box=models.BoundingBox(
                        x=det.bounding_box.x,
                        y=det.bounding_box.y,
                        width=det.bounding_box.width,
                        height=det.bounding_box.height,
                    ),
                    confidence=det.confidence,
                    track_id=det.track_id,
                )
                for det in frame.detections
            ),
        )
        for frame in dto.frames
    )
    return models.DetectionResponse(
        id=dto.id,
        video_id=dto.video_id,
        query=dto.query,
        frames=frames,
        total_detections=dto.total_detections,
        processing_time=dto.processing_time,
    )


def tracking_response(dto: TrackObjectsResponseDTO) -> models.TrackingResponse:
    """Build a wire :class:`~models.TrackingResponse` from its DTO."""
    frames = tuple(
        models.TrackingFrameResult(
            frame_number=frame.frame_number,
            timestamp=frame.timestamp,
            masks=tuple(
                models.TrackingMaskData(
                    object_id=mask.object_id,
                    mask_rle=mask.mask_rle,
                    confidence=mask.confidence,
                    is_occluded=mask.is_occluded,
                )
                for mask in frame.masks
            ),
            processing_time=frame.processing_time,
        )
        for frame in dto.frames
    )
    return models.TrackingResponse(
        id=dto.id,
        video_id=dto.video_id,
        frames=frames,
        video_width=dto.video_width,
        video_height=dto.video_height,
        total_frames=dto.total_frames,
        processing_time=dto.processing_time,
        fps=dto.fps,
    )


def ontology_type(dto: OntologyTypeDTO) -> models.OntologyType:
    """Build a wire :class:`~models.OntologyType` from its DTO."""
    return models.OntologyType(
        name=dto.name,
        description=dto.description,
        parent=dto.parent,
        confidence=dto.confidence,
        examples=tuple(dto.examples),
        thinking=thinking_trace(dto.reasoning_trace),
    )


def summarize_response(dto: SummarizeResponseDTO) -> models.SummarizeResponse:
    """Build a wire :class:`~models.SummarizeResponse` from its DTO."""
    return models.SummarizeResponse(
        id=dto.id,
        video_id=dto.video_id,
        persona_id=dto.persona_id,
        summary=dto.summary,
        visual_analysis=dto.visual_analysis,
        audio_transcript=dto.audio_transcript,
        key_frames=tuple(
            models.KeyFrame(
                frame_number=kf.frame_number,
                timestamp=kf.timestamp,
                description=kf.description,
                confidence=kf.confidence,
            )
            for kf in dto.key_frames
        ),
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
        thinking=thinking_trace(dto.reasoning_trace),
    )


def extracted_claim(dto: ExtractedClaimDTO) -> models.ExtractedClaim:
    """Build a wire :class:`~models.ExtractedClaim` (recursing subclaims)."""
    return models.ExtractedClaim(
        text=dto.text,
        sentence_index=dto.sentence_index,
        char_start=dto.char_start,
        char_end=dto.char_end,
        subclaims=tuple(extracted_claim(sub) for sub in dto.subclaims),
        confidence=dto.confidence,
        claim_type=dto.claim_type,
        thinking=thinking_trace(dto.reasoning_trace),
    )
