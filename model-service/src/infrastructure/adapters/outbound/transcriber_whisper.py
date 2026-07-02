"""Whisper-backed implementation of :class:`ITranscriber`.

Handles audio extraction from video, transcription via Whisper, and optional
speaker diarization via pyannote. Keeps all ML framework imports (torch,
transformers) inside infrastructure.
"""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
import time
from typing import TYPE_CHECKING

import torch

from src.application.ports.outbound.transcriber import (
    ITranscriber,
    TranscriptionResultDTO,
    TranscriptSegmentDTO,
)
from src.application.services.audio_processing import extract_audio_track, has_audio_stream
from src.infrastructure.observability.telemetry import record_inference

if TYPE_CHECKING:
    from src.infrastructure.adapters.outbound.models.audio.loader import TranscriptionConfig

logger = logging.getLogger(__name__)


class WhisperTranscriberAdapter(ITranscriber):
    """Transcriber backed by Whisper (and optionally pyannote for diarization)."""

    def __init__(self, model_id: str = "openai/whisper-large-v3-turbo") -> None:
        """Initialize with the Whisper model identifier."""
        self._model_id = model_id

    async def transcribe_video(
        self,
        video_path: str,
        *,
        language: str | None = None,
        enable_diarization: bool = False,
    ) -> TranscriptionResultDTO:
        """Transcribe audio from a video file."""
        from src.infrastructure.adapters.outbound.models.audio.loader import (  # noqa: PLC0415
            AudioFramework,
            TranscriptionConfig,
        )

        start = time.time()

        if not await has_audio_stream(video_path):
            logger.info("Video has no audio track: %s", _safe(video_path))
            return TranscriptionResultDTO(text="", segments=[], processing_time=0.0)

        temp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        audio_path = temp_file.name
        temp_file.close()

        try:
            await extract_audio_track(video_path, output_path=audio_path)

            device = "cuda" if torch.cuda.is_available() else "cpu"
            config = TranscriptionConfig(
                model_id=self._model_id,
                framework=AudioFramework.WHISPER,
                language=language,
                device=device,
            )
            # Whisper load/transcribe, pyannote diarization, and unload are heavy
            # blocking (CPU/GPU) calls that would run for tens of seconds to
            # minutes. Offload the whole sequence to a worker thread so the event
            # loop — /health probes, OTLP metric export, other concurrent
            # requests — is not frozen for the duration.
            text, segments, language_out, speaker_count = await asyncio.to_thread(
                _run_transcription,
                config,
                audio_path,
                self._model_id,
                device,
                enable_diarization,
            )

            return TranscriptionResultDTO(
                text=text,
                segments=segments,
                language=language_out,
                speaker_count=speaker_count,
                processing_time=time.time() - start,
            )

        finally:
            if os.path.exists(audio_path):
                os.remove(audio_path)


def _run_transcription(
    config: TranscriptionConfig,
    audio_path: str,
    model_id: str,
    device: str,
    enable_diarization: bool,
) -> tuple[str, list[TranscriptSegmentDTO], str | None, int | None]:
    """Load Whisper, transcribe, optionally diarize, and unload — all blocking.

    Runs on a worker thread (via ``asyncio.to_thread``) so the event loop is not
    frozen for the duration of inference. Returns the transcript text, segments,
    detected language, and speaker count.
    """
    from src.domain.entities.architectures import Whisper  # noqa: PLC0415
    from src.infrastructure.adapters.outbound.models.audio.loader import (  # noqa: PLC0415
        WhisperLoader,
    )

    loader = WhisperLoader(Whisper(), config)
    loader.load()
    try:
        with record_inference(task="transcribe", model_id=model_id):
            result = loader.transcribe(audio_path)
        segments = [
            TranscriptSegmentDTO(
                start=float(seg.start),
                end=float(seg.end),
                text=str(seg.text),
                confidence=float(getattr(seg, "confidence", 0.0) or 0.0),
            )
            for seg in result.segments
        ]

        speaker_count: int | None = None
        if enable_diarization:
            speaker_count = _apply_diarization(audio_path, segments, device)

        return str(result.text), segments, getattr(result, "language", None), speaker_count
    finally:
        loader.unload()


def _apply_diarization(
    audio_path: str, segments: list[TranscriptSegmentDTO], device: str
) -> int | None:
    """Apply speaker diarization and assign speakers to segments."""
    from src.infrastructure.adapters.outbound.models.audio.loader import (  # noqa: PLC0415
        DiarizationConfig,
        PyannoteLoader,
    )

    diar_config = DiarizationConfig(
        model_id="pyannote/speaker-diarization-3.1",
        device=device,
    )
    diar_loader = PyannoteLoader(diar_config)
    diar_loader.load()
    try:
        with record_inference(task="diarize", model_id="pyannote/speaker-diarization-3.1"):
            diar_result = diar_loader.diarize(audio_path)
        speaker_map: dict[tuple[float, float], str] = {}
        for diar_seg in diar_result.segments:
            speaker_map[(float(diar_seg.start), float(diar_seg.end))] = str(diar_seg.speaker)

        for seg in segments:
            for (diar_start, _diar_end), speaker in speaker_map.items():
                if abs(seg.start - diar_start) < 0.5:
                    seg.speaker = speaker
                    break

        return len(set(speaker_map.values()))
    finally:
        diar_loader.unload()


def _safe(value: str) -> str:
    """Strip CR/LF to make a string safe for log output."""
    return str(value).replace("\r", "").replace("\n", "")
