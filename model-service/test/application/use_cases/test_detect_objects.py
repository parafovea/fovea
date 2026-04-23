"""Tests for DetectObjectsUseCase."""

from __future__ import annotations

import numpy as np
import pytest

from src.application.dto.detection import DetectObjectsRequestDTO
from src.application.use_cases.detect_objects import (
    DetectObjectsExecutionInput,
    DetectObjectsFrameInput,
    DetectObjectsUseCase,
)
from src.domain.entities import Detection
from src.domain.value_objects import ConfidenceScore, NormalizedBBox
from test.application.fakes import FakeDetectionModel


def _image() -> np.ndarray:
    return np.zeros((16, 16, 3), dtype=np.uint8)


def _make_detection(label: str = "cat", conf: float = 0.9) -> Detection:
    return Detection(
        label=label,
        bounding_box=NormalizedBBox(x=0.1, y=0.1, width=0.2, height=0.2),
        confidence=ConfidenceScore(conf),
    )


def _make_request() -> DetectObjectsRequestDTO:
    return DetectObjectsRequestDTO(
        video_id="v1",
        query="cats",
        video_path="/tmp/v.mp4",
        frame_numbers=[0, 1],
        confidence_threshold=0.5,
        enable_tracking=False,
    )


@pytest.mark.asyncio
async def test_detect_happy_path() -> None:
    model = FakeDetectionModel(
        detections_per_image=[[_make_detection("cat")], [_make_detection("dog")]],
    )
    use_case = DetectObjectsUseCase(model)

    input = DetectObjectsExecutionInput(
        request=_make_request(),
        frames=[
            DetectObjectsFrameInput(frame_number=0, timestamp=0.0, image=_image()),
            DetectObjectsFrameInput(frame_number=1, timestamp=0.5, image=_image()),
        ],
    )
    response = await use_case.execute(input)

    assert response.video_id == "v1"
    assert response.query == "cats"
    assert len(response.frames) == 2
    assert response.total_detections == 2
    assert response.frames[0].detections[0].label == "cat"
    assert response.frames[1].detections[0].label == "dog"


@pytest.mark.asyncio
async def test_detect_empty_frames_returns_empty_response() -> None:
    model = FakeDetectionModel()
    use_case = DetectObjectsUseCase(model)

    input = DetectObjectsExecutionInput(request=_make_request(), frames=[])
    response = await use_case.execute(input)

    assert response.frames == []
    assert response.total_detections == 0
    assert model.is_loaded is False


@pytest.mark.asyncio
async def test_detect_preserves_bounding_box_and_confidence() -> None:
    model = FakeDetectionModel(
        detections_per_image=[[_make_detection("cat", 0.77)]],
    )
    use_case = DetectObjectsUseCase(model)

    input = DetectObjectsExecutionInput(
        request=_make_request(),
        frames=[DetectObjectsFrameInput(frame_number=7, timestamp=2.0, image=_image())],
    )
    response = await use_case.execute(input)

    det = response.frames[0].detections[0]
    assert det.confidence == pytest.approx(0.77)
    assert det.bounding_box.x == pytest.approx(0.1)
    assert response.frames[0].frame_number == 7
    assert response.frames[0].timestamp == 2.0


@pytest.mark.asyncio
async def test_detect_unloads_model_after_inference() -> None:
    model = FakeDetectionModel(detections_per_image=[[]])
    use_case = DetectObjectsUseCase(model)

    input = DetectObjectsExecutionInput(
        request=_make_request(),
        frames=[DetectObjectsFrameInput(frame_number=0, timestamp=0.0, image=_image())],
    )
    await use_case.execute(input)
    assert not model.is_loaded


@pytest.mark.asyncio
async def test_detect_propagates_model_error() -> None:
    model = FakeDetectionModel(raise_on_detect=RuntimeError("model failed"))
    use_case = DetectObjectsUseCase(model)

    input = DetectObjectsExecutionInput(
        request=_make_request(),
        frames=[DetectObjectsFrameInput(frame_number=0, timestamp=0.0, image=_image())],
    )
    with pytest.raises(RuntimeError, match="model failed"):
        await use_case.execute(input)

    assert not model.is_loaded


@pytest.mark.asyncio
async def test_detect_filters_empty_detections() -> None:
    model = FakeDetectionModel(detections_per_image=[[], []])
    use_case = DetectObjectsUseCase(model)
    input = DetectObjectsExecutionInput(
        request=_make_request(),
        frames=[
            DetectObjectsFrameInput(frame_number=0, timestamp=0.0, image=_image()),
            DetectObjectsFrameInput(frame_number=1, timestamp=0.5, image=_image()),
        ],
    )
    response = await use_case.execute(input)
    assert response.total_detections == 0
    assert len(response.frames) == 2
