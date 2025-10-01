"""Tests for tracking_loader module with multiple model architectures."""

from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, Mock, patch

import numpy as np
import pytest
import torch
from PIL import Image

from src.tracking_loader import (
    SAM2Loader,
    SAM2LongLoader,
    SAMURAILoader,
    TrackingConfig,
    TrackingFrame,
    TrackingFramework,
    TrackingMask,
    TrackingResult,
    YOLO11SegLoader,
    create_tracking_loader,
)


@pytest.fixture
def sample_frames() -> list[Image.Image]:
    """Create sample video frames for testing."""
    return [
        Image.fromarray(np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8))
        for _ in range(5)
    ]


@pytest.fixture
def wildlife_tracking_frames() -> list[Image.Image]:
    """Create sample frames for wildlife tracking scenario."""
    return [
        Image.fromarray(np.random.randint(0, 255, (720, 1280, 3), dtype=np.uint8))
        for _ in range(10)
    ]


@pytest.fixture
def sports_tracking_frames() -> list[Image.Image]:
    """Create sample frames for sports player tracking scenario."""
    return [
        Image.fromarray(np.random.randint(0, 255, (1080, 1920, 3), dtype=np.uint8))
        for _ in range(8)
    ]


@pytest.fixture
def vehicle_tracking_frames() -> list[Image.Image]:
    """Create sample frames for vehicle tracking scenario."""
    return [
        Image.fromarray(np.random.randint(0, 255, (600, 800, 3), dtype=np.uint8))
        for _ in range(6)
    ]


@pytest.fixture
def initial_mask() -> np.ndarray:
    """Create a sample initial segmentation mask."""
    mask = np.zeros((480, 640), dtype=np.uint8)
    mask[100:300, 200:400] = 1
    return mask


@pytest.fixture
def wildlife_initial_masks() -> list[np.ndarray]:
    """Create initial masks for wildlife tracking (two animals)."""
    mask1 = np.zeros((720, 1280), dtype=np.uint8)
    mask1[150:350, 300:500] = 1  # First animal

    mask2 = np.zeros((720, 1280), dtype=np.uint8)
    mask2[400:550, 700:900] = 1  # Second animal

    return [mask1, mask2]


@pytest.fixture
def sports_initial_masks() -> list[np.ndarray]:
    """Create initial masks for sports player tracking (three players)."""
    mask1 = np.zeros((1080, 1920), dtype=np.uint8)
    mask1[300:600, 400:600] = 1  # Player 1

    mask2 = np.zeros((1080, 1920), dtype=np.uint8)
    mask2[350:650, 900:1100] = 1  # Player 2

    mask3 = np.zeros((1080, 1920), dtype=np.uint8)
    mask3[400:700, 1400:1600] = 1  # Player 3

    return [mask1, mask2, mask3]


@pytest.fixture
def vehicle_initial_masks() -> list[np.ndarray]:
    """Create initial masks for vehicle tracking (two cars)."""
    mask1 = np.zeros((600, 800), dtype=np.uint8)
    mask1[200:350, 150:400] = 1  # Car 1

    mask2 = np.zeros((600, 800), dtype=np.uint8)
    mask2[250:400, 500:700] = 1  # Car 2

    return [mask1, mask2]


@pytest.fixture
def tracking_config() -> TrackingConfig:
    """Create a sample tracking configuration."""
    return TrackingConfig(
        model_id="samurai",
        framework=TrackingFramework.PYTORCH,
        device="cpu",
        cache_dir=None,
        checkpoint_path=None,
    )


class TestTrackingMask:
    """Tests for TrackingMask dataclass."""

    def test_tracking_mask_creation(self) -> None:
        """Test TrackingMask creation with all fields."""
        mask = np.ones((480, 640), dtype=np.uint8)
        tracking_mask = TrackingMask(mask=mask, confidence=0.92, object_id=1)

        assert tracking_mask.mask.shape == (480, 640)
        assert tracking_mask.confidence == 0.92
        assert tracking_mask.object_id == 1

    @patch("pycocotools.mask.encode")
    def test_mask_to_rle_conversion(self, mock_encode: Mock) -> None:
        """Test conversion of mask to RLE format."""
        mock_encode.return_value = {"size": [480, 640], "counts": b"test_rle"}

        mask = np.ones((480, 640), dtype=np.uint8)
        tracking_mask = TrackingMask(mask=mask, confidence=0.85, object_id=1)

        rle = tracking_mask.to_rle()

        assert "counts" in rle
        assert rle["counts"] == "test_rle"
        mock_encode.assert_called_once()


