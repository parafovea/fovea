"""Audio transcription route.

Exposes the audio_transcription task as a standalone endpoint so the
demo's TranscriptViewer can call faster-whisper (or any other
transcription loader the operator configures in models-cpu.yaml /
models.yaml) without going through the summarize-video pipeline.

The summarize use case already drives transcription internally via
`_maybe_transcribe`; this route is the direct surface a user clicks
"Transcribe" against from the workspace.
"""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import cast

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.infrastructure.adapters.inbound.fastapi.dependencies import ModelManagerDep  # noqa: TC001
from src.infrastructure.adapters.outbound.models.audio.base import (
    AudioTranscriptionLoader,
    TranscriptionResult,
)

router = APIRouter()
logger = logging.getLogger(__name__)

# CodeQL path-traversal sanitizer roots. Audio inputs to the
# transcribe / diarize routes are either video files under
# `VIDEO_DATA_ROOT` (when the backend forwards a stored video) or
# extracted audio under `AUDIO_OUTPUT_ROOT` (when the backend
# forwards a pre-extracted wav). Both prefixes are realpath-
# normalised with a trailing separator so the StartswithCall guard
# below cannot match a sibling directory whose name starts with
# the root name.
_VIDEO_DATA_PREFIX: str = os.path.realpath(os.environ.get("VIDEO_DATA_ROOT", "/videos")) + os.sep
_AUDIO_OUTPUT_PREFIX: str = os.path.realpath(os.environ.get("AUDIO_OUTPUT_ROOT", "/audio")) + os.sep
_AUDIO_PATH_ROOTS: tuple[str, str] = (_VIDEO_DATA_PREFIX, _AUDIO_OUTPUT_PREFIX)


class TranscribeRequest(BaseModel):
    """Request schema for the transcription endpoint."""

    audio_path: str = Field(..., description="Filesystem path to an audio or video file.")
    language: str | None = Field(
        default=None,
        description=(
            "Optional ISO-639-1 language code (e.g. 'en', 'es'). When omitted the loader "
            "auto-detects."
        ),
    )


class TranscriptionSegmentResponse(BaseModel):
    """One timed segment from the transcript."""

    start: float
    end: float
    text: str
    confidence: float


class TranscribeResponse(BaseModel):
    """Response schema for the transcription endpoint."""

    text: str
    segments: list[TranscriptionSegmentResponse]
    language: str
    duration: float
    processing_time: float
    model_used: str


@router.post(
    "/transcribe",
    response_model=TranscribeResponse,
    summary="Transcribe an audio (or audio track of a video) file.",
)
async def transcribe(
    request: TranscribeRequest,
    manager: ModelManagerDep,
) -> TranscribeResponse:
    """Transcribe an audio or video file using the configured ASR model."""
    # CodeQL sanitizer chain (inlined per StartswithCall recognition):
    #   1. os.path.realpath -> PathNormalization
    #   2. single startswith(const_prefix_tuple) + raise -> barrier guard.
    #      str.startswith accepts a tuple of prefixes natively; using the
    #      tuple form keeps this as one StartswithCall (CodeQL recognises
    #      it as the barrier guard) rather than an or-chain of two calls
    #      (which the taint engine does not collapse into a barrier).
    audio_path_real = os.path.realpath(request.audio_path)
    if not audio_path_real.startswith(_AUDIO_PATH_ROOTS):
        raise HTTPException(
            status_code=400,
            detail=f"audio_path is outside the configured data roots: {request.audio_path!r}",
        )
    if not Path(audio_path_real).exists():
        raise HTTPException(status_code=404, detail=f"Audio not found: {request.audio_path}")

    task_config = manager.tasks.get("audio_transcription")
    if task_config is None:
        raise HTTPException(
            status_code=500,
            detail="audio_transcription task not configured in models YAML",
        )
    selected = task_config.get_selected_config()

    # Ensure the model is loaded. Warmup may have loaded it already; in
    # that case load_model is a no-op and returns the cached instance.
    # ModelManager.load_model is typed Any per its inbound port; cast to
    # the concrete loader abstract base so downstream `.transcribe(...)`
    # returns a typed TranscriptionResult instead of leaking Any.
    try:
        model = cast(AudioTranscriptionLoader, await manager.load_model("audio_transcription"))
    except Exception as exc:
        logger.exception("Failed to load audio_transcription model")
        raise HTTPException(status_code=500, detail=f"Model load failed: {exc}") from exc

    start = time.time()
    try:
        # Loaders are synchronous; running inside the FastAPI worker
        # thread is fine for a 14 s demo clip but production CPU
        # deployments will want to offload to a thread pool. Pass
        # language=None when the caller did not specify one — some
        # loaders (faster-whisper) treat an empty string as a hard
        # lookup miss rather than "auto-detect".
        result: TranscriptionResult = model.transcribe(
            audio_path_real, language=request.language or None
        )
    except Exception as exc:
        logger.exception("Transcription failed")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {exc}") from exc
    processing_time = time.time() - start

    return TranscribeResponse(
        text=result.text,
        segments=[
            TranscriptionSegmentResponse(
                start=seg.start,
                end=seg.end,
                text=seg.text,
                confidence=seg.confidence,
            )
            for seg in result.segments
        ],
        language=result.language,
        duration=result.duration,
        processing_time=processing_time,
        model_used=selected.model_id,
    )
