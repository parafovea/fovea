"""Default task model factories for :class:`ModelManager`.

These factories encapsulate all ML framework imports so that the application
service remains framework-neutral. Each factory takes a ``ModelConfig`` and
returns a concrete loader instance.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, cast

import torch

if TYPE_CHECKING:
    from src.application.services.model_management import ModelConfig, TaskModelFactory
    from src.domain.entities.architectures import AudioArchitecture

logger = logging.getLogger(__name__)


def _device() -> str:
    """Return "cuda" if available, else "cpu"."""
    return "cuda" if torch.cuda.is_available() else "cpu"


def _audio_transcription_factory(model_config: ModelConfig) -> Any:
    """Build a transcription loader from the architecture-keyed audio registry.

    The legacy ``framework`` string is preserved on
    :class:`TranscriptionConfig` for telemetry and back-compat with the
    older Whisper / faster-whisper code paths, but it is no longer the
    dispatch key: the loader class is resolved by the architecture's
    concrete Pydantic subclass on ``model_config.architecture``.
    """
    from src.infrastructure.adapters.outbound.models.audio.loader import (  # noqa: PLC0415
        AudioFramework,
        TranscriptionConfig,
        create_audio_loader,
    )

    if model_config.architecture is None:
        raise ValueError(
            f"audio_transcription model {model_config.model_id!r} has no architecture set; "
            "every audio_transcription YAML option must carry an "
            "`architecture: {kind: ...}` block so the registry can dispatch to the "
            "correct loader without substring-matching on model_id."
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

    loader = create_audio_loader(cast("AudioArchitecture", model_config.architecture), config)
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
    """Build a detection loader from config based on the ``framework`` hint.

    Dispatch is purely architecture-keyed: the architecture Pydantic
    model parsed from the YAML's ``architecture:`` block selects the
    loader class via the registry, and the ``framework`` enum on
    :class:`DetectionConfig` selects between the pytorch and ONNX
    registries. No code on this path inspects ``model_id`` strings.
    """
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
    architecture = model_config.architecture
    if architecture is None:
        raise ValueError(
            f"Object-detection model {model_config.model_id!r} has no "
            "`architecture:` block in its YAML config. Add an "
            "`architecture: {kind: ...}` block (e.g. kind: yolo-world, "
            "yoloe, yolov12, rf-detr, grounding-dino, owl-v2, florence-2) "
            "so the loader registry can dispatch by architecture instead "
            "of by model-id substring."
        )
    # The pydantic discriminator on ModelConfig.architecture already
    # guarantees the runtime instance is one of the DetectionArchitecture
    # subclasses; the registry dispatches on its concrete type. The
    # ``# type: ignore`` reflects that the union narrowing from
    # ``Architecture`` to ``DetectionArchitecture`` is implicit in the
    # YAML schema rather than statically provable.
    config = DetectionConfig(
        model_id=model_config.model_id,
        framework=framework,
        device=_device(),
    )
    loader = create_detection_loader(architecture, config)  # type: ignore[arg-type]
    loader.load()
    logger.info(f"Detection model loaded: {model_config.model_id}")
    return loader


def _object_tracking_factory(model_config: ModelConfig) -> Any:
    """Build a tracking loader, preferring SAM 3.1 when ``framework`` selects it.

    The SAM 3.1 path is a framework-level pre-dispatch: the SAM3 adapter lives
    in its own module with its own loading conventions and is selected by the
    ``framework: "sam3"`` YAML hint before the architecture-keyed registry is
    consulted. Every other tracking entry routes through the registry, which
    dispatches on ``model_config.architecture``'s runtime class.
    """
    if model_config.framework == "sam3":
        from src.infrastructure.adapters.outbound.models.sam3 import (  # noqa: PLC0415
            SAM3Loader,
            SAM3TrackingAdapter,
        )

        sam3_loader = SAM3Loader(model_id=model_config.model_id, device=_device())
        sam3_loader.load()
        logger.info(f"SAM 3.1 tracking loaded: {model_config.model_id}")
        return SAM3TrackingAdapter(sam3_loader)

    from src.domain.entities.architectures import (  # noqa: PLC0415
        SAM2,
        SAMURAI,
        SAM2Long,
        YOLO11Seg,
    )
    from src.infrastructure.adapters.outbound.models.tracking.loader import (  # noqa: PLC0415
        TrackingConfig,
        create_tracking_loader,
    )

    architecture = model_config.architecture
    if architecture is None:
        raise ValueError(
            f"Tracking model {model_config.model_id!r} has no architecture set on its "
            "ModelConfig. Add an `architecture:` block to its YAML entry so the loader "
            "registry can dispatch on the architecture's Pydantic class."
        )
    if not isinstance(architecture, (SAMURAI, SAM2Long, SAM2, YOLO11Seg)):
        raise ValueError(
            f"Tracking model {model_config.model_id!r} declares architecture "
            f"{type(architecture).__qualname__!r} which is not a tracking architecture. "
            "Pick one of SAMURAI, SAM2Long, SAM2, YOLO11Seg in the YAML entry."
        )

    config = TrackingConfig(model_id=model_config.model_id, device=_device())
    loader = create_tracking_loader(architecture, config)
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