class TestTrackingFrame:
    """Tests for TrackingFrame dataclass."""

    def test_tracking_frame_creation(self) -> None:
        """Test TrackingFrame creation with multiple masks."""
        mask1 = np.ones((480, 640), dtype=np.uint8)
        mask2 = np.ones((480, 640), dtype=np.uint8)

        tracking_masks = [
            TrackingMask(mask=mask1, confidence=0.9, object_id=1),
            TrackingMask(mask=mask2, confidence=0.85, object_id=2),
        ]

        frame = TrackingFrame(
            frame_idx=5,
            masks=tracking_masks,
            occlusions={1: False, 2: True},
            processing_time=0.15,
        )

        assert frame.frame_idx == 5
        assert len(frame.masks) == 2
        assert frame.occlusions[1] is False
        assert frame.occlusions[2] is True
        assert frame.processing_time == 0.15


class TestTrackingResult:
    """Tests for TrackingResult dataclass."""

    def test_tracking_result_creation(self) -> None:
        """Test TrackingResult creation with video sequence data."""
        frames = [
            TrackingFrame(frame_idx=i, masks=[], occlusions={}, processing_time=0.1)
            for i in range(10)
        ]

        result = TrackingResult(
            frames=frames,
            video_width=1920,
            video_height=1080,
            total_processing_time=1.5,
            fps=6.67,
        )

        assert len(result.frames) == 10
        assert result.video_width == 1920
        assert result.video_height == 1080
        assert result.total_processing_time == 1.5
        assert result.fps == pytest.approx(6.67, rel=1e-2)


