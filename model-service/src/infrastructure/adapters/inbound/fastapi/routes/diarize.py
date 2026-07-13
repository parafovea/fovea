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

import asyncio
import logging
import os
import time
from pathlib import Path
from typing import TYPE_CHECKING, Protocol, cast

import didactic.api as dx
from fastapi import APIRouter, HTTPException

from src.infrastructure.adapters.inbound.fastapi.dependencies import ModelManagerDep  # noqa: TC001
from src.infrastructure.adapters.inbound.fastapi.dx_bodies import (
    as_request,
    as_response,
    dump,
)
from src.infrastructure.adapters.inbound.fastapi.routes.inference_locks import inference_lock
from src.infrastructure.config.settings import get_settings

if TYPE_CHECKING:
    from src.infrastructure.adapters.outbound.models.audio.loader import DiarizationResult

router = APIRouter()
logger = logging.getLogger(__name__)

# CodeQL path-traversal sanitizer roots. See transcribe.py for the
# rationale; the diarize route accepts the same audio_path shape. The
# barrier (realpath + startswith + raise) MUST be inlined at the use
# site so CodeQL's taint engine recognises it; wrapping it in a helper
# breaks the recognised StartswithCall pattern.
_VIDEO_DATA_PREFIX: str = os.path.realpath(str(get_settings().video_data_root)) + os.sep
_AUDIO_OUTPUT_PREFIX: str = os.path.realpath(str(get_settings().audio_output_root)) + os.sep
_AUDIO_PATH_ROOTS: tuple[str, str] = (_VIDEO_DATA_PREFIX, _AUDIO_OUTPUT_PREFIX)


class _DiarizationModel(Protocol):
    """Structural contract every diarizer loaded by `speaker_diarization` honours."""

    def diarize(self, audio_path: str) -> DiarizationResult: ...


class DiarizeRequest(dx.Model):
    """Request schema for the diarization endpoint."""

    audio_path: str = dx.field(description="Filesystem path to an audio or video file.")
    num_speakers: int | None = dx.field(
        default=None, description="Exact number of speakers if known."
    )
    min_speakers: int | None = dx.field(
        default=None, description="Lower bound on speaker count."
    )
    max_speakers: int | None = dx.field(
        default=None, description="Upper bound on speaker count."
    )


class SpeakerSegmentResponse(dx.Model):
    """One contiguous turn attributed to a single speaker."""

    speaker: str
    start: float
    end: float


class DiarizeResponse(dx.Model):
    """Response schema for the diarization endpoint."""

    segments: tuple[SpeakerSegmentResponse, ...] = dx.field(default_factory=tuple)
    speakers: tuple[str, ...] = dx.field(default_factory=tuple)
    processing_time: float = 0.0
    model_used: str = ""


if TYPE_CHECKING:
    # Handlers type-check against the source wire model; at runtime the body is
    # the Pydantic mirror FastAPI validates against (the ``else`` branch).
    _DiarizeRequestBody = DiarizeRequest
else:
    _DiarizeRequestBody = as_request(DiarizeRequest)


@router.post(
    "/diarize",
    response_model=as_response(DiarizeResponse),
    summary="Identify speaker turns in an audio (or audio track of a video) file.",
)
async def diarize(
    request: _DiarizeRequestBody,
    manager: ModelManagerDep,
) -> dict[str, object]:
    """Run speaker diarization against the configured pyannote model."""
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
        # The request model guarantees these fields are ``int | None`` so they
        # cannot carry control characters, but CodeQL's log-injection query does
        # not follow that type narrowing. The explicit ``int()`` /
        # ``"None"`` conversion below produces values whose only legal
        # characters are digits and a leading ``-``, which CodeQL recognises
        # as the typed-conversion sanitizer pattern.
        num_safe = "None" if request.num_speakers is None else str(int(request.num_speakers))
        min_safe = "None" if request.min_speakers is None else str(int(request.min_speakers))
        max_safe = "None" if request.max_speakers is None else str(int(request.max_speakers))
        logger.warning(
            "diarize: per-request speaker-count hints (num=%s, min=%s, max=%s) are bound "
            "at loader-config time and ignored by the current diarization adapter.",
            num_safe,
            min_safe,
            max_safe,
        )

    start = time.time()
    try:
        # Diarization is a blocking CPU/GPU call; offload to a worker
        # thread so it does not stall the event loop. Serialize inference on
        # the shared cached pyannote pipeline: two concurrent diarizations
        # would otherwise call the same non-thread-safe object at once.
        async with inference_lock("speaker_diarization"):
            result: DiarizationResult = await asyncio.to_thread(model.diarize, audio_path_real)
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

    return dump(
        DiarizeResponse(
            segments=tuple(segments),
            speakers=tuple(speakers),
            processing_time=processing_time,
            model_used=selected.model_id,
        )
    )
