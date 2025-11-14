"""Audio transcription and speaker diarization model loaders.

This module provides loaders for audio transcription models (Whisper variants)
and speaker diarization models (Pyannote, Silero VAD). Supports multiple
inference backends for CPU and GPU deployment.
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any

import torch
from numpy.typing import NDArray

logger = logging.getLogger(__name__)


class AudioFramework(str, Enum):
    """Supported frameworks for audio model execution."""

    WHISPER = "whisper"
    FASTER_WHISPER = "faster_whisper"
    TRANSFORMERS = "transformers"
    PYANNOTE = "pyannote"


@dataclass
class TranscriptionConfig:
    """Configuration for audio transcription model loading and inference.

    Parameters
    ----------
    model_id : str
        Model identifier (e.g., "openai/whisper-large-v3").
    framework : AudioFramework
        Framework to use for transcription.
    language : str | None, default=None
        Target language code (e.g., "en"). If None, auto-detects.
    task : str, default="transcribe"
        Task type ("transcribe" or "translate").
    device : str, default="cuda"
        Device to load the model on.
    compute_type : str, default="float16"
        Compute precision (float16, int8, int8_float16).
    beam_size : int, default=5
        Beam size for decoding.
    """

    model_id: str
    framework: AudioFramework = AudioFramework.WHISPER
    language: str | None = None
    task: str = "transcribe"
    device: str = "cuda"
    compute_type: str = "float16"
    beam_size: int = 5


@dataclass
class TranscriptionSegment:
    """Single transcription segment with timing information.

    Parameters
    ----------
    start : float
        Start time in seconds.
    end : float
        End time in seconds.
    text : str
        Transcribed text for this segment.
    confidence : float
        Average confidence score (0.0 to 1.0).
    """

    start: float
    end: float
    text: str
    confidence: float


@dataclass
class TranscriptionResult:
    """Complete transcription result for an audio file.

    Parameters
    ----------
    text : str
        Full transcription text.
    segments : list[TranscriptionSegment]
        List of transcription segments with timestamps.
    language : str
        Detected or specified language code.
    duration : float
        Audio duration in seconds.
    """

    text: str
    segments: list[TranscriptionSegment]
    language: str
    duration: float


@dataclass
class DiarizationConfig:
    """Configuration for speaker diarization.

    Parameters
    ----------
    model_id : str
        HuggingFace model identifier for diarization pipeline.
    num_speakers : int | None, default=None
        Expected number of speakers. If None, automatically detects.
    min_speakers : int, default=1
        Minimum number of speakers.
    max_speakers : int, default=10
        Maximum number of speakers.
    device : str, default="cuda"
        Device to load the model on.
    """

    model_id: str
    num_speakers: int | None = None
    min_speakers: int = 1
    max_speakers: int = 10
    device: str = "cuda"


@dataclass
class SpeakerSegment:
    """Speaker segment with timing and speaker label.

    Parameters
    ----------
    start : float
        Start time in seconds.
    end : float
        End time in seconds.
    speaker : str
        Speaker label (e.g., "SPEAKER_00").
    """

    start: float
    end: float
    speaker: str


@dataclass
class DiarizationResult:
    """Speaker diarization result.

    Parameters
    ----------
    segments : list[SpeakerSegment]
        List of speaker segments with timestamps.
    num_speakers : int
        Total number of unique speakers detected.
    speakers : list[str]
        List of unique speaker labels.
    """

    segments: list[SpeakerSegment]
    num_speakers: int
    speakers: list[str]


class AudioTranscriptionLoader(ABC):
    """Abstract base class for audio transcription loaders.

    All transcription loaders must implement the load and transcribe methods.
    """

    def __init__(self, config: TranscriptionConfig) -> None:
        """Initialize the transcription loader with configuration.

        Parameters
        ----------
        config : TranscriptionConfig
            Configuration for model loading and transcription.
        """
        self.config = config
        self.model: Any = None

    @abstractmethod
    def load(self) -> None:
        """Load the transcription model into memory.

        Raises
        ------
        RuntimeError
            If model loading fails.
        """
        pass

    @abstractmethod
    def transcribe(self, audio_path: str) -> TranscriptionResult:
        """Transcribe audio file to text with timestamps.

        Parameters
        ----------
        audio_path : str
            Path to audio file (WAV format, 16kHz recommended).

        Returns
        -------
        TranscriptionResult
            Transcription with segments and timing information.

        Raises
        ------
        RuntimeError
            If transcription fails or model is not loaded.
        """
        pass

    def unload(self) -> None:
        """Unload the model from memory to free GPU resources."""
        if self.model is not None:
            del self.model
            self.model = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("Model unloaded and memory cleared")


class WhisperLoader(AudioTranscriptionLoader):
    """Loader for OpenAI Whisper transcription models.

    Whisper supports multilingual transcription and translation with
    high accuracy across 99 languages.
    """

    def load(self) -> None:
        """Load Whisper model with configured settings."""
        try:
            import whisper

            logger.info(f"Loading Whisper model {self.config.model_id} on {self.config.device}")

            model_name = self.config.model_id.split("/")[-1]
            self.model = whisper.load_model(
                model_name, device=self.config.device, download_root=None
            )

            logger.info("Whisper model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            raise RuntimeError(f"Whisper model loading failed: {e}") from e

    def transcribe(self, audio_path: str) -> TranscriptionResult:
        """Transcribe audio file using Whisper."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        try:
            result = self.model.transcribe(
                audio_path,
                language=self.config.language,
                task=self.config.task,
                beam_size=self.config.beam_size,
                word_timestamps=False,
            )

            segments = [
                TranscriptionSegment(
                    start=seg["start"],
                    end=seg["end"],
                    text=seg["text"].strip(),
                    confidence=seg.get("no_speech_prob", 0.0),
                )
                for seg in result["segments"]
            ]

            return TranscriptionResult(
                text=result["text"],
                segments=segments,
                language=result["language"],
                duration=segments[-1].end if segments else 0.0,
            )

        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            raise RuntimeError(f"Whisper transcription failed: {e}") from e


