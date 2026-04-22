"""Fake ITrackingModel for use case testing."""

from __future__ import annotations

from typing import TYPE_CHECKING

from src.application.ports.outbound.tracking_model import ITrackingModel

if TYPE_CHECKING:
    import numpy as np
    from numpy.typing import NDArray

    from src.domain.entities import TrackingMask


class FakeTrackingModel(ITrackingModel):
    """In-memory tracking model returning canned mask maps per frame."""

    def __init__(
        self,
        *,
        per_frame_masks: list[dict[int, TrackingMask]] | None = None,
        model_id: str = "fake-tracker",
        raise_on_track: Exception | None = None,
    ) -> None:
        self._per_frame_masks = per_frame_masks or []
        self._model_id = model_id
        self._raise_on_track = raise_on_track
        self._loaded = False
        self._initialized = False
        self._frame_index = 0
        self.initialize_calls: list[list[int]] = []

    def initialize(
        self,
        frame: NDArray[np.uint8],
        masks: list[NDArray[np.bool_]],
        object_ids: list[int],
    ) -> None:
        if len(masks) != len(object_ids):
            raise ValueError("masks and object_ids length mismatch")
        self._initialized = True
        self.initialize_calls.append(list(object_ids))

    def track(
        self,
        frame: NDArray[np.uint8],
    ) -> dict[int, TrackingMask]:
        if self._raise_on_track is not None:
            raise self._raise_on_track
        if not self._per_frame_masks:
            return {}
        idx = min(self._frame_index, len(self._per_frame_masks) - 1)
        self._frame_index += 1
        return dict(self._per_frame_masks[idx])

    def track_batch(
        self,
        frames: list[NDArray[np.uint8]],
    ) -> list[dict[int, TrackingMask]]:
        if self._raise_on_track is not None:
            raise self._raise_on_track
        if not self._per_frame_masks:
            return [{} for _ in frames]
        return [
            dict(self._per_frame_masks[min(i, len(self._per_frame_masks) - 1)])
            for i in range(len(frames))
        ]

    def reset(self) -> None:
        self._initialized = False
        self._frame_index = 0

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
    def is_initialized(self) -> bool:
        return self._initialized
