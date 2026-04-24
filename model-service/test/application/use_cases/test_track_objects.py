"""Tests for TrackObjectsUseCase."""

from __future__ import annotations

import numpy as np
import pytest

from src.application.dto.tracking import TrackObjectsRequestDTO
from src.application.use_cases.track_objects import (
    TrackingError,
    TrackObjectsExecutionInput,
    TrackObjectsUseCase,
)
from src.domain.entities import TrackingMask
from src.domain.value_objects import ConfidenceScore
from test.application.fakes import FakeTrackingModel


def _frame() -> np.ndarray:
    return np.zeros((16, 16, 3), dtype=np.uint8)


def _mask() -> np.ndarray:
    return np.zeros((16, 16), dtype=bool)


def _make_request(object_ids: list[int] | None = None) -> TrackObjectsRequestDTO:
    return TrackObjectsRequestDTO(
        video_id="v1",
        video_path="/tmp/v.mp4",
        initial_masks_b64=[],
        object_ids=object_ids if object_ids is not None else [1, 2],
        frame_numbers=[0, 1],
    )


@pytest.mark.asyncio
async def test_track_happy_path() -> None:
    masks_frame0 = {
        1: TrackingMask(object_id=1, mask_rle={"a": 1}, confidence=ConfidenceScore(0.9)),
        2: TrackingMask(object_id=2, mask_rle={"b": 1}, confidence=ConfidenceScore(0.8)),
    }
    masks_frame1 = {
        1: TrackingMask(object_id=1, mask_rle={"a": 2}, confidence=ConfidenceScore(0.85)),
    }
    model = FakeTrackingModel(per_frame_masks=[masks_frame0, masks_frame1])
    use_case = TrackObjectsUseCase(model)

    input = TrackObjectsExecutionInput(
        request=_make_request(),
        frames=[_frame(), _frame()],
        frame_numbers=[0, 1],
        timestamps=[0.0, 0.5],
        initial_masks=[_mask(), _mask()],
        video_width=320,
        video_height=240,
    )
    response = await use_case.execute(input)

    assert response.video_id == "v1"
    assert response.total_frames == 2
    assert response.video_width == 320
    assert response.video_height == 240
    assert len(response.frames[0].masks) == 2
    assert len(response.frames[1].masks) == 1


@pytest.mark.asyncio
async def test_track_mask_object_id_mismatch_raises() -> None:
    model = FakeTrackingModel()
    use_case = TrackObjectsUseCase(model)

    input = TrackObjectsExecutionInput(
        request=_make_request(object_ids=[1, 2]),
        frames=[_frame()],
        frame_numbers=[0],
        timestamps=[0.0],
        initial_masks=[_mask()],
    )
    with pytest.raises(TrackingError, match="must match"):
        await use_case.execute(input)


@pytest.mark.asyncio
async def test_track_empty_frames_raises() -> None:
    model = FakeTrackingModel()
    use_case = TrackObjectsUseCase(model)

    input = TrackObjectsExecutionInput(
        request=_make_request(object_ids=[1]),
        frames=[],
        frame_numbers=[],
        timestamps=[],
        initial_masks=[_mask()],
    )
    with pytest.raises(TrackingError, match="No valid frames"):
        await use_case.execute(input)


@pytest.mark.asyncio
async def test_track_propagates_model_error() -> None:
    model = FakeTrackingModel(raise_on_track=RuntimeError("boom"))
    use_case = TrackObjectsUseCase(model)
    input = TrackObjectsExecutionInput(
        request=_make_request(object_ids=[1]),
        frames=[_frame()],
        frame_numbers=[0],
        timestamps=[0.0],
        initial_masks=[_mask()],
    )
    with pytest.raises(RuntimeError, match="boom"):
        await use_case.execute(input)
    assert not model.is_loaded


@pytest.mark.asyncio
async def test_track_fills_missing_timestamp_and_frame_number() -> None:
    masks = {1: TrackingMask(object_id=1, mask_rle={}, confidence=ConfidenceScore(0.5))}
    model = FakeTrackingModel(per_frame_masks=[masks, masks])
    use_case = TrackObjectsUseCase(model)
    input = TrackObjectsExecutionInput(
        request=_make_request(object_ids=[1]),
        frames=[_frame(), _frame()],
        frame_numbers=[10],
        timestamps=[1.0],
        initial_masks=[_mask()],
    )
    response = await use_case.execute(input)
    assert response.frames[0].frame_number == 10
    assert response.frames[0].timestamp == 1.0
    assert response.frames[1].frame_number == 1
    assert response.frames[1].timestamp == 0.0


@pytest.mark.asyncio
async def test_track_computes_fps() -> None:
    masks = {1: TrackingMask(object_id=1, mask_rle={}, confidence=ConfidenceScore(0.5))}
    model = FakeTrackingModel(per_frame_masks=[masks])
    use_case = TrackObjectsUseCase(model)
    input = TrackObjectsExecutionInput(
        request=_make_request(object_ids=[1]),
        frames=[_frame()],
        frame_numbers=[0],
        timestamps=[0.0],
        initial_masks=[_mask()],
    )
    response = await use_case.execute(input)
    assert response.fps >= 0.0
    assert response.total_frames == 1
