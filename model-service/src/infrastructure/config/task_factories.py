"""Default task model factories for :class:`ModelManager`.

These factories encapsulate all ML framework imports so that the application
service remains framework-neutral. Each factory takes a ``ModelConfig`` and
returns a concrete loader instance.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import torch

if TYPE_CHECKING:
    from src.application.services.model_management import ModelConfig, TaskModelFactory

logger = logging.getLogger(__name__)


def _device() -> str:
    """Return "cuda" if available, else "cpu"."""
    return "cuda" if torch.cuda.is_available() else "cpu"


def _audio_transcription_factory(model_config: ModelConfig) -> Any:
    """Build a Whisper/Faster-Whisper loader from config."""
    from src.infrastructure.adapters.outbound.models.audio.loader import (  # noqa: PLC0415
        AudioFramework,
        FasterWhisperLoader,
        TranscriptionConfig,
        WhisperLoader,
    )

    framework_map = {
        "whisper": AudioFramework.WHISPER,
        "faster_whisper": AudioFramework.FASTER_WHISPER,
        "transformers": AudioFramework.TRANSFORMERS,
    }
    framework = framework_map.get(model_config.framework, AudioFramework.WHISPER)
    device = _device()

    config = TranscriptionConfig(
        model_id=model_config.model_id,
        framework=framework,
        device=device,
        compute_type="float16" if device == "cuda" else "int8",
    )

    loader: Any
    if framework == AudioFramework.FASTER_WHISPER:
        loader = FasterWhisperLoader(config)
    else:
        loader = WhisperLoader(config)

    loader.load()
    logger.info(f"Audio transcription model loaded: {model_config.model_id}")
    return loader


def _speaker_diarization_factory(model_config: ModelConfig) -> Any:
    """Build a pyannote diarization loader."""
    from src.infrastructure.adapters.outbound.models.audio.loader import (  # noqa: PLC0415
        DiarizationConfig,
        PyannoteLoader,
    )

    diar_config = DiarizationConfig(model_id=model_config.model_id, device=_device())
    loader = PyannoteLoader(diar_config)
    loader.load()
    logger.info(f"Speaker diarization model loaded: {model_config.model_id}")
    return loader


def _vad_factory(model_config: ModelConfig) -> Any:
    """Build a Silero VAD loader."""
    from src.infrastructure.adapters.outbound.models.audio.loader import (  # noqa: PLC0415
        SileroVADLoader,
        VADConfig,
    )

    vad_config = VADConfig(model_id=model_config.model_id, device=_device())
    loader = SileroVADLoader(vad_config)
    loader.load()
    logger.info(f"VAD model loaded: {model_config.model_id}")
    return loader


def build_default_task_factories() -> dict[str, TaskModelFactory]:
    """Return the default task factory registry."""
    return {
        "audio_transcription": _audio_transcription_factory,
        "speaker_diarization": _speaker_diarization_factory,
        "voice_activity_detection": _vad_factory,
    }
