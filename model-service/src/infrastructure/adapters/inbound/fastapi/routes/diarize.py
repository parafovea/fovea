"""Speaker diarization route.

Exposes the speaker_diarization task as a standalone endpoint so the
demo workspace can render speaker-tagged transcripts without going
through the full summarize-video pipeline.

Why a local Protocol instead of `Any`: ModelManager.load_model is typed
Any per its inbound port (it dispatches across every task family), but
the speaker_diarization factory always returns a loader whose
`diarize(audio_path) -> DiarizationResult` contract is well-defined.
Casting to `_DiarizationModel` here gives the route a typed, narrowly-
scoped view of the loader without coupling it to a specific
implementation class (PyannoteLoader, WhisperX, etc.).

Note: speaker-count hints in the request body are accepted for forward
compatibility, but the current PyannoteLoader binds them at config
load time and offers no per-call override surface — they are logged
and otherwise ignored.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Protocol, cast

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.infrastructure.adapters.inbound.fastapi.dependencies import ModelManagerDep  # noqa: TC001
from src.infrastructure.adapters.outbound.models.audio.loader import DiarizationResult

router = APIRouter()
logger = logging.getLogger(__name__)


class _DiarizationModel(Protocol):
    """Structural contract every diarizer loaded by `speaker_diarization` honours."""

    def diarize(self, audio_path: str) -> DiarizationResult: ...


class DiarizeRequest(BaseModel):
    """Request schema for the diarization endpoint."""

    audio_path: str = Field(..., description="Filesystem path to an audio or video file.")
    num_speakers: int | None = Field(
        default=None, description="Exact number of speakers if known."
    )
    min_speakers: int | None = Field(default=None, description="Lower bound on speaker count.")
    max_speakers: int | None = Field(default=None, description="Upper bound on speaker count.")


class SpeakerSegmentResponse(BaseModel):
    """One contiguous turn attributed to a single speaker."""

    speaker: str
    start: float
    end: float


class DiarizeResponse(BaseModel):
    """Response schema for the diarization endpoint."""

    segments: list[SpeakerSegmentResponse]
    speakers: list[str]
    processing_time: float
    model_used: str


@router.post(
    "/diarize",
    response_model=DiarizeResponse,
    summary="Identify speaker turns in an audio (or audio track of a video) file.",
)
async def diarize(
    request: DiarizeRequest,
    manager: ModelManagerDep,
) -> DiarizeResponse:
    """Run speaker diarization against the configured pyannote model."""
    audio_path = Path(request.audio_path)
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail=f"Audio not found: {request.audio_path}")

    task_config = manager.tasks.get("speaker_diarization")
    if task_config is None:
        raise HTTPException(
            status_code=500,
            detail="speaker_diarization task not configured in models YAML",
        )
    selected = task_config.get_selected_config()

    try:
        model = cast(_DiarizationModel, await manager.load_model("speaker_diarization"))
    except Exception as exc:
        logger.exception("Failed to load speaker_diarization model")
        raise HTTPException(status_code=500, detail=f"Model load failed: {exc}") from exc

    if (
        request.num_speakers is not None
        or request.min_speakers is not None
        or request.max_speakers is not None
    ):
        logger.warning(
            "diarize: per-request speaker-count hints (num=%s, min=%s, max=%s) are bound "
            "at loader-config time and ignored by the current diarization adapter.",
            request.num_speakers,
            request.min_speakers,
            request.max_speakers,
        )

    start = time.time()
    try:
        result: DiarizationResult = model.diarize(str(audio_path))
    except Exception as exc:
        logger.exception("Diarization failed")
        raise HTTPException(status_code=500, detail=f"Diarization failed: {exc}") from exc
    processing_time = time.time() - start

    segments = [
        SpeakerSegmentResponse(speaker=seg.speaker, start=seg.start, end=seg.end)
        for seg in result.segments
    ]
    # Preserve first-appearance order so the frontend's speaker colour
    # assignment stays stable across reloads of the same clip.
    speakers: list[str] = []
    for seg in segments:
        if seg.speaker not in speakers:
            speakers.append(seg.speaker)

    return DiarizeResponse(
        segments=segments,
        speakers=speakers,
        processing_time=processing_time,
        model_used=selected.model_id,
    )
