"""Adapter exposing a tracking loader via :class:`ITrackingModel`.

Wraps the concrete :class:`TrackingModelLoader` implementations so the
application layer can remain framework-neutral.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import numpy as np
from numpy.typing import NDArray  # noqa: TC002
from PIL import Image

from src.application.ports.outbound.tracking_model import ITrackingModel
from src.domain.entities import TrackingMask
from src.domain.value_objects import ConfidenceScore
from src.infrastructure.observability.telemetry import record_inference

if TYPE_CHECKING:
    from src.infrastructure.adapters.outbound.models.tracking.loader import (
        TrackingModelLoader,
    )


class TrackingLoaderAdapter(ITrackingModel):
    """Adapts a :class:`TrackingModelLoader` to the tracking port."""

    def __init__(self, loader: TrackingModelLoader, *, model_id: str) -> None:
        """Initialize with a concrete loader and model identifier."""
        self._loader = loader
        self._loaded = False
        self._initialized = False
        self._model_id = model_id
        self._initial_frame: NDArray[np.uint8] | None = None
        self._initial_masks: list[NDArray[np.uint8]] = []
        self._object_ids: list[int] = []

    def initialize(
        self,
        frame: NDArray[np.uint8],
        masks: list[NDArray[np.bool_]],
        object_ids: list[int],
    ) -> None:
        """Store initialization parameters for the first frame."""
        if len(masks) != len(object_ids):
            raise ValueError(
                f"Number of masks ({len(masks)}) must match object_ids length ({len(object_ids)})"
            )
        self._initial_frame = frame
        self._initial_masks = [m.astype(np.uint8) for m in masks]
        self._object_ids = list(object_ids)
        self._initialized = True

    def track(self, frame: NDArray[np.uint8]) -> dict[int, TrackingMask]:
        """Track objects in a single frame (delegates to a one-frame batch)."""
        result = self.track_batch([frame])
        return result[0] if result else {}

    def track_batch(self, frames: list[NDArray[np.uint8]]) -> list[dict[int, TrackingMask]]:
        """Track objects across multiple frames."""
        if not self._initialized:
            raise RuntimeError("Tracker must be initialized before track_batch")

        pil_frames = [Image.fromarray(arr) for arr in frames]
        with record_inference(task="track", model_id=self._model_id):
            tracking_result = self._loader.track(
                frames=pil_frames,
                initial_masks=self._initial_masks,
                object_ids=self._object_ids,
            )

        results: list[dict[int, TrackingMask]] = []
        for tframe in tracking_result.frames:
            frame_map: dict[int, TrackingMask] = {}
            for mask in tframe.masks:
                rle: dict[str, Any] = mask.to_rle()
                frame_map[mask.object_id] = TrackingMask(
                    object_id=mask.object_id,
                    mask_rle=rle,
                    confidence=ConfidenceScore(float(mask.confidence)),
                    is_occluded=tframe.occlusions.get(mask.object_id, False),
                )
            results.append(frame_map)
        return results

    def reset(self) -> None:
        """Reset internal tracking state."""
        self._initialized = False
        self._initial_frame = None
        self._initial_masks = []
        self._object_ids = []

    def load(self) -> None:
        """Load the underlying tracking model."""
        if not self._loaded:
            self._loader.load()
            self._loaded = True

    def unload(self) -> None:
        """Unload the underlying tracking model."""
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
    def is_initialized(self) -> bool:
        """Whether tracking has been initialized."""
        return self._initialized
