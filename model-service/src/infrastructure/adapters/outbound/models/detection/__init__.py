"""Object detection model adapters.

This package contains adapters for object detection models that
implement the IDetectionModel outbound port interface.

Modules
-------
base
    Base adapter class and common utilities.
yolo_world
    YOLO-World model adapter.
grounding_dino
    GroundingDINO model adapter.
owlv2
    OWLv2 model adapter.
florence2
    Florence-2 model adapter.
yolo_world_onnx
    YOLO-World ONNX adapter (CPU-compatible).
florence_onnx
    Florence-2 ONNX adapter (CPU-compatible).
factory
    Detection loader factory for model instantiation.
"""

__all__: list[str] = []
