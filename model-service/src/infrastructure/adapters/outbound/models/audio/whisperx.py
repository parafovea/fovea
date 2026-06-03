"""WhisperX unified transcription and diarization loader."""

from __future__ import annotations

import logging
from typing import Any

from src.domain.entities.architectures import WhisperX
from src.infrastructure.adapters.outbound.models.audio.base import (
    AudioTranscriptionLoader,
    TranscriptionResult,
    TranscriptionSegment,
    audio_registry,
)
from src.infrastructure.observability.telemetry import record_inference

logger = logging.getLogger(__name__)

WHISPERX_INSTALL_HINT = "whisperx package required; install: pip install whisperx"


@audio_registry.register(WhisperX)
class WhisperXLoader(AudioTranscriptionLoader):
    """Load WhisperX and run the transcribe + align + diarize pipeline."""

    def load(self) -> None:
        """Prepare the WhisperX model handle.

        WhisperX loads its ASR model at call time so that align and
        diarization models can be paired with the detected language; here we
        only validate that the package is importable and cache a handle.
        """
        if self.model is not None:
            return
        try:
            import whisperx
        except ImportError as exc:
            raise ImportError(WHISPERX_INSTALL_HINT) from exc

        logger.info("Loading WhisperX model %s", self.config.model_id)
        self.model = whisperx.load_model(
            self.config.model_id,
            device=self.config.device,
            compute_type=self.config.compute_type,
        )

    def transcribe(self, audio_path: str, language: str | None = None) -> TranscriptionResult:
        """Transcribe, align, and diarize the audio at ``audio_path``."""
        if self.model is None:
            self.load()
        if self.model is None:
            raise RuntimeError("WhisperX model failed to load")
        try:
            import whisperx
        except ImportError as exc:
            raise ImportError(WHISPERX_INSTALL_HINT) from exc

        with record_inference(task="transcribe", model_id=self.config.model_id):
            audio = whisperx.load_audio(audio_path)
            transcription = self.model.transcribe(audio, language=language)

        detected_language = str(transcription.get("language", language or "en"))

        with record_inference(task="align", model_id=self.config.model_id):
            align_model, align_meta = whisperx.load_align_model(
                language_code=detected_language, device=self.config.device
            )
            aligned = whisperx.align(
                transcription["segments"],
                align_model,
                align_meta,
                audio,
                self.config.device,
            )

        with record_inference(task="diarize", model_id=self.config.model_id):
            diarize_pipeline = whisperx.DiarizationPipeline(device=self.config.device)
            diarization = diarize_pipeline(audio)
            combined = whisperx.assign_word_speakers(diarization, aligned)

        segments = _convert_segments(combined.get("segments", []))
        full_text = " ".join(seg.text for seg in segments).strip()
        duration = segments[-1].end if segments else 0.0
        return TranscriptionResult(
            text=full_text,
            segments=segments,
            language=detected_language,
            duration=duration,
        )

    def diarize(
        self,
        audio_path: str,
        num_speakers: int | None = None,
        min_speakers: int | None = None,
        max_speakers: int | None = None,
    ) -> list[dict[str, Any]]:
        """Run diarization and return speaker segments.

        Satisfies the :class:`ISpeakerDiarizer` contract when exposed via
        :class:`WhisperXTranscriberAdapter`.
        """
        result = self.transcribe(audio_path)
        speaker_segments: list[dict[str, Any]] = []
        for seg in result.segments:
            speaker = _segment_speaker(seg)
            if speaker is None:
                continue
            speaker_segments.append(
                {
                    "speaker": speaker,
                    "start": float(seg.start),
                    "end": float(seg.end),
                }
            )
        if num_speakers is not None:
            speaker_segments = _limit_speakers(speaker_segments, num_speakers)
        return speaker_segments


def _convert_segments(raw_segments: list[dict[str, Any]]) -> list[TranscriptionSegment]:
    """Convert WhisperX aligned segments into typed segments."""
    segments: list[TranscriptionSegment] = []
    for seg in raw_segments:
        segments.append(
            TranscriptionSegment(
                start=float(seg.get("start", 0.0)),
                end=float(seg.get("end", 0.0)),
                text=str(seg.get("text", "")).strip(),
                confidence=float(seg.get("score", 0.0)),
            )
        )
    return segments


def _segment_speaker(segment: TranscriptionSegment) -> str | None:
    """Return the speaker label attached to a segment if one exists."""
    speaker = getattr(segment, "speaker", None)
    return str(speaker) if speaker else None


def _limit_speakers(segments: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    """Clamp the number of distinct speakers to ``limit`` (keep first-seen)."""
    seen: dict[str, int] = {}
    kept: list[dict[str, Any]] = []
    for seg in segments:
        speaker = str(seg["speaker"])
        if speaker not in seen and len(seen) >= limit:
            continue
        seen.setdefault(speaker, len(seen))
        kept.append(seg)
    return kept
