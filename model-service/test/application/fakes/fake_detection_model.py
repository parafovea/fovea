"""Fake IDetectionModel for use case testing."""

from __future__ import annotations

from typing import TYPE_CHECKING

from src.application.ports.outbound.detection_model import IDetectionModel

if TYPE_CHECKING:
    import numpy as np
    from numpy.typing import NDArray

    from src.domain.entities import Detection


class FakeDetectionModel(IDetectionModel):
    """In-memory detection model returning canned detections per image."""

    def __init__(
        self,
        *,
        detections_per_image: list[list[Detection]] | None = None,
        model_id: str = "fake-detector",
        supports_tracking: bool = False,
        raise_on_detect: Exception | None = None,
    ) -> None:
        self._detections_per_image = detections_per_image or []
        self._model_id = model_id
        self._supports_tracking = supports_tracking
        self._raise_on_detect = raise_on_detect
        self._loaded = False
        self._call_index = 0
        self.detect_calls: list[tuple[str, float]] = []
        self.classes_set: list[str] = []

    def detect(
        self,
        image: NDArray[np.uint8],
        query: str,
        confidence_threshold: float = 0.3,
    ) -> list[Detection]:
        if self._raise_on_detect is not None:
            raise self._raise_on_detect
        self.detect_calls.append((query, confidence_threshold))
        if not self._detections_per_image:
            return []
        idx = min(self._call_index, len(self._detections_per_image) - 1)
        self._call_index += 1
        return list(self._detections_per_image[idx])

    def detect_batch(
        self,
        images: list[NDArray[np.uint8]],
        query: str,
        confidence_threshold: float = 0.3,
    ) -> list[list[Detection]]:
        return [self.detect(img, query, confidence_threshold) for img in images]

    def set_classes(self, class_names: list[str]) -> None:
        self.classes_set = list(class_names)

    def load(self) -> None:
        self._loaded = True

    def unload(self) -> None:
        self._loaded = False

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def model_id(self) -> str:
        return self._model_id

    @property
    def supports_tracking(self) -> bool:
        return self._supports_tracking
