"""Object detection model adapters.

This package contains adapters for object detection models that
implement the IDetectionModel outbound port interface.

Modules
-------
loader
    Detection loader implementations and factory.
"""

from src.infrastructure.adapters.outbound.models.detection.loader import (
    BoundingBox,
    Detection,
    DetectionConfig,
    DetectionFramework,
    DetectionModelLoader,
    DetectionResult,
    Florence2Loader,
    GroundingDINOLoader,
    OWLv2Loader,
    YOLOWorldLoader,
    create_detection_loader,
)

__all__ = [
    "BoundingBox",
    "Detection",
    "DetectionConfig",
    "DetectionFramework",
    "DetectionModelLoader",
    "DetectionResult",
    "Florence2Loader",
    "GroundingDINOLoader",
    "OWLv2Loader",
    "YOLOWorldLoader",
    "create_detection_loader",
]