class TestSAMURAILoader:
    """Tests for SAMURAI motion-aware tracking loader."""

    @patch("sam2.build_sam.build_sam2_video_predictor")
    def test_load_samurai_success(
        self, mock_build_predictor: Mock, tracking_config: TrackingConfig
    ) -> None:
        """Test successful SAMURAI model loading."""
        mock_predictor = MagicMock()
        mock_predictor.model = MagicMock()
        mock_build_predictor.return_value = mock_predictor

        loader = SAMURAILoader(tracking_config)
        loader.load()

        assert loader.model is not None
        mock_build_predictor.assert_called_once()

    @patch("sam2.build_sam.build_sam2_video_predictor")
    def test_load_samurai_failure(
        self, mock_build_predictor: Mock, tracking_config: TrackingConfig
    ) -> None:
        """Test SAMURAI model loading failure."""
        mock_build_predictor.side_effect = RuntimeError("Model not found")

        loader = SAMURAILoader(tracking_config)

        with pytest.raises(RuntimeError, match="Model loading failed"):
            loader.load()

    @patch("sam2.build_sam.build_sam2_video_predictor")
    def test_track_wildlife_with_samurai(
        self,
        mock_build_predictor: Mock,
        wildlife_tracking_frames: list[Image.Image],
        wildlife_initial_masks: list[np.ndarray],
    ) -> None:
        """Test wildlife tracking with SAMURAI (whale pod scenario)."""
        mock_predictor = self._create_mock_predictor(
            num_frames=len(wildlife_tracking_frames), object_ids=[1, 2]
        )
        mock_build_predictor.return_value = mock_predictor

        config = TrackingConfig(
            model_id="samurai", framework=TrackingFramework.SAM2, device="cpu"
        )

        loader = SAMURAILoader(config)
        loader.load()

        result = loader.track(
            frames=wildlife_tracking_frames,
            initial_masks=wildlife_initial_masks,
            object_ids=[1, 2],
        )

        assert isinstance(result, TrackingResult)
        assert len(result.frames) == len(wildlife_tracking_frames)
        assert result.video_width == 1280
        assert result.video_height == 720
        assert result.fps > 0

    @patch("sam2.build_sam.build_sam2_video_predictor")
    def test_track_sports_players_with_samurai(
        self,
        mock_build_predictor: Mock,
        sports_tracking_frames: list[Image.Image],
        sports_initial_masks: list[np.ndarray],
    ) -> None:
        """Test basketball player tracking with SAMURAI."""
        mock_predictor = self._create_mock_predictor(
            num_frames=len(sports_tracking_frames), object_ids=[1, 2, 3]
        )
        mock_build_predictor.return_value = mock_predictor

        config = TrackingConfig(
            model_id="samurai", framework=TrackingFramework.SAM2, device="cpu"
        )

        loader = SAMURAILoader(config)
        loader.load()

        result = loader.track(
            frames=sports_tracking_frames,
            initial_masks=sports_initial_masks,
            object_ids=[1, 2, 3],
        )

        assert isinstance(result, TrackingResult)
        assert len(result.frames) == len(sports_tracking_frames)

    def test_track_without_loading(
        self,
        tracking_config: TrackingConfig,
        sample_frames: list[Image.Image],
        initial_mask: np.ndarray,
    ) -> None:
        """Test tracking fails if model not loaded."""
        loader = SAMURAILoader(tracking_config)

        with pytest.raises(RuntimeError, match="Model not loaded"):
            loader.track(sample_frames, [initial_mask], [1])

    def test_track_mismatched_masks_and_ids(
        self,
        tracking_config: TrackingConfig,
        sample_frames: list[Image.Image],
        initial_mask: np.ndarray,
    ) -> None:
        """Test tracking fails with mismatched initial_masks and object_ids."""
        loader = SAMURAILoader(tracking_config)
        loader.model = MagicMock()  # Mock loaded model

        with pytest.raises(ValueError, match="must match"):
            loader.track(sample_frames, [initial_mask], [1, 2])

    @patch("sam2.build_sam.build_sam2_video_predictor")
    def test_occlusion_detection(
        self,
        mock_build_predictor: Mock,
        sample_frames: list[Image.Image],
        initial_mask: np.ndarray,
    ) -> None:
        """Test SAMURAI detects occlusions based on mask confidence."""
        mock_predictor = self._create_mock_predictor_with_occlusion(
            num_frames=len(sample_frames), object_id=1
        )
        mock_build_predictor.return_value = mock_predictor

        config = TrackingConfig(
            model_id="samurai", framework=TrackingFramework.SAM2, device="cpu"
        )

        loader = SAMURAILoader(config)
        loader.load()

        result = loader.track(frames=sample_frames, initial_masks=[initial_mask], object_ids=[1])

        # Frame 2 should be marked as occluded (low confidence)
        assert result.frames[2].occlusions[1] is True
        # Other frames should not be occluded
        assert result.frames[0].occlusions[1] is False

    def _create_mock_predictor(
        self, num_frames: int, object_ids: list[int]
    ) -> MagicMock:
        """Create a mock SAM2 predictor with tracking results."""
        mock_predictor = MagicMock()
        mock_predictor.model = MagicMock()

        mock_inference_state = MagicMock()
        mock_predictor.init_state.return_value = mock_inference_state

        # Create mock video segments
        video_segments = {}
        for obj_id in object_ids:
            video_segments[obj_id] = {
                i: [torch.ones((480, 640)) * 0.9] for i in range(num_frames)
            }

        mock_predictor.propagate_in_video.return_value = video_segments

        return mock_predictor

    def _create_mock_predictor_with_occlusion(
        self, num_frames: int, object_id: int
    ) -> MagicMock:
        """Create a mock predictor with varying confidence (occlusion simulation)."""
        mock_predictor = MagicMock()
        mock_predictor.model = MagicMock()

        mock_inference_state = MagicMock()
        mock_predictor.init_state.return_value = mock_inference_state

        # Frame 2 has low confidence (occluded)
        video_segments = {
            object_id: {
                i: [torch.ones((480, 640)) * (0.3 if i == 2 else 0.9)]
                for i in range(num_frames)
            }
        }

        mock_predictor.propagate_in_video.return_value = video_segments

        return mock_predictor


