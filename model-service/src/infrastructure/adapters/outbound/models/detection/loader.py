"""Open-vocabulary object detection loaders dispatched by architecture.

The shared base (the :data:`detection_pytorch_registry` and
:data:`detection_onnx_registry` registries, the install hints, and the
:func:`create_detection_loader` factory) lives in :mod:`.loaders.base`; each
concrete pytorch / ultralytics / transformers loader lives in its own module
under :mod:`.loaders` and registers against the architecture Pydantic subclass
it implements via ``@detection_pytorch_registry.register(...)``.

This module aggregates those pieces into the public surface. It imports each
concrete loader module (pytorch and ONNX) for its registration side effect, so
importing this module registers every loader exactly as before the split. The
:func:`create_detection_loader` factory inspects the framework on the
:class:`DetectionConfig`, picks the matching registry, and instantiates the
loader through it. No code on this path matches on model-id substrings, weights
filenames, or free-text labels; the architecture Pydantic class is the only
legitimate dispatch key.

The two-registry design reflects the fact that the same architecture (for
example :class:`YOLOWorld`) is driven by two distinct loader classes depending
on the backend: a pytorch / ultralytics :class:`YOLOWorldLoader` and an ONNX
:class:`YOLOWorldONNXLoader` with a different inheritance chain.
"""

from __future__ import annotations

from src.infrastructure.adapters.outbound.models.detection.base import (
    BoundingBox,
    Detection,
    DetectionConfig,
    DetectionFramework,
    DetectionModelLoader,
    DetectionResult,
)
from src.infrastructure.adapters.outbound.models.detection.loaders.base import (
    create_detection_loader,
    detection_pytorch_registry,
)

# Importing each concrete loader module runs its
# ``@detection_pytorch_registry.register(...)`` decorator. These eager
# imports are the only way the pytorch loaders enter the registry, so they
# are intentional and load-bearing.
from src.infrastructure.adapters.outbound.models.detection.loaders.florence2 import Florence2Loader
from src.infrastructure.adapters.outbound.models.detection.loaders.grounding_dino import (
    GroundingDINOLoader,
)
from src.infrastructure.adapters.outbound.models.detection.loaders.owlv2 import OWLv2Loader
from src.infrastructure.adapters.outbound.models.detection.loaders.rfdetr import RFDETRLoader
from src.infrastructure.adapters.outbound.models.detection.loaders.yolo_world import YOLOWorldLoader
from src.infrastructure.adapters.outbound.models.detection.loaders.yoloe import YOLOELoader
from src.infrastructure.adapters.outbound.models.detection.loaders.yolov12 import YOLOv12Loader

# Importing the ONNX loader modules executes their
# ``@detection_onnx_registry.register(...)`` decorators and is the only way
# they enter the ONNX registry. The heavy ONNX Runtime imports stay isolated
# in those modules.
from src.infrastructure.adapters.outbound.models.onnx.florence import (  # noqa: F401
    Florence2ONNXLoader,
)
from src.infrastructure.adapters.outbound.models.onnx.grounding_dino import (  # noqa: F401
    GroundingDINOONNXLoader,
)
from src.infrastructure.adapters.outbound.models.onnx.registry import detection_onnx_registry
from src.infrastructure.adapters.outbound.models.onnx.yolo_world import (  # noqa: F401
    YOLOWorldONNXLoader,
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
