"""Audio transcription, voice-activity, and speaker-diarization loaders.

This module hosts the in-process audio loaders the model-service can run
without leaving the box: OpenAI Whisper, faster-whisper, Silero VAD, and
Pyannote diarization. The NeMo (Canary, Parakeet) and WhisperX loaders
live in their own submodules so their heavy optional dependencies
(``nemo_toolkit``, ``whisperx``) are not imported at module-load time.

The transcription loaders register against their concrete
:class:`AudioArchitecture` subclass on :data:`audio_registry`. The
:func:`create_audio_loader` factory dispatches purely through that
registry: a parsed architecture instance is the only key consulted. No
code along the dispatch path matches on ``model_id`` substrings,
checkpoint filenames, or other free-text labels.

External-API audio providers (AssemblyAI, Deepgram, and so on) carry an
architecture in the discriminated union for typing-completeness but are
NOT registered here; they are routed through the external API router at
the application layer before any loader factory is consulted. Asking
this registry to resolve one of them surfaces an
:class:`UnknownArchitectureError` with the legitimate audio loader list
so the misconfiguration fails loudly.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import torch

from src.domain.entities.architectures import (
    AudioArchitecture,
    FasterWhisper,
    NemoCanary,
    NemoParakeet,
    Whisper,
    WhisperX,
)
from src.infrastructure.adapters.outbound.models.audio.base import (
    AudioFramework,
    AudioTranscriptionLoader,
    TranscriptionConfig,
    TranscriptionResult,
    TranscriptionSegment,
    audio_registry,
)
from src.infrastructure.observability.telemetry import instrument_method

if TYPE_CHECKING:
    from numpy.typing import NDArray

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

logger = logging.getLogger(__name__)


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


@audio_registry.register(Whisper)
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

    @instrument_method(task="transcribe")
    def transcribe(self, audio_path: str, language: str | None = None) -> TranscriptionResult:
        """Transcribe audio file using Whisper."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        try:
            result = self.model.transcribe(
                audio_path,
                language=language if language is not None else self.config.language,
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


@audio_registry.register(FasterWhisper)
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

            # WhisperModel accepts both bare size tokens (``small``,
            # ``large-v3``) and full HuggingFace repo paths
            # (``Systran/faster-whisper-small``). The previous splitting
            # of ``model_id.split("/")[-1]`` turned ``Systran/
            # faster-whisper-small`` into ``faster-whisper-small`` which
            # is neither a valid size token nor a repo path, and faster-
            # whisper raised "Invalid model size 'faster-whisper-small'".
            # Passing the full model_id through delegates the dispatch
            # to faster-whisper itself: bare ``small`` works, the
            # Systran-converted GitHub repos work, and a fine-tuned
            # checkpoint user-provided at a local path works.
            device = self.config.device if self.config.device != "cuda" else "auto"

            self.model = WhisperModel(
                self.config.model_id,
                device=device,
                compute_type=self.config.compute_type,
                download_root=None,
            )

            logger.info("faster-whisper model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load faster-whisper model: {e}")
            raise RuntimeError(f"faster-whisper model loading failed: {e}") from e

    @instrument_method(task="transcribe")
    def transcribe(self, audio_path: str, language: str | None = None) -> TranscriptionResult:
        """Transcribe audio file using faster-whisper."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        try:
            segments_iter, info = self.model.transcribe(
                audio_path,
                language=language if language is not None else self.config.language,
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
        # Prefer the ONNX backend when CUDA isn't available. The
        # PyTorch backend's `silero_vad` model in the snakers4/
        # silero-vad hub repo eagerly imports CUDA runtime even
        # when the host has no CUDA libs, which fails on CPU-only
        # deployments with "libcudart.so.13: cannot open shared
        # object file". ONNX runtime handles the same model with
        # no PyTorch dependency. Initialize the flag unconditionally
        # before the try block AND with the conditional default in
        # the same statement so static analysis (CodeQL) sees the
        # variable as definitely assigned at every later use.
        use_onnx: bool = True
        if torch.cuda.is_available() and self.config.device == "cuda":
            use_onnx = False
        try:
            logger.info("Loading Silero VAD model")

            self.model, self.utils = torch.hub.load(  # type: ignore[no-untyped-call]
                repo_or_dir="snakers4/silero-vad",
                model="silero_vad",
                force_reload=False,
                onnx=use_onnx,
                trust_repo=True,
            )

            if not use_onnx and torch.cuda.is_available() and self.config.device == "cuda":
                self.model = self.model.to(torch.device("cuda"))

            logger.info("Silero VAD model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Silero VAD model: {e}")
            raise RuntimeError(f"Silero VAD model loading failed: {e}") from e

    @instrument_method(task="vad")
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

            # Pyannote 3.x diarization models on the HuggingFace Hub
            # require accepting the user agreement and authenticating
            # with a Hub access token. Read HUGGING_FACE_HUB_TOKEN /
            # HF_TOKEN from the environment so deployments that ship
            # a token (production / pre-warmed images) can complete
            # download without code changes; deployments without a
            # token surface a useful error instead of pyannote's
            # generic "could not download model" message.
            import os

            hf_token = os.environ.get("HUGGING_FACE_HUB_TOKEN") or os.environ.get("HF_TOKEN")
            # huggingface_hub 1.x renamed `use_auth_token` → `token`.
            # pyannote.audio 3.4 forwards the kwarg verbatim, so passing
            # the legacy name now raises "got an unexpected keyword
            # argument 'use_auth_token'". `token` works on both pyannote
            # 3.3 and 3.4 against current Hub clients.
            self.pipeline = Pipeline.from_pretrained(
                self.config.model_id,
                token=hf_token,
            )
            if self.pipeline is None:
                raise RuntimeError(
                    f"Pyannote returned None for {self.config.model_id!r}. The "
                    "model is gated on HuggingFace; set HUGGING_FACE_HUB_TOKEN to "
                    "a Hub access token that has accepted the model's user "
                    "agreement at https://huggingface.co/" + self.config.model_id
                )

            # Pin to CPU when CUDA isn't available so the pipeline's
            # internal torch operations don't try to dlopen libcudart
            # on a CPU-only host.
            target_device = (
                torch.device("cuda")
                if torch.cuda.is_available() and self.config.device == "cuda"
                else torch.device("cpu")
            )
            self.pipeline = self.pipeline.to(target_device)

            logger.info("Pyannote pipeline loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Pyannote pipeline: {e}")
            raise RuntimeError(f"Pyannote pipeline loading failed: {e}") from e

    @instrument_method(task="diarize")
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


# Side-effect imports.
#
# These submodules carry ``@audio_registry.register(...)`` decorators on
# their loader classes. Importing them at module-load time of this file
# wires NemoCanary, NemoParakeet, and WhisperX into the registry so the
# factory below can resolve them without the caller having to know which
# submodule each loader lives in. The imports are intentionally placed
# AFTER the registry definition because the decorators read it at import
# time; they are also placed at module bottom so the cycle between
# loader.py and the submodules (which import shared types from base.py)
# resolves cleanly. ``noqa: E402, F401`` documents intent: the imports
# are not used by name in this module, only for their decorator side
# effects.
from src.infrastructure.adapters.outbound.models.audio.canary import (  # noqa: E402, F401
    CanaryQwenLoader,
)
from src.infrastructure.adapters.outbound.models.audio.parakeet import (  # noqa: E402, F401
    ParakeetTDTLoader,
)
from src.infrastructure.adapters.outbound.models.audio.whisperx import (  # noqa: E402, F401
    WhisperXLoader,
)

# Sanity-assert the side-effect imports actually wired the expected
# architectures. The check runs once at module load and surfaces a
# breakage immediately (e.g. a forgotten decorator) instead of at first
# transcription attempt. Each NEMO_CANARY / NEMO_PARAKEET / WHISPERX
# architecture is referenced here ONLY to keep their imports live; the
# loader classes themselves are looked up by ``type(architecture)``
# through the registry.
_REQUIRED_REGISTRATIONS: tuple[type, ...] = (
    Whisper,
    FasterWhisper,
    WhisperX,
    NemoCanary,
    NemoParakeet,
)
_MISSING = [
    cls.__name__
    for cls in _REQUIRED_REGISTRATIONS
    if cls not in audio_registry.registered_architectures
]
if _MISSING:
    raise RuntimeError(
        f"audio_registry is missing loader registrations for: {_MISSING}. "
        f"Each AudioArchitecture subclass must be decorated with "
        f"@audio_registry.register(...) on its loader class."
    )


def create_audio_loader(
    architecture: AudioArchitecture, config: TranscriptionConfig
) -> AudioTranscriptionLoader:
    """Create the audio transcription loader registered for one architecture.

    Dispatch is pure: the architecture's concrete Pydantic class is the
    only key consulted. There is no framework-level pre-dispatch because
    audio has no clean "framework" axis: openai-whisper, faster-whisper,
    WhisperX (which wraps faster-whisper plus pyannote alignment), and
    NeMo (Canary / Parakeet) are each their own runtime and each owns
    its own loader. The architecture IS the framework here, and that
    one-to-one mapping is what the registry encodes.

    Parameters
    ----------
    architecture : AudioArchitecture
        Parsed architecture entry from the model config. The
        discriminated union guarantees the concrete subclass at compile
        time; the registry guarantees a loader is registered for it at
        runtime (for the in-process families).
    config : TranscriptionConfig
        Framework-level configuration for model loading and inference.

    Returns
    -------
    AudioTranscriptionLoader
        Loader instance registered for ``type(architecture)``.

    Raises
    ------
    src.infrastructure.adapters.outbound.models.registry.UnknownArchitectureError
        When no loader is registered for the architecture's concrete
        class. External-API architectures (AssemblyAI, Deepgram, RevAI,
        Gladia, AWSTranscribe, GoogleSpeech, AzureSpeech) deliberately
        raise here: they are dispatched through the external API router
        upstream and never reach this factory in well-configured calls.
    """
    return audio_registry.create(architecture, config)