class TestSAM2LongLoader:
    """Tests for SAM2Long long video tracking loader."""

    @patch("sam2.build_sam.build_sam2_video_predictor")
    def test_load_sam2long_success(
        self, mock_build_predictor: Mock, tracking_config: TrackingConfig
    ) -> None:
        """Test successful SAM2Long model loading."""
        mock_predictor = MagicMock()
        mock_predictor.model = MagicMock()
        mock_build_predictor.return_value = mock_predictor

        config = TrackingConfig(
            model_id="sam2long", framework=TrackingFramework.SAM2, device="cpu"
        )

        loader = SAM2LongLoader(config)
        loader.load()

        assert loader.model is not None

    @patch("sam2.build_sam.build_sam2_video_predictor")
    def test_track_long_wildlife_video(
        self, mock_build_predictor: Mock, wildlife_initial_masks: list[np.ndarray]
    ) -> None:
        """Test long video tracking for extended wildlife observation (90 frames)."""
        # Create 90 frames for long video
        long_frames = [
            Image.fromarray(np.random.randint(0, 255, (720, 1280, 3), dtype=np.uint8))
            for _ in range(90)
        ]

        mock_predictor = self._create_mock_predictor_long(
            num_frames=90, object_ids=[1, 2]
        )
        mock_build_predictor.return_value = mock_predictor

        config = TrackingConfig(
            model_id="sam2long", framework=TrackingFramework.SAM2, device="cpu"
        )

        loader = SAM2LongLoader(config)
        loader.load()

        result = loader.track(
            frames=long_frames, initial_masks=wildlife_initial_masks, object_ids=[1, 2]
        )

        assert isinstance(result, TrackingResult)
        assert len(result.frames) == 90
        # Verify chunked processing happened (3 chunks of 30 frames)
        assert mock_predictor.propagate_in_video.call_count == 3

    @patch("sam2.build_sam.build_sam2_video_predictor")
    def test_chunked_processing_reduces_error_accumulation(
        self, mock_build_predictor: Mock, vehicle_tracking_frames: list[Image.Image], vehicle_initial_masks: list[np.ndarray]
    ) -> None:
        """Test that SAM2Long processes in chunks to avoid error accumulation."""
        mock_predictor = self._create_mock_predictor_long(
            num_frames=len(vehicle_tracking_frames), object_ids=[1, 2]
        )
        mock_build_predictor.return_value = mock_predictor

        config = TrackingConfig(
            model_id="sam2long", framework=TrackingFramework.SAM2, device="cpu"
        )

        loader = SAM2LongLoader(config)
        loader.load()

        result = loader.track(
            frames=vehicle_tracking_frames,
            initial_masks=vehicle_initial_masks,
            object_ids=[1, 2],
        )

        assert len(result.frames) == len(vehicle_tracking_frames)

    def _create_mock_predictor_long(
        self, num_frames: int, object_ids: list[int]
    ) -> MagicMock:
        """Create a mock predictor for long video testing."""
        mock_predictor = MagicMock()
        mock_predictor.model = MagicMock()

        mock_inference_state = MagicMock()
        mock_predictor.init_state.return_value = mock_inference_state

        def propagate_side_effect(
            inference_state: Any, start_frame_idx: int = 0, max_frame_num_to_track: int | None = None
        ) -> dict[int, dict[int, list[torch.Tensor]]]:
            """Mock propagate_in_video with frame range support."""
            end_idx = (
                start_frame_idx + max_frame_num_to_track
                if max_frame_num_to_track
                else num_frames
            )
            video_segments = {}
            for obj_id in object_ids:
                video_segments[obj_id] = {
                    i: [torch.ones((720, 1280)) * 0.9]
                    for i in range(start_frame_idx, min(end_idx, num_frames))
                }
            return video_segments

        mock_predictor.propagate_in_video.side_effect = propagate_side_effect

        return mock_predictor


