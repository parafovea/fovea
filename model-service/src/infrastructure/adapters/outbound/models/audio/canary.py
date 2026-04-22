"""NVIDIA Canary-Qwen transcription loader.

Uses NeMo's ``EncDecMultiTaskModel`` to run the Canary family of multi-task
speech models. The NeMo dependency is imported lazily so the service can
boot without it installed.
"""

from __future__ import annotations

import logging
from typing import Any

from src.infrastructure.adapters.outbound.models.audio.loader import (
    AudioTranscriptionLoader,
    TranscriptionResult,
    TranscriptionSegment,
)
from src.infrastructure.observability.telemetry import record_inference

logger = logging.getLogger(__name__)

NEMO_INSTALL_HINT = "NeMo required for Canary; install with: pip install nemo_toolkit[asr]"


class CanaryQwenLoader(AudioTranscriptionLoader):
    """Load and run inference with NVIDIA Canary-Qwen ASR models."""

    def load(self) -> None:
        """Build the underlying ``EncDecMultiTaskModel`` instance."""
        if self.model is not None:
            return
        try:
            from nemo.collections.asr.models import EncDecMultiTaskModel
        except ImportError as exc:
            raise ImportError(NEMO_INSTALL_HINT) from exc

        logger.info("Loading Canary model %s", self.config.model_id)
        self.model = EncDecMultiTaskModel.from_pretrained(self.config.model_id)
        if hasattr(self.model, "eval"):
            self.model.eval()

    def transcribe(self, audio_path: str, language: str | None = None) -> TranscriptionResult:
        """Transcribe ``audio_path`` and return segments with timestamps.

        Parameters
        ----------
        audio_path : str
            Path to an audio file readable by NeMo.
        language : str | None
            Optional language hint forwarded to Canary's multi-task prompt.
        """
        if self.model is None:
            self.load()

        lang = language if language is not None else self.config.language
        prompt: dict[str, Any] = {
            "task": self.config.task,
            "source_lang": lang or "en",
            "target_lang": lang or "en",
            "pnc": "yes",
        }
        with record_inference(task="transcribe", model_id=self.config.model_id):
            raw = self.model.transcribe(
                [audio_path],
                batch_size=1,
                return_hypotheses=True,
                **{"prompt": prompt},
            )

        return _result_from_nemo(raw, language=lang or "en")


def _result_from_nemo(raw: Any, *, language: str) -> TranscriptionResult:
    """Convert NeMo Canary output into a :class:`TranscriptionResult`."""
    if not raw:
        return TranscriptionResult(text="", segments=[], language=language, duration=0.0)

    first = raw[0] if isinstance(raw, list) else raw
    text = _extract_text(first)
    segments = _extract_segments(first)
    duration = segments[-1].end if segments else 0.0
    return TranscriptionResult(
        text=text,
        segments=segments,
        language=language,
        duration=duration,
    )


def _extract_text(hypothesis: Any) -> str:
    """Pull the transcript text out of a NeMo hypothesis object or string."""
    if isinstance(hypothesis, str):
        return hypothesis
    for attr in ("text", "pred_text"):
        if hasattr(hypothesis, attr):
            value = getattr(hypothesis, attr)
            if isinstance(value, str):
                return value
    return ""


def _extract_segments(hypothesis: Any) -> list[TranscriptionSegment]:
    """Pull timestamped segments from a NeMo hypothesis, if present."""
    timestamps = getattr(hypothesis, "timestamp", None)
    if not isinstance(timestamps, dict):
        return []
    segment_entries = timestamps.get("segment")
    if not isinstance(segment_entries, list):
        return []
    segments: list[TranscriptionSegment] = []
    for entry in segment_entries:
        if not isinstance(entry, dict):
            continue
        segments.append(
            TranscriptionSegment(
                start=float(entry.get("start", 0.0)),
                end=float(entry.get("end", 0.0)),
                text=str(entry.get("segment", entry.get("text", ""))).strip(),
                confidence=float(entry.get("confidence", 0.0)),
            )
        )
    return segments
