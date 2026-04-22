"""Adapters exposing audio loaders via the audio-model ports.

These thin adapters wrap :class:`WhisperLoader`, :class:`FasterWhisperLoader`,
:class:`PyannoteLoader`, and :class:`SileroVADLoader` and translate their
concrete result types into the shapes declared on the application ports
``IAudioTranscriber``, ``ISpeakerDiarizer``, and ``IVoiceActivityDetector``.
Every inference path records metrics via :func:`record_inference`.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from src.application.ports.outbound.audio_model import (
    IAudioTranscriber,
    ISpeakerDiarizer,
    IVoiceActivityDetector,
)
from src.infrastructure.observability.telemetry import record_inference

if TYPE_CHECKING:
    from src.domain.value_objects import TimeRange
    from src.infrastructure.adapters.outbound.models.audio.loader import (
        AudioTranscriptionLoader,
        PyannoteLoader,
        SileroVADLoader,
    )


class WhisperTranscriberAdapter(IAudioTranscriber):
    """Adapts a Whisper or faster-whisper loader to :class:`IAudioTranscriber`."""

    def __init__(self, loader: AudioTranscriptionLoader) -> None:
        """Initialize with an already-constructed transcription loader."""
        self._loader = loader
        self._loaded = False

    def transcribe(
        self,
        audio_path: str,
        language: str | None = None,
    ) -> dict[str, Any]:
        """Transcribe audio and convert the result to the port's dict shape."""
        if language is not None:
            self._loader.config.language = language
        with record_inference(task="transcribe", model_id=self.model_id):
            result = self._loader.transcribe(audio_path)
        segments: list[dict[str, Any]] = [
            {
                "start": float(seg.start),
                "end": float(seg.end),
                "text": str(seg.text),
                "confidence": float(seg.confidence),
            }
            for seg in result.segments
        ]
        return {
            "text": str(result.text),
            "segments": segments,
            "language": str(result.language),
            "duration": float(result.duration),
        }

    def transcribe_segment(
        self,
        audio_path: str,
        time_range: TimeRange,
        language: str | None = None,
    ) -> str:
        """Transcribe a specific time-range of an audio file."""
        full = self.transcribe(audio_path, language=language)
        start = float(time_range.start.seconds)
        end = float(time_range.end.seconds)
        chunks: list[str] = []
        for seg in full["segments"]:
            seg_start = float(seg["start"])
            seg_end = float(seg["end"])
            if seg_end < start or seg_start > end:
                continue
            chunks.append(str(seg["text"]))
        return " ".join(chunks).strip()

    def load(self) -> None:
        """Load the underlying model."""
        if self._loaded:
            return
        self._loader.load()
        self._loaded = True

    def unload(self) -> None:
        """Unload the underlying model."""
        if not self._loaded:
            return
        self._loader.unload()
        self._loaded = False

    @property
    def is_loaded(self) -> bool:
        """Return True if the model is loaded."""
        return self._loaded

    @property
    def model_id(self) -> str:
        """Return the underlying model identifier."""
        return str(self._loader.config.model_id)


class PyannoteDiarizerAdapter(ISpeakerDiarizer):
    """Adapts :class:`PyannoteLoader` to :class:`ISpeakerDiarizer`."""

    def __init__(self, loader: PyannoteLoader) -> None:
        """Initialize with an already-constructed pyannote loader."""
        self._loader = loader
        self._loaded = False

    def diarize(
        self,
        audio_path: str,
        num_speakers: int | None = None,
        min_speakers: int | None = None,
        max_speakers: int | None = None,
    ) -> list[dict[str, Any]]:
        """Run speaker diarization and return speaker segments."""
        if num_speakers is not None:
            self._loader.config.num_speakers = num_speakers
        if min_speakers is not None:
            self._loader.config.min_speakers = min_speakers
        if max_speakers is not None:
            self._loader.config.max_speakers = max_speakers

        with record_inference(task="diarize", model_id=self.model_id):
            result = self._loader.diarize(audio_path)

        return [
            {
                "speaker": str(seg.speaker),
                "start": float(seg.start),
                "end": float(seg.end),
            }
            for seg in result.segments
        ]

    def load(self) -> None:
        """Load the underlying pipeline."""
        if self._loaded:
            return
        self._loader.load()
        self._loaded = True

    def unload(self) -> None:
        """Unload the underlying pipeline."""
        if not self._loaded:
            return
        self._loader.unload()
        self._loaded = False

    @property
    def is_loaded(self) -> bool:
        """Return True if the pipeline is loaded."""
        return self._loaded

    @property
    def model_id(self) -> str:
        """Return the underlying model identifier."""
        return str(self._loader.config.model_id)


class SileroVADAdapter(IVoiceActivityDetector):
    """Adapts :class:`SileroVADLoader` to :class:`IVoiceActivityDetector`."""

    def __init__(self, loader: SileroVADLoader) -> None:
        """Initialize with an already-constructed Silero VAD loader."""
        self._loader = loader
        self._loaded = False

    def detect_speech(
        self,
        audio_path: str,
    ) -> list[tuple[float, float]]:
        """Detect speech segments in an audio file."""
        with record_inference(task="vad", model_id=self.model_id):
            result = self._loader.detect(audio_path)
        return [(float(seg.start), float(seg.end)) for seg in result.segments]

    def load(self) -> None:
        """Load the underlying VAD model."""
        if self._loaded:
            return
        self._loader.load()
        self._loaded = True

    def unload(self) -> None:
        """Unload the underlying VAD model."""
        if not self._loaded:
            return
        self._loader.unload()
        self._loaded = False

    @property
    def is_loaded(self) -> bool:
        """Return True if the VAD model is loaded."""
        return self._loaded

    @property
    def model_id(self) -> str:
        """Return the underlying model identifier."""
        return str(self._loader.config.model_id)