class TestSAM2Loader:
    """Tests for SAM2.1 baseline tracking loader."""

    @patch("sam2.build_sam.build_sam2_video_predictor")
    def test_load_sam2_success(
        self, mock_build_predictor: Mock, tracking_config: TrackingConfig
    ) -> None:
        """Test successful SAM2.1 model loading."""
        mock_predictor = MagicMock()
        mock_predictor.model = MagicMock()
        mock_build_predictor.return_value = mock_predictor

        config = TrackingConfig(
            model_id="sam2", framework=TrackingFramework.SAM2, device="cpu"
        )

        loader = SAM2Loader(config)
        loader.load()

        assert loader.model is not None

    @patch("sam2.build_sam.build_sam2_video_predictor")
    def test_track_vehicles_with_sam2(
        self,
        mock_build_predictor: Mock,
        vehicle_tracking_frames: list[Image.Image],
        vehicle_initial_masks: list[np.ndarray],
    ) -> None:
        """Test vehicle tracking with SAM2.1 baseline."""
        mock_predictor = self._create_mock_predictor(
            num_frames=len(vehicle_tracking_frames), object_ids=[1, 2]
        )
        mock_build_predictor.return_value = mock_predictor

        config = TrackingConfig(
            model_id="sam2", framework=TrackingFramework.SAM2, device="cpu"
        )

        loader = SAM2Loader(config)
        loader.load()

        result = loader.track(
            frames=vehicle_tracking_frames,
            initial_masks=vehicle_initial_masks,
            object_ids=[1, 2],
        )

        assert isinstance(result, TrackingResult)
        assert len(result.frames) == len(vehicle_tracking_frames)

    @patch("sam2.build_sam.build_sam2_video_predictor")
    def test_sam2_does_not_detect_occlusion(
        self,
        mock_build_predictor: Mock,
        sample_frames: list[Image.Image],
        initial_mask: np.ndarray,
    ) -> None:
        """Test that SAM2.1 baseline does not detect occlusions."""
        mock_predictor = self._create_mock_predictor(
            num_frames=len(sample_frames), object_ids=[1]
        )
        mock_build_predictor.return_value = mock_predictor

        config = TrackingConfig(
            model_id="sam2", framework=TrackingFramework.SAM2, device="cpu"
        )

        loader = SAM2Loader(config)
        loader.load()

        result = loader.track(frames=sample_frames, initial_masks=[initial_mask], object_ids=[1])

        # SAM2.1 baseline always marks occlusion as False
        for frame in result.frames:
            assert frame.occlusions[1] is False

    def _create_mock_predictor(
        self, num_frames: int, object_ids: list[int]
    ) -> MagicMock:
        """Create a mock SAM2 predictor."""
        mock_predictor = MagicMock()
        mock_predictor.model = MagicMock()

        mock_inference_state = MagicMock()
        mock_predictor.init_state.return_value = mock_inference_state

        video_segments = {}
        for obj_id in object_ids:
            video_segments[obj_id] = {
                i: [torch.ones((480, 640)) * 0.9] for i in range(num_frames)
            }

        mock_predictor.propagate_in_video.return_value = video_segments

        return mock_predictor


