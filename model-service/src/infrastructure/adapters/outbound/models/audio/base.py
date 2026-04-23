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

logger = logging.getLogger(__name__)


class AudioFramework(StrEnum):
    """Supported frameworks for audio model execution."""

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
    """Abstract base class for audio transcription loaders."""

    def __init__(self, config: TranscriptionConfig) -> None:
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
