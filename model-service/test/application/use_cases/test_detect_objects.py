"""Tests for DetectObjectsUseCase."""

from __future__ import annotations

import asyncio
import threading

import numpy as np
import pytest

from src.application.dto.detection import DetectObjectsRequestDTO
from src.application.use_cases.detect_objects import (
    DetectionError,
    DetectObjectsExecutionInput,
    DetectObjectsFrameInput,
    DetectObjectsUseCase,
)
from src.domain.entities import Detection, TrackingMask
from src.domain.value_objects import ConfidenceScore, NormalizedBBox
from test.application.fakes import FakeDetectionModel, FakeTrackingModel


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


@pytest.mark.asyncio
async def test_detection_does_not_block_other_requests(monkeypatch: pytest.MonkeyPatch) -> None:
    loop = asyncio.get_running_loop()
    started = asyncio.Event()
    release = threading.Event()
    model = FakeDetectionModel()

    def blocking_load() -> None:
        loop.call_soon_threadsafe(started.set)
        assert release.wait(5), "The event loop could not service another request"

    monkeypatch.setattr(model, "load", blocking_load)
    task = asyncio.create_task(
        DetectObjectsUseCase(model).execute(
            DetectObjectsExecutionInput(
                request=_make_request(),
                frames=[DetectObjectsFrameInput(0, 0.0, _image())],
            )
        )
    )
    try:
        await asyncio.wait_for(started.wait(), 5)
    finally:
        release.set()
    await task


@pytest.mark.asyncio
async def test_detect_tracks_seed_objects_and_preserves_frame_metadata() -> None:
    detector = FakeDetectionModel(detections_per_image=[[_make_detection("cat")]])
    moved = NormalizedBBox(x=0.3, y=0.2, width=0.2, height=0.2)
    tracker = FakeTrackingModel(
        per_frame_masks=[
            {},
            {
                1: TrackingMask(1, {}, ConfidenceScore(0.8), bounding_box=moved),
                99: TrackingMask(99, {}, ConfidenceScore(0.9), bounding_box=moved),
            },
        ]
    )
    request = _make_request()
    request.enable_tracking = True
    response = await DetectObjectsUseCase(detector, tracker).execute(
        DetectObjectsExecutionInput(
            request=request,
            frames=[
                DetectObjectsFrameInput(4, 0.2, _image()),
                DetectObjectsFrameInput(8, 0.4, _image()),
            ],
        )
    )
    assert len(detector.detect_calls) == 1
    assert tracker.initialize_calls == [[1]]
    assert [frame.frame_number for frame in response.frames] == [4, 8]
    assert [frame.timestamp for frame in response.frames] == [0.2, 0.4]
    assert response.total_detections == 2
    assert [frame.detections[0].track_id for frame in response.frames] == ["1", "1"]
    assert response.frames[1].detections[0].label == "cat"
    assert response.frames[1].detections[0].bounding_box.x == 0.3
    assert not detector.is_loaded
    assert not tracker.is_loaded


@pytest.mark.asyncio
async def test_detect_does_not_report_empty_or_occluded_tracking_masks() -> None:
    detector = FakeDetectionModel(detections_per_image=[[_make_detection(), _make_detection()]])
    tracker = FakeTrackingModel(
        per_frame_masks=[
            {},
            {
                1: TrackingMask(1, {}, ConfidenceScore(0.8)),
                2: TrackingMask(
                    2,
                    {},
                    ConfidenceScore(0.8),
                    is_occluded=True,
                    bounding_box=_make_detection().bounding_box,
                ),
            },
        ]
    )
    request = _make_request()
    request.enable_tracking = True
    response = await DetectObjectsUseCase(detector, tracker).execute(
        DetectObjectsExecutionInput(
            request=request,
            frames=[
                DetectObjectsFrameInput(0, 0.0, _image()),
                DetectObjectsFrameInput(1, 0.1, _image()),
            ],
        )
    )
    assert response.frames[1].detections == []


@pytest.mark.asyncio
async def test_detect_tracking_releases_models_on_failure() -> None:
    detector = FakeDetectionModel(detections_per_image=[[_make_detection()]])
    tracker = FakeTrackingModel(raise_on_track=RuntimeError("tracking failed"))
    request = _make_request()
    request.enable_tracking = True
    with pytest.raises(RuntimeError, match="tracking failed"):
        await DetectObjectsUseCase(detector, tracker).execute(
            DetectObjectsExecutionInput(
                request=request,
                frames=[
                    DetectObjectsFrameInput(0, 0.0, _image()),
                    DetectObjectsFrameInput(1, 0.1, _image()),
                ],
            )
        )
    assert not detector.is_loaded
    assert not tracker.is_loaded


@pytest.mark.asyncio
async def test_detect_tracking_requires_a_configured_tracker() -> None:
    request = _make_request()
    request.enable_tracking = True
    with pytest.raises(DetectionError, match="no tracking model"):
        await DetectObjectsUseCase(FakeDetectionModel()).execute(
            DetectObjectsExecutionInput(
                request=request,
                frames=[DetectObjectsFrameInput(0, 0.0, _image())],
            )
        )


@pytest.mark.asyncio
async def test_detect_without_seeds_does_not_load_tracker() -> None:
    tracker = FakeTrackingModel()
    request = _make_request()
    request.enable_tracking = True
    response = await DetectObjectsUseCase(FakeDetectionModel(), tracker).execute(
        DetectObjectsExecutionInput(
            request=request,
            frames=[
                DetectObjectsFrameInput(0, 0.0, _image()),
                DetectObjectsFrameInput(1, 0.1, _image()),
            ],
        )
    )
    assert response.total_detections == 0
    assert len(response.frames) == 2
    assert tracker.initialize_calls == []
