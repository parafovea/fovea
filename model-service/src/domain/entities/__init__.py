"""Domain entities.

This package contains domain entities that represent core business concepts.
Entities have identity and lifecycle, distinguished from value objects.
"""

from src.domain.entities.detection import (
    Detection,
    DetectionResult,
    FrameDetections,
    TrackingFrameResult,
    TrackingMask,
    TrackingResult,
)
from src.domain.entities.model_config import (
    DeviceInfo,
    InferenceConfig,
    ModelConfig,
    TaskConfig,
)
from src.domain.entities.ontology import AugmentationResult, OntologyType
from src.domain.entities.summary import (
    ClaimExtractionResult,
    ClaimRelationship,
    ExtractedClaim,
    KeyFrame,
    Summary,
    SynthesizedSummary,
    TranscriptSegment,
)
from src.domain.entities.video import Frame, VideoInfo, VideoSegment

__all__ = [
    # Ontology
    "AugmentationResult",
    # Summary
    "ClaimExtractionResult",
    "ClaimRelationship",
    # Detection
    "Detection",
    "DetectionResult",
    # Model Config
    "DeviceInfo",
    "ExtractedClaim",
    # Video
    "Frame",
    "FrameDetections",
    "InferenceConfig",
    "KeyFrame",
    "ModelConfig",
    "OntologyType",
    "Summary",
    "SynthesizedSummary",
    "TaskConfig",
    "TrackingFrameResult",
    "TrackingMask",
    "TrackingResult",
    "TranscriptSegment",
    "VideoInfo",
    "VideoSegment",
]
