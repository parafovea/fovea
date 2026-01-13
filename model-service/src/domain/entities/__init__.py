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
    # Detection
    "Detection",
    "DetectionResult",
    "FrameDetections",
    "TrackingFrameResult",
    "TrackingMask",
    "TrackingResult",
    # Model Config
    "DeviceInfo",
    "InferenceConfig",
    "ModelConfig",
    "TaskConfig",
    # Ontology
    "AugmentationResult",
    "OntologyType",
    # Summary
    "ClaimExtractionResult",
    "ClaimRelationship",
    "ExtractedClaim",
    "KeyFrame",
    "Summary",
    "SynthesizedSummary",
    "TranscriptSegment",
    # Video
    "Frame",
    "VideoInfo",
    "VideoSegment",
]
