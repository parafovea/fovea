"""Audio transcription model adapters.

This package contains adapters for audio transcription models that
implement the IAudioTranscriber and IDiarizer outbound port interfaces.

Modules
-------
base
    Shared base types: ``AudioFramework``, ``AudioTranscriptionLoader``,
    ``TranscriptionConfig``, and the architecture-keyed
    :data:`audio_registry`.
loader
    Whisper, faster-whisper, Silero VAD, and Pyannote loaders plus the
    architecture-keyed :func:`create_audio_loader` factory.
canary, parakeet, whisperx
    Per-architecture loader implementations whose heavy optional
    dependencies (NeMo, WhisperX) are imported lazily.
"""

from src.infrastructure.adapters.outbound.models.audio.base import (
    AudioFramework,
    AudioTranscriptionLoader,
    TranscriptionConfig,
    TranscriptionResult,
    TranscriptionSegment,
    audio_registry,
)
from src.infrastructure.adapters.outbound.models.audio.loader import (
    DiarizationConfig,
    DiarizationResult,
    FasterWhisperLoader,
    PyannoteLoader,
    SileroVADLoader,
    SpeakerSegment,
    VADConfig,
    VADResult,
    VADSegment,
    WhisperLoader,
    create_audio_loader,
)

__all__ = [
    "AudioFramework",
    "AudioTranscriptionLoader",
    "DiarizationConfig",
    "DiarizationResult",
    "FasterWhisperLoader",
    "PyannoteLoader",
    "SileroVADLoader",
    "SpeakerSegment",
    "TranscriptionConfig",
    "TranscriptionResult",
    "TranscriptionSegment",
    "VADConfig",
    "VADResult",
    "VADSegment",
    "WhisperLoader",
    "audio_registry",
    "create_audio_loader",
]
