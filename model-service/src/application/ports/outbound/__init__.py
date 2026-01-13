"""Outbound ports (driven interfaces).

This package defines interfaces for external dependencies that the application
uses. These are the "driven" ports in hexagonal architecture - adapters
implement these interfaces to connect the application to external systems.
"""

from src.application.ports.outbound.audio_model import (
    IAudioTranscriber,
    ISpeakerDiarizer,
    IVoiceActivityDetector,
)
from src.application.ports.outbound.detection_model import IDetectionModel
from src.application.ports.outbound.external_api import (
    ExternalAPIResponse,
    IExternalAPIClient,
)
from src.application.ports.outbound.llm import ILanguageModel
from src.application.ports.outbound.model_repository import IModelRepository
from src.application.ports.outbound.tracking_model import ITrackingModel
from src.application.ports.outbound.video_processor import IVideoProcessor
from src.application.ports.outbound.vlm import IVisionLanguageModel

__all__ = [
    # Audio
    "IAudioTranscriber",
    "ISpeakerDiarizer",
    "IVoiceActivityDetector",
    # Detection
    "IDetectionModel",
    # External API
    "ExternalAPIResponse",
    "IExternalAPIClient",
    # LLM
    "ILanguageModel",
    # Model Repository
    "IModelRepository",
    # Tracking
    "ITrackingModel",
    # Video
    "IVideoProcessor",
    # VLM
    "IVisionLanguageModel",
]
