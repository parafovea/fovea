"""Object detection model adapters.

This package contains adapters for object detection models that
implement the IDetectionModel outbound port interface.

Modules
-------
loader
    Detection loader implementations and the architecture-keyed factory.
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
    RFDETRLoader,
    YOLOELoader,
    YOLOv12Loader,
    YOLOWorldLoader,
    create_detection_loader,
    detection_onnx_registry,
    detection_pytorch_registry,
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
    "RFDETRLoader",
    "YOLOELoader",
    "YOLOWorldLoader",
    "YOLOv12Loader",
    "create_detection_loader",
    "detection_onnx_registry",
    "detection_pytorch_registry",
]
