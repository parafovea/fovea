"""Detection-port adapter for :class:`SAM3Loader`."""

from __future__ import annotations

from typing import TYPE_CHECKING

from src.application.ports.outbound.detection_model import IDetectionModel

if TYPE_CHECKING:
    import numpy as np
    from numpy.typing import NDArray

    from src.domain.entities import Detection
    from src.infrastructure.adapters.outbound.models.sam3.loader import SAM3Loader


class SAM3DetectionAdapter(IDetectionModel):
    """Expose :class:`SAM3Loader` through :class:`IDetectionModel`."""

    def __init__(self, loader: SAM3Loader) -> None:
        """Wrap an existing SAM 3.1 loader."""
        self._loader = loader
        self._classes: list[str] = []

    def detect(
        self,
        image: NDArray[np.uint8],
        query: str,
        confidence_threshold: float = 0.3,
    ) -> list[Detection]:
        """Detect objects matching the text query in a single image."""
        prompts = self._classes if self._classes else _split_query(query)
        return self._loader.detect(
            image=image,
            text_prompts=prompts,
            confidence_threshold=confidence_threshold,
        )

    def detect_batch(
        self,
        images: list[NDArray[np.uint8]],
        query: str,
        confidence_threshold: float = 0.3,
    ) -> list[list[Detection]]:
        """Run :meth:`detect` across a list of images."""
        return [self.detect(img, query, confidence_threshold) for img in images]

    def set_classes(self, class_names: list[str]) -> None:
        """Override the default prompt list derived from the query."""
        self._classes = list(class_names)

    def load(self) -> None:
        """Load the underlying model."""
        self._loader.load()

    def unload(self) -> None:
        """Release the underlying model."""
        self._loader.unload()

    @property
    def is_loaded(self) -> bool:
        """Return True when the underlying model has been constructed."""
        return self._loader.is_loaded

    @property
    def model_id(self) -> str:
        """Return the underlying model identifier."""
        return self._loader.model_id

    @property
    def supports_tracking(self) -> bool:
        """SAM 3.1 natively supports mask tracking."""
        return True


def _split_query(query: str) -> list[str]:
    """Split a period- or comma-delimited query into prompt fragments."""
    parts = [p.strip() for p in query.replace(",", ".").split(".")]
    return [p for p in parts if p]
