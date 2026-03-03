"""Inbound ports (driving interfaces).

This package defines interfaces for application services that expose
business capabilities. These are the "driving" ports in hexagonal
architecture - external systems call these interfaces.
"""

from src.application.ports.inbound.claims import (
    ClaimExtractionInput,
    ClaimExtractionOutput,
    ClaimRelationInput,
    ClaimSourceInput,
    ClaimSynthesisInput,
    ClaimSynthesisOutput,
    ExtractedClaimOutput,
    IClaimExtractionService,
    IClaimSynthesisService,
)
from src.application.ports.inbound.detection import (
    BoundingBoxOutput,
    DetectionInput,
    DetectionOutput,
    DetectionServiceOutput,
    FrameDetectionsOutput,
    IDetectionService,
)
from src.application.ports.inbound.model_management import (
    IModelManagementService,
    LoadedModelOutput,
    MemoryValidationOutput,
    ModelConfigOutput,
    ModelOptionOutput,
    ModelRequirementOutput,
    ModelStatusOutput,
    TaskConfigOutput,
)
from src.application.ports.inbound.ontology import (
    AugmentInput,
    AugmentOutput,
    IOntologyService,
    OntologyTypeOutput,
)
from src.application.ports.inbound.summarization import (
    ISummarizationService,
    KeyFrameOutput,
    SummarizeInput,
    SummarizeOutput,
)
from src.application.ports.inbound.tracking import (
    ITrackingService,
    TrackingFrameOutput,
    TrackingInput,
    TrackingMaskOutput,
    TrackingServiceOutput,
)

__all__ = [
    # Ontology
    "AugmentInput",
    "AugmentOutput",
    # Detection
    "BoundingBoxOutput",
    # Claims
    "ClaimExtractionInput",
    "ClaimExtractionOutput",
    "ClaimRelationInput",
    "ClaimSourceInput",
    "ClaimSynthesisInput",
    "ClaimSynthesisOutput",
    "DetectionInput",
    "DetectionOutput",
    "DetectionServiceOutput",
    "ExtractedClaimOutput",
    "FrameDetectionsOutput",
    "IClaimExtractionService",
    "IClaimSynthesisService",
    "IDetectionService",
    # Model Management
    "IModelManagementService",
    "IOntologyService",
    # Summarization
    "ISummarizationService",
    # Tracking
    "ITrackingService",
    "KeyFrameOutput",
    "LoadedModelOutput",
    "MemoryValidationOutput",
    "ModelConfigOutput",
    "ModelOptionOutput",
    "ModelRequirementOutput",
    "ModelStatusOutput",
    "OntologyTypeOutput",
    "SummarizeInput",
    "SummarizeOutput",
    "TaskConfigOutput",
    "TrackingFrameOutput",
    "TrackingInput",
    "TrackingMaskOutput",
    "TrackingServiceOutput",
]
