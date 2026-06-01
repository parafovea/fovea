"""Shared base types for audio transcription loaders.

Extracted from ``loader.py`` so that implementation modules (canary, parakeet,
whisperx, and similar) can import ``AudioTranscriptionLoader`` without
creating a runtime cycle with the factory functions defined in ``loader.py``.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

import torch

from src.domain.entities.architectures import AudioArchitecture
from src.infrastructure.adapters.outbound.models.registry import LoaderRegistry

logger = logging.getLogger(__name__)


class AudioFramework(StrEnum):
    """Supported frameworks for audio model execution.

    Retained as a backwards-compatible legacy hint on
    :class:`TranscriptionConfig` so existing callers that pre-date the
    architecture-keyed registry continue to type-check. New dispatch goes
    through the registered :class:`AudioArchitecture` Pydantic subclass on
    :class:`src.domain.entities.ModelConfig`; this enum carries no dispatch
    semantics in the audio loader factory and is preserved purely so
    older :class:`TranscriptionConfig` consumers (telemetry tags, log
    messages) keep working unchanged.
    """

    WHISPER = "whisper"
    FASTER_WHISPER = "faster_whisper"
    TRANSFORMERS = "transformers"
    PYANNOTE = "pyannote"
    NEMO_CANARY = "nemo_canary"
    NEMO_PARAKEET = "nemo_parakeet"
    WHISPERX = "whisperx"


@dataclass
class TranscriptionConfig:
    """Configuration for audio transcription model loading and inference."""

    model_id: str
    framework: AudioFramework = AudioFramework.WHISPER
    language: str | None = None
    task: str = "transcribe"
    device: str = "cuda"
    compute_type: str = "float16"
    beam_size: int = 5


@dataclass
class TranscriptionSegment:
    """Single transcription segment with timing information."""

    start: float
    end: float
    text: str
    confidence: float


@dataclass
class TranscriptionResult:
    """Complete transcription result for an audio file."""

    text: str
    segments: list[TranscriptionSegment]
    language: str
    duration: float


class AudioTranscriptionLoader(ABC):
    """Abstract base class for audio transcription loaders.

    Subclasses are registered against their concrete
    :class:`AudioArchitecture` Pydantic subclass via
    ``@audio_registry.register(ArchitectureClass)`` so the audio loader
    factory can dispatch by architecture rather than by substring matching
    on a model identifier. The architecture instance is the first
    positional argument to the loader constructor, matching the registry's
    ``create(architecture, *extras)`` contract.
    """

    def __init__(self, arch: AudioArchitecture, config: TranscriptionConfig) -> None:
        """Initialize the loader with its architecture and framework config.

        Parameters
        ----------
        arch : AudioArchitecture
            Parsed architecture entry the loader was registered for.
            Subclasses may introspect their own architecture subclass for
            per-family hyperparameters; the base class keeps it as a typed
            reference so the registry contract holds end-to-end.
        config : TranscriptionConfig
            Framework-level configuration (model id, device, compute type).
        """
        self.arch = arch
        self.config = config
        self.model: Any = None

    @abstractmethod
    def load(self) -> None:
        """Load the transcription model into memory."""

    @abstractmethod
    def transcribe(self, audio_path: str, language: str | None = None) -> TranscriptionResult:
        """Transcribe audio file to text with timestamps."""

    def unload(self) -> None:
        """Unload the model from memory to free GPU resources."""
        if self.model is not None:
            del self.model
            self.model = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("Model unloaded and memory cleared")


audio_registry: LoaderRegistry[AudioArchitecture, AudioTranscriptionLoader] = LoaderRegistry(
    family="audio"
)
"""Architecture-keyed registry of audio transcription loader classes.

Lives in ``base.py`` (not ``loader.py``) so the per-architecture loader
modules (``canary.py``, ``parakeet.py``, ``whisperx.py``) can register
themselves via ``@audio_registry.register(ArchitectureClass)`` without
importing ``loader.py`` and creating an import cycle.
"""
