"""NVIDIA Parakeet TDT transcription loader with streaming support."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Iterable

from src.infrastructure.adapters.outbound.models.audio.loader import (
    AudioTranscriptionLoader,
    TranscriptionResult,
    TranscriptionSegment,
)
from src.infrastructure.observability.telemetry import record_inference

logger = logging.getLogger(__name__)

NEMO_INSTALL_HINT = "NeMo required for Parakeet; install with: pip install nemo_toolkit[asr]"


class ParakeetTDTLoader(AudioTranscriptionLoader):
    """Load and run NVIDIA Parakeet TDT models via NeMo."""

    def load(self) -> None:
        """Build the underlying ``EncDecRNNTBPEModel`` instance."""
        if self.model is not None:
            return
        try:
            from nemo.collections.asr.models import EncDecRNNTBPEModel
        except ImportError as exc:
            raise ImportError(NEMO_INSTALL_HINT) from exc

        logger.info("Loading Parakeet model %s", self.config.model_id)
        self.model = EncDecRNNTBPEModel.from_pretrained(self.config.model_id)
        if hasattr(self.model, "eval"):
            self.model.eval()

    def transcribe(self, audio_path: str, language: str | None = None) -> TranscriptionResult:
        """Transcribe an entire audio file using Parakeet TDT."""
        if self.model is None:
            self.load()
        with record_inference(task="transcribe", model_id=self.config.model_id):
            raw = self.model.transcribe([audio_path], batch_size=1, return_hypotheses=True)
        return _result_from_nemo(raw, language=language or self.config.language or "en")

    async def transcribe_streaming(
        self, audio_iter: Iterable[bytes] | AsyncIterator[bytes]
    ) -> AsyncIterator[str]:
        """Stream transcription text for an audio chunk iterator.

        This wraps NeMo's streaming API. The implementation assumes the
        underlying model exposes a ``transcribe_chunk`` helper; when it does
        not the loader raises ``NotImplementedError`` so callers can fall
        back to the non-streaming path.
        """
        if self.model is None:
            self.load()
        if not hasattr(self.model, "transcribe_chunk"):
            raise NotImplementedError("The loaded Parakeet model does not expose a streaming API")

        async def _run() -> AsyncIterator[str]:
            async for chunk in _as_async_iter(audio_iter):
                with record_inference(task="transcribe_stream", model_id=self.config.model_id):
                    text = self.model.transcribe_chunk(chunk)
                if text:
                    yield str(text)

        return _run()


async def _as_async_iter(source: Iterable[bytes] | AsyncIterator[bytes]) -> AsyncIterator[bytes]:
    """Normalize a sync or async byte iterator into an async iterator."""
    if hasattr(source, "__aiter__"):
        async for item in source:  # type: ignore[union-attr]
            yield item
        return
    for item in source:  # type: ignore[union-attr]
        yield item


def _result_from_nemo(raw: Any, *, language: str) -> TranscriptionResult:
    """Convert a NeMo RNNT output into a :class:`TranscriptionResult`."""
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
    """Extract segment-level timestamps when the hypothesis carries them."""
    timestamps = getattr(hypothesis, "timestamp", None)
    if not isinstance(timestamps, dict):
        return []
    entries = timestamps.get("segment")
    if not isinstance(entries, list):
        return []
    segments: list[TranscriptionSegment] = []
    for entry in entries:
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