class TestYOLO11SegLoader:
    """Tests for YOLO11n-seg lightweight segmentation loader."""

    @patch("ultralytics.YOLO")
    def test_load_yolo11seg_success(
        self, mock_yolo_class: Mock, tracking_config: TrackingConfig
    ) -> None:
        """Test successful YOLO11n-seg model loading."""
        mock_model = MagicMock()
        mock_yolo_class.return_value = mock_model

        config = TrackingConfig(
            model_id="yolo11n-seg.pt", framework=TrackingFramework.ULTRALYTICS, device="cpu"
        )

        loader = YOLO11SegLoader(config)
        loader.load()

        assert loader.model is not None
        mock_yolo_class.assert_called_once_with(config.model_id)

    @patch("ultralytics.YOLO")
    def test_track_sports_players_with_yolo11seg(
        self,
        mock_yolo_class: Mock,
        sports_tracking_frames: list[Image.Image],
        sports_initial_masks: list[np.ndarray],
    ) -> None:
        """Test basketball player tracking with YOLO11n-seg."""
        mock_model = self._create_mock_yolo_model(
            num_frames=len(sports_tracking_frames), num_objects=3
        )
        mock_yolo_class.return_value = mock_model

        config = TrackingConfig(
            model_id="yolo11n-seg.pt", framework=TrackingFramework.ULTRALYTICS, device="cpu"
        )

        loader = YOLO11SegLoader(config)
        loader.load()

        result = loader.track(
            frames=sports_tracking_frames,
            initial_masks=sports_initial_masks,
            object_ids=[1, 2, 3],
        )

        assert isinstance(result, TrackingResult)
        assert len(result.frames) == len(sports_tracking_frames)

    @patch("ultralytics.YOLO")
    def test_iou_based_reidentification(
        self, mock_yolo_class: Mock, sample_frames: list[Image.Image], initial_mask: np.ndarray
    ) -> None:
        """Test YOLO11n-seg re-identifies objects using IoU matching."""
        mock_model = self._create_mock_yolo_model(num_frames=len(sample_frames), num_objects=1)
        mock_yolo_class.return_value = mock_model

        config = TrackingConfig(
            model_id="yolo11n-seg.pt", framework=TrackingFramework.ULTRALYTICS, device="cpu"
        )

        loader = YOLO11SegLoader(config)
        loader.load()

        result = loader.track(frames=sample_frames, initial_masks=[initial_mask], object_ids=[1])

        # Should successfully track object across frames using IoU
        assert all(len(frame.masks) > 0 for frame in result.frames)

    @patch("ultralytics.YOLO")
    def test_object_loss_detection(
        self, mock_yolo_class: Mock, sample_frames: list[Image.Image]
    ) -> None:
        """Test YOLO11n-seg detects when object is lost (low IoU)."""
        # Create initial mask
        initial_mask = np.zeros((480, 640), dtype=np.uint8)
        initial_mask[100:200, 100:200] = 1

        # Mock model returns masks with low overlap
        mock_model = self._create_mock_yolo_model_with_low_iou(num_frames=len(sample_frames))
        mock_yolo_class.return_value = mock_model

        config = TrackingConfig(
            model_id="yolo11n-seg.pt", framework=TrackingFramework.ULTRALYTICS, device="cpu"
        )

        loader = YOLO11SegLoader(config)
        loader.load()

        result = loader.track(frames=sample_frames, initial_masks=[initial_mask], object_ids=[1])

        # Object should be marked as occluded when IoU is too low
        occluded_frames = [f for f in result.frames if f.occlusions.get(1, False)]
        assert len(occluded_frames) > 0

    def test_compute_iou_perfect_overlap(self) -> None:
        """Test IoU computation with perfect overlap."""
        config = TrackingConfig(model_id="yolo11n-seg.pt")
        loader = YOLO11SegLoader(config)

        mask1 = np.ones((100, 100))
        mask2 = np.ones((100, 100))

        iou = loader._compute_iou(mask1, mask2)
        assert iou == pytest.approx(1.0)

    def test_compute_iou_no_overlap(self) -> None:
        """Test IoU computation with no overlap."""
        config = TrackingConfig(model_id="yolo11n-seg.pt")
        loader = YOLO11SegLoader(config)

        mask1 = np.zeros((100, 100))
        mask1[0:50, 0:50] = 1

        mask2 = np.zeros((100, 100))
        mask2[50:100, 50:100] = 1

        iou = loader._compute_iou(mask1, mask2)
        assert iou == pytest.approx(0.0)

    def test_compute_iou_partial_overlap(self) -> None:
        """Test IoU computation with partial overlap."""
        config = TrackingConfig(model_id="yolo11n-seg.pt")
        loader = YOLO11SegLoader(config)

        mask1 = np.zeros((100, 100))
        mask1[0:60, 0:60] = 1

        mask2 = np.zeros((100, 100))
        mask2[40:100, 40:100] = 1

        iou = loader._compute_iou(mask1, mask2)
        # Intersection: 20x20 = 400, Union: 60x60 + 60x60 - 400 = 6800
        expected_iou = 400 / 6800
        assert iou == pytest.approx(expected_iou, rel=1e-2)

    def test_compute_iou_empty_masks(self) -> None:
        """Test IoU computation with empty masks."""
        config = TrackingConfig(model_id="yolo11n-seg.pt")
        loader = YOLO11SegLoader(config)

        mask1 = np.zeros((100, 100))
        mask2 = np.zeros((100, 100))

        iou = loader._compute_iou(mask1, mask2)
        assert iou == 0.0

    def _create_mock_yolo_model(self, num_frames: int, num_objects: int) -> MagicMock:
        """Create a mock YOLO model with segmentation results."""
        mock_model = MagicMock()

        def mock_call(*args: Any, **kwargs: Any) -> list[MagicMock]:
            mock_result = MagicMock()
            mock_result.masks = MagicMock()

            # Create masks for each object that overlap significantly with initial_mask at [100:300, 200:400]
            masks = []
            for i in range(num_objects):
                mask = np.zeros((480, 640))
                # Create larger overlap to ensure IoU > 0.3 threshold
                # This creates ~60% overlap with initial_mask
                mask[120 + i * 50 : 280 + i * 50, 220 + i * 50 : 380 + i * 50] = 1
                masks.append(mask)

            mock_result.masks.data = torch.tensor(np.array(masks))

            return [mock_result]

        mock_model.side_effect = mock_call

        return mock_model

    def _create_mock_yolo_model_with_low_iou(self, num_frames: int) -> MagicMock:
        """Create a mock YOLO model with low IoU masks (simulating object loss)."""
        mock_model = MagicMock()

        def mock_call(*args: Any, **kwargs: Any) -> list[MagicMock]:
            mock_result = MagicMock()
            mock_result.masks = MagicMock()

            # Create mask in different location (low overlap)
            mask = np.zeros((480, 640))
            mask[300:400, 400:500] = 1

            mock_result.masks.data = torch.tensor(np.array([mask]))

            return [mock_result]

        mock_model.side_effect = mock_call

        return mock_model


