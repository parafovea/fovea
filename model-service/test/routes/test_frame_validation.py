"""Validate frame indices at the HTTP model boundary before decoding video."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from pydantic import ValidationError

from src.infrastructure.adapters.inbound.fastapi.dx_bodies import as_request
from src.infrastructure.adapters.inbound.fastapi.models import DetectionRequest, TrackingRequest

if TYPE_CHECKING:
    import didactic.api as dx


@pytest.mark.parametrize(
    ("model", "payload"),
    [
        (DetectionRequest, {"video_id": "video", "query": "person"}),
        (TrackingRequest, {"video_id": "video", "initial_masks": [], "object_ids": []}),
    ],
)
@pytest.mark.parametrize("frame", [-1, 0.5])
def test_invalid_frame_indices_are_rejected(
    model: type[dx.Model], payload: dict[str, object], frame: float
) -> None:
    """Negative and fractional indices must not reach OpenCV or inference."""
    with pytest.raises(ValidationError):
        as_request(model).model_validate({**payload, "frame_numbers": [frame]})
