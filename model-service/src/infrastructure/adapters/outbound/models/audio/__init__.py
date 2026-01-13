"""Audio transcription model adapters.

This package contains adapters for audio transcription models that
implement the IAudioTranscriber and IDiarizer outbound port interfaces.

Modules
-------
base
    Base adapter class and common utilities.
whisper
    OpenAI Whisper model adapter.
faster_whisper
    faster-whisper CTranslate2 adapter (CPU-compatible).
pyannote
    Pyannote speaker diarization adapter.
silero_vad
    Silero VAD adapter (CPU-native).
factory
    Audio loader factory for model instantiation.
"""

__all__: list[str] = []