class FasterWhisperLoader(AudioTranscriptionLoader):
    """Loader for faster-whisper transcription models.

    faster-whisper is a CTranslate2-optimized implementation of Whisper
    providing 4x speed improvement with minimal accuracy loss.
    """

    def load(self) -> None:
        """Load faster-whisper model with configured settings."""
        try:
            from faster_whisper import WhisperModel

            logger.info(
                f"Loading faster-whisper model {self.config.model_id} "
                f"with {self.config.compute_type} precision"
            )

            model_name = self.config.model_id.split("/")[-1]
            device = self.config.device if self.config.device != "cuda" else "auto"

            self.model = WhisperModel(
                model_name,
                device=device,
                compute_type=self.config.compute_type,
                download_root=None,
            )

            logger.info("faster-whisper model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load faster-whisper model: {e}")
            raise RuntimeError(f"faster-whisper model loading failed: {e}") from e

    def transcribe(self, audio_path: str) -> TranscriptionResult:
        """Transcribe audio file using faster-whisper."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        try:
            segments_iter, info = self.model.transcribe(
                audio_path,
                language=self.config.language,
                task=self.config.task,
                beam_size=self.config.beam_size,
                word_timestamps=False,
            )

            segments_list = list(segments_iter)
            segments = [
                TranscriptionSegment(
                    start=seg.start,
                    end=seg.end,
                    text=seg.text.strip(),
                    confidence=seg.avg_logprob,
                )
                for seg in segments_list
            ]

            full_text = " ".join(seg.text for seg in segments)

            return TranscriptionResult(
                text=full_text,
                segments=segments,
                language=info.language,
                duration=info.duration,
            )

        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            raise RuntimeError(f"faster-whisper transcription failed: {e}") from e


@dataclass
class VADConfig:
    """Configuration for voice activity detection.

    Parameters
    ----------
    model_id : str
        Model identifier for VAD (e.g., "silero_vad").
    threshold : float, default=0.5
        Detection threshold (0.0 to 1.0).
    min_speech_duration_ms : int, default=250
        Minimum duration of speech segments in milliseconds.
    min_silence_duration_ms : int, default=100
        Minimum duration of silence between speech segments in milliseconds.
    device : str, default="cuda"
        Device to load the model on.
    """

    model_id: str
    threshold: float = 0.5
    min_speech_duration_ms: int = 250
    min_silence_duration_ms: int = 100
    device: str = "cuda"


@dataclass
class VADSegment:
    """Voice activity detection segment.

    Parameters
    ----------
    start : float
        Start time in seconds.
    end : float
        End time in seconds.
    confidence : float
        VAD confidence score (0.0 to 1.0).
    """

    start: float
    end: float
    confidence: float


@dataclass
class VADResult:
    """Voice activity detection result.

    Parameters
    ----------
    segments : list[VADSegment]
        List of speech segments detected.
    speech_duration : float
        Total duration of speech in seconds.
    total_duration : float
        Total audio duration in seconds.
    """

    segments: list[VADSegment]
    speech_duration: float
    total_duration: float


class SileroVADLoader:
    """Loader for Silero VAD (Voice Activity Detection) model.

    Silero VAD provides fast and accurate speech detection for filtering
    non-speech segments from audio files.
    """

    def __init__(self, config: VADConfig) -> None:
        """Initialize the Silero VAD loader with configuration.

        Parameters
        ----------
        config : VADConfig
            Configuration for VAD model.
        """
        self.config = config
        self.model: Any = None
        self.utils: Any = None

    def load(self) -> None:
        """Load Silero VAD model.

        Raises
        ------
        RuntimeError
            If model loading fails.
        """
        try:
            logger.info("Loading Silero VAD model")

            self.model, self.utils = torch.hub.load(  # type: ignore[no-untyped-call]
                repo_or_dir="snakers4/silero-vad",
                model="silero_vad",
                force_reload=False,
                onnx=False,
            )

            if torch.cuda.is_available() and self.config.device == "cuda":
                self.model = self.model.to(torch.device("cuda"))

            logger.info("Silero VAD model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Silero VAD model: {e}")
            raise RuntimeError(f"Silero VAD model loading failed: {e}") from e

    def detect(self, audio: NDArray[Any] | str, sample_rate: int = 16000) -> VADResult:
        """Detect speech segments in audio.

        Parameters
        ----------
        audio : NDArray[Any] | str
            Audio data as numpy array or path to audio file.
        sample_rate : int, default=16000
            Audio sample rate in Hz.

        Returns
        -------
        VADResult
            Detected speech segments with timing.

        Raises
        ------
        RuntimeError
            If detection fails or model is not loaded.
        """
        if self.model is None or self.utils is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        try:
            if isinstance(audio, str):
                audio_array, sample_rate = self.utils[0](audio)
                audio_tensor = torch.from_numpy(audio_array)
            else:
                audio_tensor = torch.from_numpy(audio)

            if torch.cuda.is_available() and self.config.device == "cuda":
                audio_tensor = audio_tensor.to(torch.device("cuda"))

            speech_timestamps = self.utils[2](
                audio_tensor,
                self.model,
                threshold=self.config.threshold,
                sampling_rate=sample_rate,
                min_speech_duration_ms=self.config.min_speech_duration_ms,
                min_silence_duration_ms=self.config.min_silence_duration_ms,
            )

            segments = []
            total_speech_duration = 0.0

            for ts in speech_timestamps:
                start_sec = ts["start"] / sample_rate
                end_sec = ts["end"] / sample_rate
                duration = end_sec - start_sec
                total_speech_duration += duration

                segments.append(VADSegment(start=start_sec, end=end_sec, confidence=1.0))

            total_duration = len(audio_tensor) / sample_rate

            return VADResult(
                segments=segments,
                speech_duration=total_speech_duration,
                total_duration=total_duration,
            )

        except Exception as e:
            logger.error(f"VAD detection failed: {e}")
            raise RuntimeError(f"Silero VAD detection failed: {e}") from e

    def unload(self) -> None:
        """Unload the model from memory to free GPU resources."""
        if self.model is not None:
            del self.model
            self.model = None
        if self.utils is not None:
            del self.utils
            self.utils = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("Model unloaded and memory cleared")


class PyannoteLoader:
    """Loader for Pyannote speaker diarization pipeline.

    Pyannote provides speaker diarization (who spoke when) for audio files
    with support for overlapping speech and multiple speakers.
    """

    def __init__(self, config: DiarizationConfig) -> None:
        """Initialize the Pyannote loader with configuration.

        Parameters
        ----------
        config : DiarizationConfig
            Configuration for diarization pipeline.
        """
        self.config = config
        self.pipeline: Any = None

    def load(self) -> None:
        """Load Pyannote diarization pipeline.

        Raises
        ------
        RuntimeError
            If pipeline loading fails.
        """
        try:
            from pyannote.audio import Pipeline

            logger.info(f"Loading Pyannote pipeline {self.config.model_id}")

            self.pipeline = Pipeline.from_pretrained(self.config.model_id, use_auth_token=None)

            if torch.cuda.is_available() and self.config.device == "cuda":
                self.pipeline = self.pipeline.to(torch.device("cuda"))

            logger.info("Pyannote pipeline loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Pyannote pipeline: {e}")
            raise RuntimeError(f"Pyannote pipeline loading failed: {e}") from e

    def diarize(self, audio_path: str) -> DiarizationResult:
        """Perform speaker diarization on audio file.

        Parameters
        ----------
        audio_path : str
            Path to audio file.

        Returns
        -------
        DiarizationResult
            Speaker segments with timing and labels.

        Raises
        ------
        RuntimeError
            If diarization fails or pipeline is not loaded.
        """
        if self.pipeline is None:
            raise RuntimeError("Pipeline not loaded. Call load() first.")

        try:
            diarization_params = {}
            if self.config.num_speakers is not None:
                diarization_params["num_speakers"] = self.config.num_speakers
            else:
                diarization_params["min_speakers"] = self.config.min_speakers
                diarization_params["max_speakers"] = self.config.max_speakers

            diarization = self.pipeline(audio_path, **diarization_params)

            segments = []
            speakers_set = set()

            for turn, _, speaker in diarization.itertracks(yield_label=True):
                segments.append(
                    SpeakerSegment(start=turn.start, end=turn.end, speaker=str(speaker))
                )
                speakers_set.add(str(speaker))

            speakers_list = sorted(speakers_set)

            return DiarizationResult(
                segments=segments, num_speakers=len(speakers_list), speakers=speakers_list
            )

        except Exception as e:
            logger.error(f"Diarization failed: {e}")
            raise RuntimeError(f"Pyannote diarization failed: {e}") from e

    def unload(self) -> None:
        """Unload the pipeline from memory to free GPU resources."""
        if self.pipeline is not None:
            del self.pipeline
            self.pipeline = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("Pipeline unloaded and memory cleared")


def create_transcription_loader(
    model_name: str, config: TranscriptionConfig
) -> AudioTranscriptionLoader:
    """Factory function to create transcription loader based on model name.

    Parameters
    ----------
    model_name : str
        Name of the model to load. Supported values:
        - "whisper-*" (e.g., "whisper-large-v3", "whisper-v3-turbo")
        - "faster-whisper-*" (e.g., "faster-whisper-large-v3")
    config : TranscriptionConfig
        Configuration for model loading and transcription.

    Returns
    -------
    AudioTranscriptionLoader
        Appropriate loader instance for the specified model.

    Raises
    ------
    ValueError
        If model_name is not recognized.
    """
    model_name_lower = model_name.lower()

    if "faster-whisper" in model_name_lower:
        return FasterWhisperLoader(config)
    if "whisper" in model_name_lower:
        return WhisperLoader(config)
    raise ValueError(
        f"Unknown model name: {model_name}. Supported models: whisper-*, faster-whisper-*"
    )
