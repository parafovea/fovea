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
    """Build a transcription loader from config based on the ``framework`` hint."""
    from src.infrastructure.adapters.outbound.models.audio.loader import (  # noqa: PLC0415
        AudioFramework,
        TranscriptionConfig,
        create_transcription_loader,
    )

    framework_map = {
        "whisper": AudioFramework.WHISPER,
        "faster_whisper": AudioFramework.FASTER_WHISPER,
        "transformers": AudioFramework.TRANSFORMERS,
        "nemo_canary": AudioFramework.NEMO_CANARY,
        "nemo_parakeet": AudioFramework.NEMO_PARAKEET,
        "whisperx": AudioFramework.WHISPERX,
    }
    framework = framework_map.get(model_config.framework, AudioFramework.WHISPER)
    device = _device()

    config = TranscriptionConfig(
        model_id=model_config.model_id,
        framework=framework,
        device=device,
        compute_type="float16" if device == "cuda" else "int8",
    )

    loader = create_transcription_loader(model_config.model_id, config)
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


def _object_detection_factory(model_config: ModelConfig) -> Any:
    """Build a detection loader from config based on the ``framework`` hint."""
    from src.infrastructure.adapters.outbound.models.detection.loader import (  # noqa: PLC0415
        DetectionConfig,
        DetectionFramework,
        create_detection_loader,
    )

    framework_map = {
        "pytorch": DetectionFramework.PYTORCH,
        "ultralytics": DetectionFramework.ULTRALYTICS,
        "transformers": DetectionFramework.TRANSFORMERS,
        "onnx": DetectionFramework.ONNX,
    }
    framework = framework_map.get(model_config.framework, DetectionFramework.PYTORCH)
    config = DetectionConfig(
        model_id=model_config.model_id,
        framework=framework,
        device=_device(),
    )
    loader = create_detection_loader(model_config.model_id, config)
    loader.load()
    logger.info(f"Detection model loaded: {model_config.model_id}")
    return loader


def _object_tracking_factory(model_config: ModelConfig) -> Any:
    """Build a tracking loader, preferring SAM 3.1 when ``framework`` selects it."""
    if model_config.framework == "sam3":
        from src.infrastructure.adapters.outbound.models.sam3 import (  # noqa: PLC0415
            SAM3Loader,
            SAM3TrackingAdapter,
        )

        sam3_loader = SAM3Loader(model_id=model_config.model_id, device=_device())
        sam3_loader.load()
        logger.info(f"SAM 3.1 tracking loaded: {model_config.model_id}")
        return SAM3TrackingAdapter(sam3_loader)

    from src.infrastructure.adapters.outbound.models.tracking.loader import (  # noqa: PLC0415
        TrackingConfig,
        create_tracking_loader,
    )

    config = TrackingConfig(model_id=model_config.model_id, device=_device())
    loader = create_tracking_loader(model_config.model_id, config)
    loader.load()
    logger.info(f"Tracking model loaded: {model_config.model_id}")
    return loader


def build_default_task_factories() -> dict[str, TaskModelFactory]:
    """Return the default task factory registry."""
    return {
        "audio_transcription": _audio_transcription_factory,
        "speaker_diarization": _speaker_diarization_factory,
        "voice_activity_detection": _vad_factory,
        "object_detection": _object_detection_factory,
        "object_tracking": _object_tracking_factory,
    }
