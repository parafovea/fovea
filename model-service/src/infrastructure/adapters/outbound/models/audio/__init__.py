"""Audio transcription model adapters.

This package contains adapters for audio transcription models that
implement the IAudioTranscriber and IDiarizer outbound port interfaces.

Modules
-------
loader
    Audio loader implementations and factory.
"""

from src.infrastructure.adapters.outbound.models.audio.loader import (
    AudioFramework,
    AudioTranscriptionLoader,
    DiarizationConfig,
    DiarizationResult,
    FasterWhisperLoader,
    PyannoteLoader,
    SileroVADLoader,
    SpeakerSegment,
    TranscriptionConfig,
    TranscriptionResult,
    TranscriptionSegment,
    VADConfig,
    VADResult,
    VADSegment,
    WhisperLoader,
    create_transcription_loader,
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
    "create_transcription_loader",
]