class TestCreateTrackingLoader:
    """Tests for tracking loader factory function."""

    def test_create_samurai_loader(self, tracking_config: TrackingConfig) -> None:
        """Test creating SAMURAI loader."""
        loader = create_tracking_loader("samurai", tracking_config)
        assert isinstance(loader, SAMURAILoader)

    def test_create_sam2long_loader(self, tracking_config: TrackingConfig) -> None:
        """Test creating SAM2Long loader."""
        loader = create_tracking_loader("sam2long", tracking_config)
        assert isinstance(loader, SAM2LongLoader)

    def test_create_sam2long_loader_with_alias(
        self, tracking_config: TrackingConfig
    ) -> None:
        """Test creating SAM2Long loader with hyphenated alias."""
        loader = create_tracking_loader("sam2-long", tracking_config)
        assert isinstance(loader, SAM2LongLoader)

    def test_create_sam2_loader(self, tracking_config: TrackingConfig) -> None:
        """Test creating SAM2.1 loader."""
        loader = create_tracking_loader("sam2", tracking_config)
        assert isinstance(loader, SAM2Loader)

    def test_create_yolo11seg_loader(self, tracking_config: TrackingConfig) -> None:
        """Test creating YOLO11n-seg loader."""
        loader = create_tracking_loader("yolo11n-seg", tracking_config)
        assert isinstance(loader, YOLO11SegLoader)

    def test_create_yolo11seg_loader_with_alias(
        self, tracking_config: TrackingConfig
    ) -> None:
        """Test creating YOLO11n-seg loader with alternative naming."""
        loader = create_tracking_loader("yolo11seg", tracking_config)
        assert isinstance(loader, YOLO11SegLoader)

    def test_create_loader_unknown_model(self, tracking_config: TrackingConfig) -> None:
        """Test factory function with unknown model name."""
        with pytest.raises(ValueError, match="Unknown model name"):
            create_tracking_loader("unknown-tracker", tracking_config)


class TestTrackingModelUnload:
    """Tests for model unloading functionality."""

    @patch("sam2.build_sam.build_sam2_video_predictor")
    @patch("torch.cuda.empty_cache")
    @patch("torch.cuda.is_available")
    def test_unload_releases_memory(
        self,
        mock_cuda_available: Mock,
        mock_empty_cache: Mock,
        mock_build_predictor: Mock,
        tracking_config: TrackingConfig,
    ) -> None:
        """Test model unload releases GPU memory."""
        mock_predictor = MagicMock()
        mock_predictor.model = MagicMock()
        mock_build_predictor.return_value = mock_predictor
        mock_cuda_available.return_value = True

        loader = SAMURAILoader(tracking_config)
        loader.load()
        loader.unload()

        assert loader.model is None
        mock_empty_cache.assert_called_once()


class TestTrackingConfigVariations:
    """Tests for different TrackingConfig variations."""

    def test_config_with_checkpoint_path(self) -> None:
        """Test configuration with custom checkpoint path."""
        checkpoint_path = Path("/models/samurai_checkpoint.pth")
        config = TrackingConfig(model_id="samurai", checkpoint_path=checkpoint_path)

        assert config.checkpoint_path == checkpoint_path

    def test_config_with_cache_dir(self) -> None:
        """Test configuration with custom cache directory."""
        cache_path = Path("/tmp/model_cache")  # noqa: S108
        config = TrackingConfig(model_id="samurai", cache_dir=cache_path)

        assert config.cache_dir == cache_path

    def test_config_defaults(self) -> None:
        """Test configuration with default values."""
        config = TrackingConfig(model_id="samurai")

        assert config.framework == TrackingFramework.PYTORCH
        assert config.device == "cuda"
        assert config.cache_dir is None
        assert config.checkpoint_path is None
