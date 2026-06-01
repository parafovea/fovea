"""Dependency injection container.

This module provides a dependency injection container that wires
infrastructure adapters to application ports. Uses a manual factory pattern
for explicit, type-safe dependency resolution.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

    from src.application.dto.external_api import ExternalAPIConfigDTO
    from src.application.ports.outbound.audio_model import (
        IAudioTranscriber,
        ISpeakerDiarizer,
        IVoiceActivityDetector,
    )
    from src.application.ports.outbound.detection_model import IDetectionModel
    from src.application.ports.outbound.external_api_router import IExternalAPIRouter
    from src.application.ports.outbound.frame_sampler import IFrameSampler
    from src.application.ports.outbound.llm import ILanguageModel
    from src.application.ports.outbound.model_capability import IModelCapabilityProbe
    from src.application.ports.outbound.tracking_model import ITrackingModel
    from src.application.ports.outbound.transcriber import ITranscriber
    from src.application.ports.outbound.video_processor import IVideoProcessor
    from src.application.ports.outbound.vlm import IVisionLanguageModel
    from src.application.services.model_management import ModelManager
    from src.application.use_cases.augment_ontology import AugmentOntologyUseCase
    from src.application.use_cases.detect_objects import DetectObjectsUseCase
    from src.application.use_cases.extract_claims import ExtractClaimsUseCase
    from src.application.use_cases.summarize_video import SummarizeVideoUseCase
    from src.application.use_cases.synthesize_summary import SynthesizeSummaryUseCase
    from src.application.use_cases.track_objects import TrackObjectsUseCase
    from src.domain.entities.architectures import (
        DetectionArchitecture,
        TrackingArchitecture,
        VLMArchitecture,
    )

logger = logging.getLogger(__name__)


@dataclass
class ContainerConfig:
    """Configuration for the dependency injection container."""

    model_config_path: Path
    enable_telemetry: bool = True
    enable_warmup: bool = False


@dataclass
class Container:
    """Dependency injection container for the model service.

    Provides lazy initialization of services and use cases. Services are
    created on first access and cached; use-case factories construct a
    fresh instance on each call, wired from the configured adapters.
    """

    config: ContainerConfig
    _model_manager: ModelManager | None = field(default=None, init=False, repr=False)
    _initialized: bool = field(default=False, init=False, repr=False)

    # ------------------------------------------------------------------
    # Core services
    # ------------------------------------------------------------------
    @property
    def model_manager(self) -> ModelManager:
        """Get or create the singleton ModelManager."""
        if self._model_manager is None:
            from src.application.services.model_management import ModelManager  # noqa: PLC0415
            from src.infrastructure.config.task_factories import (  # noqa: PLC0415
                build_default_task_factories,
            )

            self._model_manager = ModelManager(
                str(self.config.model_config_path),
                capability_probe=self.model_capability_probe(),
                task_factories=build_default_task_factories(),
            )
            logger.info("ModelManager initialized")
        return self._model_manager

    # ------------------------------------------------------------------
    # Outbound port factories
    # ------------------------------------------------------------------
    def model_capability_probe(self) -> IModelCapabilityProbe:
        """Build a :class:`IModelCapabilityProbe` adapter."""
        from src.infrastructure.adapters.outbound.model_capability_torch import (  # noqa: PLC0415
            TorchModelCapabilityProbe,
        )

        return TorchModelCapabilityProbe()

    def frame_sampler(self) -> IFrameSampler:
        """Build an :class:`IFrameSampler` adapter."""
        from src.infrastructure.adapters.outbound.frame_sampler_opencv import (  # noqa: PLC0415
            OpenCVFrameSampler,
        )

        return OpenCVFrameSampler()

    def video_processor(self) -> IVideoProcessor:
        """Build an :class:`IVideoProcessor` adapter."""
        raise NotImplementedError("No IVideoProcessor adapter is currently registered")

    def transcriber(self) -> ITranscriber:
        """Build an :class:`ITranscriber` adapter."""
        from src.infrastructure.adapters.outbound.transcriber_whisper import (  # noqa: PLC0415
            WhisperTranscriberAdapter,
        )

        return WhisperTranscriberAdapter()

    def audio_transcriber(
        self,
        *,
        model_id: str = "openai/whisper-large-v3-turbo",
        framework: str = "whisper",
        language: str | None = None,
    ) -> IAudioTranscriber:
        """Build an :class:`IAudioTranscriber` adapter backed by Whisper or faster-whisper.

        The ``framework`` keyword selects the architecture: ``"whisper"``
        binds :class:`Whisper` (openai-whisper backend) and
        ``"faster_whisper"`` binds :class:`FasterWhisper` (CTranslate2
        backend). The architecture-keyed audio registry then dispatches
        to the registered loader without inspecting ``model_id``; the
        caller-supplied ``framework`` string is the only dispatch hint
        this container surface exposes, and it maps to a concrete
        Pydantic architecture before the registry is consulted.
        """
        from src.domain.entities.architectures import (  # noqa: PLC0415
            AudioArchitecture,
            FasterWhisper,
            Whisper,
        )
        from src.infrastructure.adapters.outbound.models.audio.adapters import (  # noqa: PLC0415
            WhisperTranscriberAdapter,
        )
        from src.infrastructure.adapters.outbound.models.audio.loader import (  # noqa: PLC0415
            AudioFramework,
            TranscriptionConfig,
            create_audio_loader,
        )

        architecture: AudioArchitecture
        if framework == "faster_whisper":
            architecture = FasterWhisper()
            framework_enum = AudioFramework.FASTER_WHISPER
        else:
            architecture = Whisper()
            framework_enum = AudioFramework.WHISPER

        device = "cuda" if self.model_capability_probe().is_cuda_available() else "cpu"
        config = TranscriptionConfig(
            model_id=model_id,
            framework=framework_enum,
            language=language,
            device=device,
        )
        loader = create_audio_loader(architecture, config)
        return WhisperTranscriberAdapter(loader)

    def speaker_diarizer(
        self,
        *,
        model_id: str = "pyannote/speaker-diarization-3.1",
    ) -> ISpeakerDiarizer:
        """Build an :class:`ISpeakerDiarizer` adapter backed by pyannote."""
        from src.infrastructure.adapters.outbound.models.audio.adapters import (  # noqa: PLC0415
            PyannoteDiarizerAdapter,
        )
        from src.infrastructure.adapters.outbound.models.audio.loader import (  # noqa: PLC0415
            DiarizationConfig,
            PyannoteLoader,
        )

        device = "cuda" if self.model_capability_probe().is_cuda_available() else "cpu"
        loader = PyannoteLoader(DiarizationConfig(model_id=model_id, device=device))
        return PyannoteDiarizerAdapter(loader)

    def voice_activity_detector(
        self,
        *,
        model_id: str = "silero_vad",
    ) -> IVoiceActivityDetector:
        """Build an :class:`IVoiceActivityDetector` adapter backed by Silero VAD."""
        from src.infrastructure.adapters.outbound.models.audio.adapters import (  # noqa: PLC0415
            SileroVADAdapter,
        )
        from src.infrastructure.adapters.outbound.models.audio.loader import (  # noqa: PLC0415
            SileroVADLoader,
            VADConfig,
        )

        device = "cuda" if self.model_capability_probe().is_cuda_available() else "cpu"
        loader = SileroVADLoader(VADConfig(model_id=model_id, device=device))
        return SileroVADAdapter(loader)

    def external_api_router(self) -> IExternalAPIRouter:
        """Build an :class:`IExternalAPIRouter` adapter."""
        from src.infrastructure.adapters.outbound.external_api_router_adapter import (  # noqa: PLC0415
            ExternalAPIRouterAdapter,
        )

        return ExternalAPIRouterAdapter()

    def language_model(
        self, *, model_id: str = "meta-llama/Llama-3.2-3B-Instruct"
    ) -> ILanguageModel:
        """Build an :class:`ILanguageModel` adapter for a given model id.

        Uses the :class:`Llama3LLM` architecture as the default because
        the bundled default ``model_id`` is a Llama-3 checkpoint. Callers
        that want a different family should construct the loader through
        :func:`create_llm_loader` with the appropriate architecture
        rather than overriding ``model_id`` on this convenience helper.
        """
        from src.domain.entities.architectures import Llama3LLM  # noqa: PLC0415
        from src.infrastructure.adapters.outbound.llm_adapter import (  # noqa: PLC0415
            LLMLoaderAdapter,
        )
        from src.infrastructure.adapters.outbound.models.llm.loader import (  # noqa: PLC0415
            LLMConfig,
            LLMFramework,
            LLMLoader,
        )

        loader = LLMLoader(
            Llama3LLM(),
            LLMConfig(
                model_id=model_id,
                quantization="4bit",
                framework=LLMFramework.TRANSFORMERS,
            ),
        )
        return LLMLoaderAdapter(loader)

    def vision_language_model(
        self,
        *,
        architecture: VLMArchitecture,
        model_id: str,
    ) -> IVisionLanguageModel:
        """Build an :class:`IVisionLanguageModel` adapter for a parsed architecture.

        Dispatch flows through :data:`vlm_registry`; the architecture's
        Pydantic class is the only key consulted. Callers parse the
        architecture block from YAML once (via :meth:`ModelConfig.from_dict`)
        and hand the typed instance to this helper.
        """
        from src.infrastructure.adapters.outbound.models.vlm.loader import (  # noqa: PLC0415
            VLMConfig,
            create_vlm_loader,
        )
        from src.infrastructure.adapters.outbound.vlm_adapter import (  # noqa: PLC0415
            VLMLoaderAdapter,
        )

        loader = create_vlm_loader(architecture, VLMConfig(model_id=model_id))
        return VLMLoaderAdapter(loader)

    def detection_model(
        self,
        *,
        architecture: DetectionArchitecture,
        model_id: str,
        framework: str = "pytorch",
        confidence_threshold: float = 0.3,
    ) -> IDetectionModel:
        """Build an :class:`IDetectionModel` adapter for a given architecture.

        Dispatch flows through :data:`detection_pytorch_registry` or
        :data:`detection_onnx_registry`; the architecture's Pydantic
        class is the only key. ``framework`` selects the backend the
        loader uses internally (PyTorch / Ultralytics / Transformers
        vs. ONNX Runtime) and consequently which of the two registries
        the factory consults.
        """
        from pathlib import Path as _Path  # noqa: PLC0415

        from src.infrastructure.adapters.outbound.detection_adapter import (  # noqa: PLC0415
            DetectionLoaderAdapter,
        )
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
        det_framework = framework_map.get(framework, DetectionFramework.PYTORCH)
        device = "cuda" if self.model_capability_probe().is_cuda_available() else "cpu"

        detection_config = DetectionConfig(
            model_id=model_id,
            framework=det_framework,
            confidence_threshold=confidence_threshold,
            device=device,
            cache_dir=_Path.home() / ".cache" / "huggingface",
        )
        loader = create_detection_loader(architecture, detection_config)
        return DetectionLoaderAdapter(loader, model_id=model_id)

    def tracking_model(
        self,
        *,
        architecture: TrackingArchitecture,
        model_id: str,
        framework: str = "pytorch",
    ) -> ITrackingModel:
        """Build an :class:`ITrackingModel` adapter for a given architecture.

        Dispatch flows through :data:`tracking_registry`; the architecture's
        Pydantic class is the only key. ``framework`` selects the framework
        adapter the loader uses internally (PyTorch, Ultralytics, SAM2) and
        does not influence loader selection.
        """
        from pathlib import Path as _Path  # noqa: PLC0415

        from src.infrastructure.adapters.outbound.models.tracking.loader import (  # noqa: PLC0415
            TrackingConfig,
            TrackingFramework,
            create_tracking_loader,
        )
        from src.infrastructure.adapters.outbound.tracking_adapter import (  # noqa: PLC0415
            TrackingLoaderAdapter,
        )

        framework_map = {
            "pytorch": TrackingFramework.PYTORCH,
            "ultralytics": TrackingFramework.ULTRALYTICS,
            "sam2": TrackingFramework.SAM2,
        }
        trk_framework = framework_map.get(framework, TrackingFramework.PYTORCH)
        device = "cuda" if self.model_capability_probe().is_cuda_available() else "cpu"

        tracking_config = TrackingConfig(
            model_id=model_id,
            framework=trk_framework,
            device=device,
            cache_dir=_Path.home() / ".cache" / "huggingface",
        )
        loader = create_tracking_loader(architecture, tracking_config)
        return TrackingLoaderAdapter(loader, model_id=model_id)

    # ------------------------------------------------------------------
    # Use case factories
    # ------------------------------------------------------------------
    def build_detect_objects_use_case(
        self,
        *,
        architecture: DetectionArchitecture,
        model_id: str,
        framework: str = "pytorch",
        confidence_threshold: float = 0.3,
    ) -> DetectObjectsUseCase:
        """Build a :class:`DetectObjectsUseCase` for a given architecture."""
        from src.application.use_cases.detect_objects import DetectObjectsUseCase  # noqa: PLC0415

        return DetectObjectsUseCase(
            detection_model=self.detection_model(
                architecture=architecture,
                model_id=model_id,
                framework=framework,
                confidence_threshold=confidence_threshold,
            ),
        )

    def build_track_objects_use_case(
        self,
        *,
        architecture: TrackingArchitecture,
        model_id: str,
        framework: str = "pytorch",
    ) -> TrackObjectsUseCase:
        """Build a :class:`TrackObjectsUseCase` for a parsed tracking architecture."""
        from src.application.use_cases.track_objects import TrackObjectsUseCase  # noqa: PLC0415

        return TrackObjectsUseCase(
            tracking_model=self.tracking_model(
                architecture=architecture,
                model_id=model_id,
                framework=framework,
            ),
        )

    def build_summarize_video_use_case(
        self,
        *,
        enable_audio: bool = False,
        with_external_router: bool = False,
        vlm: IVisionLanguageModel | None = None,
    ) -> SummarizeVideoUseCase:
        """Build a :class:`SummarizeVideoUseCase`."""
        from src.application.use_cases.summarize_video import SummarizeVideoUseCase  # noqa: PLC0415

        return SummarizeVideoUseCase(
            frame_sampler=self.frame_sampler(),
            vision_language_model=vlm,
            external_router=self.external_api_router() if with_external_router else None,
            transcriber=self.transcriber() if enable_audio else None,
        )

    def build_extract_claims_use_case(
        self, *, language_model: ILanguageModel | None = None
    ) -> ExtractClaimsUseCase:
        """Build an :class:`ExtractClaimsUseCase`."""
        from src.application.use_cases.extract_claims import ExtractClaimsUseCase  # noqa: PLC0415

        llm = language_model if language_model is not None else self.language_model()
        return ExtractClaimsUseCase(language_model=llm)

    def build_synthesize_summary_use_case(
        self, *, language_model: ILanguageModel | None = None
    ) -> SynthesizeSummaryUseCase:
        """Build a :class:`SynthesizeSummaryUseCase`."""
        from src.application.use_cases.synthesize_summary import (  # noqa: PLC0415
            SynthesizeSummaryUseCase,
        )

        llm = language_model if language_model is not None else self.language_model()
        return SynthesizeSummaryUseCase(language_model=llm)

    def build_augment_ontology_use_case(
        self,
        *,
        language_model: ILanguageModel | None = None,
        with_external_router: bool = False,
    ) -> AugmentOntologyUseCase:
        """Build an :class:`AugmentOntologyUseCase`."""
        from src.application.use_cases.augment_ontology import (  # noqa: PLC0415
            AugmentOntologyUseCase,
        )

        return AugmentOntologyUseCase(
            language_model=language_model,
            external_router=self.external_api_router() if with_external_router else None,
        )

    def build_fusion_strategy(self, *, strategy: str) -> object:
        """Build an audio-visual fusion strategy by name."""
        from src.application.use_cases.fuse_modalities import (  # noqa: PLC0415
            FusionConfig,
            FusionStrategy,
            create_fusion_strategy,
        )

        return create_fusion_strategy(FusionConfig(strategy=FusionStrategy(strategy)))

    def get_external_api_config(self, task: str) -> ExternalAPIConfigDTO:
        """Resolve an :class:`ExternalAPIConfigDTO` for the given task."""
        return self.model_manager.get_external_api_config(task)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    async def initialize(self) -> None:
        """Initialize the container and warm up services."""
        if self._initialized:
            return
        logger.info("Initializing container")
        _ = self.model_manager
        if self.config.enable_warmup:
            logger.info("Warming up models")
            await self.model_manager.warmup_models()
        self._initialized = True
        logger.info("Container initialized")

    async def shutdown(self) -> None:
        """Shutdown the container and release resources."""
        logger.info("Shutting down container")
        if self._model_manager is not None:
            await self._model_manager.shutdown()
            self._model_manager = None
        self._initialized = False
        logger.info("Container shutdown complete")


_container: Container | None = None


def get_container() -> Container:
    """Get the global container instance."""
    if _container is None:
        raise RuntimeError("Container not initialized. Call init_container() first.")
    return _container


def init_container(config: ContainerConfig) -> Container:
    """Initialize the global container instance."""
    global _container
    _container = Container(config)
    logger.info("Global container created")
    return _container


async def shutdown_container() -> None:
    """Shutdown the global container instance."""
    global _container
    if _container is not None:
        await _container.shutdown()
        _container = None
