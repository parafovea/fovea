"""Architecture-keyed registry for ONNX detection loaders.

The registry instance lives in its own module to avoid a runtime
import cycle: the ONNX loader modules (``yolo_world.py``,
``florence.py``, ``grounding_dino.py``) need a registry to decorate
themselves with at definition time, and the detection ``loader.py``
module needs to import those modules so their decorators run; both
sides cannot import the registry from the other without a cycle.
Putting the registry here breaks the cycle: the ONNX loaders and
``detection/loader.py`` both import this module, and neither imports
the other.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from src.infrastructure.adapters.outbound.models.registry import LoaderRegistry

if TYPE_CHECKING:
    from src.domain.entities.architectures import DetectionArchitecture
    from src.infrastructure.adapters.outbound.models.detection.base import DetectionModelLoader


detection_onnx_registry: LoaderRegistry[DetectionArchitecture, DetectionModelLoader] = (
    LoaderRegistry(family="detection_onnx")
)
"""ONNX Runtime detection loaders, keyed by architecture."""


__all__ = ["detection_onnx_registry"]
