"""Regression coverage for tracked-mask geometry at the model boundary."""

from unittest.mock import Mock

import numpy as np

from src.infrastructure.adapters.outbound.models.tracking.loader import (
    TrackingFrame,
    TrackingMask,
    TrackingResult,
)
from src.infrastructure.adapters.outbound.tracking_adapter import TrackingLoaderAdapter


def test_tracking_adapter_projects_mask_extents_and_omits_empty_boxes() -> None:
    mask = np.zeros((10, 20), dtype=np.uint8)
    mask[2:6, 4:10] = 1
    loader = Mock()
    loader.track.return_value = TrackingResult(
        frames=[
            TrackingFrame(
                frame_idx=0,
                masks=[TrackingMask(mask, 0.9, 1), TrackingMask(np.zeros_like(mask), 0.8, 2)],
                occlusions={},
                processing_time=0.0,
            )
        ],
        video_width=20,
        video_height=10,
        total_processing_time=0.0,
        fps=0.0,
    )
    adapter = TrackingLoaderAdapter(loader, model_id="fixture")
    frame = np.zeros((10, 20, 3), dtype=np.uint8)
    adapter.initialize(frame, [mask.astype(bool)], [1])
    result = adapter.track_batch([frame])[0]
    box = result[1].bounding_box
    assert box is not None
    assert (box.x, box.y, box.width, box.height) == (0.2, 0.2, 0.3, 0.4)
    assert result[2].bounding_box is None
