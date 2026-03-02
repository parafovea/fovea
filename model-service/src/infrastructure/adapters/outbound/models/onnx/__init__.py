"""ONNX Runtime model adapters.

This package contains adapters for ONNX Runtime inference,
optimized for CPU-only deployments.

Modules
-------
base
    Base ONNX model loader class.
yolo_world
    YOLO-World ONNX adapter.
florence
    Florence-2 ONNX adapter.
grounding_dino
    GroundingDINO ONNX adapter.
"""

from src.infrastructure.adapters.outbound.models.onnx.base import ONNXConfig, ONNXModelLoader
from src.infrastructure.adapters.outbound.models.onnx.florence import Florence2ONNXLoader
from src.infrastructure.adapters.outbound.models.onnx.grounding_dino import (
    GroundingDINOONNXLoader,
)
from src.infrastructure.adapters.outbound.models.onnx.yolo_world import YOLOWorldONNXLoader

__all__ = [
    "Florence2ONNXLoader",
    "GroundingDINOONNXLoader",
    "ONNXConfig",
    "ONNXModelLoader",
    "YOLOWorldONNXLoader",
]
