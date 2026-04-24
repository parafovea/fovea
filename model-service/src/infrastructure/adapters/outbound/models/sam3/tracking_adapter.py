"""Tracking-port adapter for :class:`SAM3Loader`."""

from __future__ import annotations

from typing import TYPE_CHECKING

from src.application.ports.outbound.tracking_model import ITrackingModel
from src.domain.entities import TrackingMask
from src.domain.value_objects import ConfidenceScore

if TYPE_CHECKING:
    import numpy as np
    from numpy.typing import NDArray

    from src.infrastructure.adapters.outbound.models.sam3.loader import SAM3Loader


class SAM3TrackingAdapter(ITrackingModel):
    """Expose :class:`SAM3Loader` through :class:`ITrackingModel`.

    The adapter stores initialization state locally so callers can seed the
    tracker from a text prompt (via :meth:`set_prompt`) and then stream
    frames in through :meth:`track` / :meth:`track_batch`.
    """

    def __init__(self, loader: SAM3Loader) -> None:
        """Wrap an existing SAM 3.1 loader."""
        self._loader = loader
        self._initialized = False
        self._prompt: str = ""
        self._object_ids: list[int] = []

    def set_prompt(self, prompt: str) -> None:
        """Seed the tracker with a text prompt for future frames."""
        self._prompt = prompt

    def initialize(
        self,
        frame: NDArray[np.uint8],
        masks: list[NDArray[np.bool_]],
        object_ids: list[int],
    ) -> None:
        """Initialize tracking state from mask priors on the first frame."""
        if len(masks) != len(object_ids):
            raise ValueError("masks and object_ids must have the same length")
        self._loader.load()
        self._object_ids = list(object_ids)
        self._initialized = True

    def track(
        self,
        frame: NDArray[np.uint8],
    ) -> dict[int, TrackingMask]:
        """Track objects in a single frame and return masks keyed by object id."""
        if not self._initialized:
            raise RuntimeError("Tracker has not been initialized")
        masks = self._loader.track(frames=[frame], initial_prompt=self._prompt)
        return _key_by_object_id(masks, self._object_ids)

    def track_batch(
        self,
        frames: list[NDArray[np.uint8]],
    ) -> list[dict[int, TrackingMask]]:
        """Track objects across multiple frames."""
        if not self._initialized:
            raise RuntimeError("Tracker has not been initialized")
        masks = self._loader.track(frames=list(frames), initial_prompt=self._prompt)
        result: list[dict[int, TrackingMask]] = []
        for i, _ in enumerate(frames):
            per_frame = masks[i] if i < len(masks) else _empty_mask(i)
            result.append(_key_by_object_id([per_frame], self._object_ids))
        return result

    def reset(self) -> None:
        """Reset tracking state so a new video can be processed."""
        self._initialized = False
        self._prompt = ""
        self._object_ids = []

    def load(self) -> None:
        """Load the underlying model."""
        self._loader.load()

    def unload(self) -> None:
        """Release the underlying model."""
        self._loader.unload()
        self.reset()

    @property
    def is_loaded(self) -> bool:
        """Return True when the underlying model has been constructed."""
        return self._loader.is_loaded

    @property
    def model_id(self) -> str:
        """Return the underlying model identifier."""
        return self._loader.model_id

    @property
    def is_initialized(self) -> bool:
        """Return True once :meth:`initialize` has been called."""
        return self._initialized


def _key_by_object_id(
    masks: list[TrackingMask],
    object_ids: list[int],
) -> dict[int, TrackingMask]:
    """Key a sequence of masks by their object id, falling back to position."""
    out: dict[int, TrackingMask] = {}
    for i, mask in enumerate(masks):
        obj_id = mask.object_id
        if obj_id == 0 and i < len(object_ids):
            obj_id = object_ids[i]
        out[obj_id] = mask
    return out


def _empty_mask(index: int) -> TrackingMask:
    """Return a placeholder mask for frames the model did not return data for."""
    return TrackingMask(
        object_id=index,
        mask_rle={"size": [0, 0], "counts": ""},
        confidence=ConfidenceScore(0.0),
        is_occluded=True,
    )
