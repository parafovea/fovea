"""Adapter exposing a detection loader via :class:`IDetectionModel`.

Wraps the concrete :class:`DetectionModelLoader` implementations so the
application layer can remain framework-neutral.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np  # noqa: TC002
from numpy.typing import NDArray  # noqa: TC002
from PIL import Image

from src.application.ports.outbound.detection_model import IDetectionModel
from src.domain.entities import Detection
from src.domain.value_objects import ConfidenceScore, NormalizedBBox

if TYPE_CHECKING:
    from src.infrastructure.adapters.outbound.models.detection.loader import (
        DetectionModelLoader,
    )


class DetectionLoaderAdapter(IDetectionModel):
    """Adapts a :class:`DetectionModelLoader` to the detection port."""

    def __init__(self, loader: DetectionModelLoader, *, model_id: str) -> None:
        """Initialize with a concrete loader and the model identifier."""
        self._loader = loader
        self._loaded = False
        self._model_id = model_id
        self._classes: list[str] = []

    def detect(
        self,
        image: NDArray[np.uint8],
        query: str,
        confidence_threshold: float = 0.3,
    ) -> list[Detection]:
        """Detect objects in a single image."""
        self._loader.config.confidence_threshold = confidence_threshold
        pil_image = Image.fromarray(image)
        result = self._loader.detect(pil_image, query)

        detections: list[Detection] = []
        for det in result.detections:
            bbox = NormalizedBBox.from_xyxy(
                x1=det.bbox.x1,
                y1=det.bbox.y1,
                x2=det.bbox.x2,
                y2=det.bbox.y2,
            )
            detections.append(
                Detection(
                    label=det.label,
                    bounding_box=bbox,
                    confidence=ConfidenceScore(det.confidence),
                )
            )
        return detections

    def detect_batch(
        self,
        images: list[NDArray[np.uint8]],
        query: str,
        confidence_threshold: float = 0.3,
    ) -> list[list[Detection]]:
        """Detect objects across multiple images."""
        return [self.detect(img, query, confidence_threshold) for img in images]

    def set_classes(self, class_names: list[str]) -> None:
        """Set detection classes for open-vocabulary models."""
        self._classes = list(class_names)

    def load(self) -> None:
        """Load the underlying detection model."""
        if not self._loaded:
            self._loader.load()
            self._loaded = True

    def unload(self) -> None:
        """Unload the underlying detection model."""
        if self._loaded:
            self._loader.unload()
            self._loaded = False

    @property
    def is_loaded(self) -> bool:
        """Check if the model is currently loaded."""
        return self._loaded

    @property
    def model_id(self) -> str:
        """Model identifier."""
        return self._model_id

    @property
    def supports_tracking(self) -> bool:
        """Detection-only adapters do not provide tracking."""
        return False
