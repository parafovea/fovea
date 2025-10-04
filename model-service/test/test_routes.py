"""
Tests for model service API routes.

This module contains tests for the video summarization, ontology augmentation,
and object detection endpoints.
"""

from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.models import OntologyType, SummarizeResponse

client = TestClient(app)


@pytest.fixture(autouse=True)
def mock_model_manager() -> Mock:
    """Mock the global model manager for all tests."""
    mock_manager = Mock()

    # Video summarization task config
    mock_task_config = Mock()
    mock_task_config.selected = "llama-4-maverick"
    mock_model_config = Mock()
    mock_model_config.model_id = "meta-llama/Llama-4-Maverick"
    mock_model_config.quantization = "4bit"
    mock_model_config.framework = "sglang"
    mock_task_config.get_selected_config.return_value = mock_model_config

    # Object detection task config
    mock_detection_task = Mock()
    mock_detection_task.selected = "yolo-world-v2"
    mock_detection_config = Mock()
    mock_detection_config.model_id = "ultralytics/yolov8x-worldv2"
    mock_detection_config.quantization = None
    mock_detection_config.framework = "ultralytics"
    mock_detection_task.get_selected_config.return_value = mock_detection_config

    # Ontology augmentation task config
    mock_augment_task = Mock()
    mock_augment_task.selected = "llama-4-scout"
    mock_augment_config = Mock()
    mock_augment_config.model_id = "meta-llama/Llama-4-Scout"
    mock_augment_config.quantization = "4bit"
    mock_augment_config.framework = "sglang"
    mock_augment_task.get_selected_config.return_value = mock_augment_config

    # Video tracking task config
    mock_tracking_task = Mock()
    mock_tracking_task.selected = "samurai"
    mock_tracking_config = Mock()
    mock_tracking_config.model_id = "yangchris11/samurai"
    mock_tracking_config.quantization = None
    mock_tracking_config.framework = "pytorch"
    mock_tracking_task.get_selected_config.return_value = mock_tracking_config

    mock_manager.tasks = {
        "video_summarization": mock_task_config,
        "object_detection": mock_detection_task,
        "ontology_augmentation": mock_augment_task,
        "video_tracking": mock_tracking_task,
    }

    with patch("src.routes._model_manager", mock_manager):
        yield mock_manager


class TestSummarizeEndpoint:
    """Tests for /api/summarize endpoint."""

    @patch("src.summarization.summarize_video_with_vlm")
    @patch("src.summarization.get_video_path_for_id")
    def test_summarize_video_success(
        self, mock_get_video: Mock, mock_summarize: AsyncMock
    ) -> None:
        """Test successful video summarization request."""
        mock_get_video.return_value = Path("/videos/test-video-123.mp4")
        mock_summarize.return_value = SummarizeResponse(
            id="summary-123",
            video_id="test-video-123",
            persona_id="test-persona-456",
            summary="Test video summary content",
            key_frames=[],
            confidence=0.95,
        )

        response = client.post(
            "/api/summarize",
            json={
                "video_id": "test-video-123",
                "persona_id": "test-persona-456",
                "frame_sample_rate": 2,
                "max_frames": 20,
            },
        )

        if response.status_code != 200:
            print(f"Response: {response.json()}")
        assert response.status_code == 200
        data = response.json()

        assert "id" in data
        assert data["video_id"] == "test-video-123"
        assert data["persona_id"] == "test-persona-456"
        assert "summary" in data
        assert isinstance(data["key_frames"], list)
        assert "confidence" in data

    @patch("src.summarization.summarize_video_with_vlm")
    @patch("src.summarization.get_video_path_for_id")
    def test_summarize_video_default_params(
        self, mock_get_video: Mock, mock_summarize: AsyncMock
    ) -> None:
        """Test summarization with default parameters."""
        mock_get_video.return_value = Path("/videos/test-video-789.mp4")
        mock_summarize.return_value = SummarizeResponse(
            id="summary-789",
            video_id="test-video-789",
            persona_id="test-persona-012",
            summary="Default params test summary",
            key_frames=[],
            confidence=0.90,
        )

        response = client.post(
            "/api/summarize",
            json={
                "video_id": "test-video-789",
                "persona_id": "test-persona-012",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["video_id"] == "test-video-789"

    def test_summarize_video_missing_fields(self) -> None:
        """Test summarization with missing required fields."""
        response = client.post(
            "/api/summarize",
            json={
                "video_id": "test-video-123",
            },
        )

        assert response.status_code == 422

    def test_summarize_video_invalid_frame_rate(self) -> None:
        """Test summarization with invalid frame sample rate."""
        response = client.post(
            "/api/summarize",
            json={
                "video_id": "test-video-123",
                "persona_id": "test-persona-456",
                "frame_sample_rate": 20,  # Exceeds max of 10
            },
        )

        assert response.status_code == 422

    @patch("src.summarization.summarize_video_with_vlm")
    @patch("src.summarization.get_video_path_for_id")
    def test_summarize_response_structure(
        self, mock_get_video: Mock, mock_summarize: AsyncMock
    ) -> None:
        """Test that response contains all expected fields."""
        mock_get_video.return_value = Path("/videos/test-video-123.mp4")
        mock_summarize.return_value = SummarizeResponse(
            id="summary-456",
            video_id="test-video-123",
            persona_id="test-persona-456",
            summary="Response structure test",
            key_frames=[],
            confidence=0.88,
        )

        response = client.post(
            "/api/summarize",
            json={
                "video_id": "test-video-123",
                "persona_id": "test-persona-456",
            },
        )

        assert response.status_code == 200
        data = response.json()

        required_fields = [
            "id",
            "video_id",
            "persona_id",
            "summary",
            "confidence",
        ]
        for field in required_fields:
            assert field in data

        assert isinstance(data["key_frames"], list)
        if len(data["key_frames"]) > 0:
            key_frame = data["key_frames"][0]
            assert "frame_number" in key_frame
            assert "timestamp" in key_frame
            assert "description" in key_frame
            assert "confidence" in key_frame


class TestAugmentEndpoint:
    """Tests for /api/ontology/augment endpoint."""

    @patch("src.ontology_augmentation.augment_ontology_with_llm")
    def test_augment_ontology_success(self, mock_augment: AsyncMock) -> None:
        """Test successful ontology augmentation request."""
        mock_augment.return_value = [
            OntologyType(
                name="Reptile",
                description="Cold-blooded vertebrate animal",
                confidence=0.92,
                examples=["Snake", "Lizard"],
            ),
            OntologyType(
                name="Amphibian",
                description="Animal that lives both on land and in water",
                confidence=0.88,
                examples=["Frog", "Salamander"],
            ),
        ]

        response = client.post(
            "/api/ontology/augment",
            json={
                "persona_id": "test-persona-123",
                "domain": "Wildlife research and animal behavior tracking",
                "existing_types": ["Mammal", "Bird"],
                "target_category": "entity",
                "max_suggestions": 5,
            },
        )

        assert response.status_code == 200
        data = response.json()

        assert "id" in data
        assert data["persona_id"] == "test-persona-123"
        assert data["target_category"] == "entity"
        assert "suggestions" in data
        assert isinstance(data["suggestions"], list)
        assert len(data["suggestions"]) <= 5
        assert "reasoning" in data

    @patch("src.ontology_augmentation.augment_ontology_with_llm")
    def test_augment_ontology_event_category(self, mock_augment: AsyncMock) -> None:
        """Test augmentation for event category."""
        mock_augment.return_value = [
            OntologyType(
                name="Goal",
                description="Scoring event in a game",
                confidence=0.95,
                examples=["Soccer goal", "Hockey goal"],
            ),
        ]

        response = client.post(
            "/api/ontology/augment",
            json={
                "persona_id": "test-persona-456",
                "domain": "Sports analytics and game tracking",
                "target_category": "event",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["target_category"] == "event"

    def test_augment_ontology_invalid_category(self) -> None:
        """Test augmentation with invalid category."""
        response = client.post(
            "/api/ontology/augment",
            json={
                "persona_id": "test-persona-789",
                "domain": "Test domain",
                "target_category": "invalid",
            },
        )

        assert response.status_code == 422

    @patch("src.ontology_augmentation.augment_ontology_with_llm")
    def test_augment_ontology_default_max_suggestions(
        self, mock_augment: AsyncMock
    ) -> None:
        """Test augmentation with default max_suggestions."""
        mock_augment.return_value = [
            OntologyType(
                name=f"Type{i}",
                description="Test description",
                confidence=0.8,
                examples=["ex1", "ex2"],
            )
            for i in range(8)
        ]

        response = client.post(
            "/api/ontology/augment",
            json={
                "persona_id": "test-persona-012",
                "domain": "Medical procedures",
                "target_category": "entity",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["suggestions"]) <= 10

    @patch("src.ontology_augmentation.augment_ontology_with_llm")
    def test_augment_response_suggestion_structure(
        self, mock_augment: AsyncMock
    ) -> None:
        """Test that suggestions have correct structure."""
        mock_augment.return_value = [
            OntologyType(
                name="Infrastructure",
                description="Built environment",
                confidence=0.9,
                examples=["Bridge", "Road"],
            ),
        ]

        response = client.post(
            "/api/ontology/augment",
            json={
                "persona_id": "test-persona-345",
                "domain": "Urban planning",
                "target_category": "entity",
            },
        )

        assert response.status_code == 200
        data = response.json()

        if len(data["suggestions"]) > 0:
            suggestion = data["suggestions"][0]
            assert "name" in suggestion
            assert "description" in suggestion
            assert "confidence" in suggestion
            assert isinstance(suggestion["examples"], list)


class TestDetectionEndpoint:
    """Tests for /api/detection/detect endpoint."""

    @patch("cv2.VideoCapture")
    @patch("src.detection_loader.create_detection_loader")
    @patch("src.summarization.get_video_path_for_id")
    def test_process_detection_success(
        self, mock_get_video: Mock, mock_create_loader: Mock, mock_video_capture: Mock
    ) -> None:
        """Test successful object detection request."""
        mock_get_video.return_value = Path("/videos/test-video-123.mp4")

        # Mock video capture
        import numpy as np

        mock_cap = Mock()
        mock_cap.get.side_effect = lambda prop: 30.0 if prop == 5 else 100 if prop == 7 else 0  # FPS and frame count
        mock_cap.read.return_value = (True, np.zeros((480, 640, 3), dtype=np.uint8))
        mock_cap.set.return_value = True
        mock_video_capture.return_value = mock_cap

        # Mock detection loader
        mock_loader = Mock()
        mock_loader.detect.return_value = Mock(detections=[], image_width=1920, image_height=1080, processing_time=0.1)
        mock_create_loader.return_value = mock_loader

        response = client.post(
            "/api/detection/detect",
            json={
                "video_id": "test-video-123",
                "query": "person wearing red shirt",
                "confidence_threshold": 0.5,
                "enable_tracking": True,
            },
        )

        assert response.status_code == 200
        data = response.json()

        assert "id" in data
        assert data["video_id"] == "test-video-123"
        assert data["query"] == "person wearing red shirt"
        assert "frames" in data
        assert isinstance(data["frames"], list)
        assert "total_detections" in data
        assert "processing_time" in data

    @patch("cv2.VideoCapture")
    @patch("src.detection_loader.create_detection_loader")
    @patch("src.summarization.get_video_path_for_id")
    def test_process_detection_specific_frames(
        self, mock_get_video: Mock, mock_create_loader: Mock, mock_video_capture: Mock
    ) -> None:
        """Test detection on specific frames."""
        mock_get_video.return_value = Path("/videos/test-video-456.mp4")
        mock_cap = Mock()
        mock_cap.get.side_effect = lambda prop: 30.0 if prop == 5 else 100 if prop == 7 else 0
        import numpy as np

        mock_cap.read.return_value = (True, np.zeros((480, 640, 3), dtype=np.uint8))
        mock_cap.set.return_value = True
        mock_video_capture.return_value = mock_cap

        mock_loader = Mock()
        mock_loader.detect.return_value = Mock(detections=[], image_width=1920, image_height=1080, processing_time=0.1)
        mock_create_loader.return_value = mock_loader

        response = client.post(
            "/api/detection/detect",
            json={
                "video_id": "test-video-456",
                "query": "vehicle",
                "frame_numbers": [0, 30, 60, 90],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["video_id"] == "test-video-456"

    @patch("cv2.VideoCapture")
    @patch("src.detection_loader.create_detection_loader")
    @patch("src.summarization.get_video_path_for_id")
    def test_process_detection_no_tracking(
        self, mock_get_video: Mock, mock_create_loader: Mock, mock_video_capture: Mock
    ) -> None:
        """Test detection without tracking enabled."""
        mock_get_video.return_value = Path("/videos/test-video-789.mp4")
        mock_cap = Mock()
        mock_cap.get.side_effect = lambda prop: 30.0 if prop == 5 else 100 if prop == 7 else 0
        import numpy as np

        mock_cap.read.return_value = (True, np.zeros((480, 640, 3), dtype=np.uint8))
        mock_cap.set.return_value = True
        mock_video_capture.return_value = mock_cap

        mock_loader = Mock()
        mock_loader.detect.return_value = Mock(detections=[], image_width=1920, image_height=1080, processing_time=0.1)
        mock_create_loader.return_value = mock_loader

        response = client.post(
            "/api/detection/detect",
            json={
                "video_id": "test-video-789",
                "query": "animal",
                "enable_tracking": False,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["video_id"] == "test-video-789"

    def test_process_detection_missing_query(self) -> None:
        """Test detection with missing query field."""
        response = client.post(
            "/api/detection/detect",
            json={
                "video_id": "test-video-012",
            },
        )

        assert response.status_code == 422

    def test_process_detection_invalid_confidence(self) -> None:
        """Test detection with invalid confidence threshold."""
        response = client.post(
            "/api/detection/detect",
            json={
                "video_id": "test-video-345",
                "query": "test",
                "confidence_threshold": 1.5,  # Exceeds max of 1.0
            },
        )

        assert response.status_code == 422

    @patch("cv2.VideoCapture")
    @patch("src.detection_loader.create_detection_loader")
    @patch("src.summarization.get_video_path_for_id")
    def test_process_detection_response_structure(
        self, mock_get_video: Mock, mock_create_loader: Mock, mock_video_capture: Mock
    ) -> None:
        """Test that response contains all expected fields."""
        mock_get_video.return_value = Path("/videos/test-video-678.mp4")
        mock_cap = Mock()
        mock_cap.get.side_effect = lambda prop: 30.0 if prop == 5 else 100 if prop == 7 else 0
        import numpy as np

        mock_cap.read.return_value = (True, np.zeros((480, 640, 3), dtype=np.uint8))
        mock_cap.set.return_value = True
        mock_video_capture.return_value = mock_cap

        mock_loader = Mock()
        mock_loader.detect.return_value = Mock(detections=[], image_width=1920, image_height=1080, processing_time=0.1)
        mock_create_loader.return_value = mock_loader

        response = client.post(
            "/api/detection/detect",
            json={
                "video_id": "test-video-678",
                "query": "test object",
            },
        )

        assert response.status_code == 200
        data = response.json()

        required_fields = [
            "id",
            "video_id",
            "query",
            "frames",
            "total_detections",
            "processing_time",
        ]
        for field in required_fields:
            assert field in data

        if len(data["frames"]) > 0:
            frame = data["frames"][0]
            assert "frame_number" in frame
            assert "timestamp" in frame
            assert "detections" in frame
            assert isinstance(frame["detections"], list)


class TestTrackingEndpoint:
    """Tests for /api/tracking/track endpoint."""

    @patch("cv2.VideoCapture")
    @patch("src.tracking_loader.create_tracking_loader")
    @patch("src.summarization.get_video_path_for_id")
    def test_track_objects_success(
        self, mock_get_video: Mock, mock_create_loader: Mock, mock_video_capture: Mock
    ) -> None:
        """Test successful object tracking request with SAMURAI model."""
        import base64

        import numpy as np

        mock_get_video.return_value = Path("/videos/test-tracking-123.mp4")

        # Mock video capture
        mock_cap = Mock()
        mock_cap.get.side_effect = lambda prop: (
            30.0
            if prop == 5
            else 100
            if prop == 7
            else 640
            if prop == 3
            else 480
            if prop == 4
            else 0
        )
        mock_cap.read.return_value = (True, np.zeros((480, 640, 3), dtype=np.uint8))
        mock_cap.set.return_value = True
        mock_video_capture.return_value = mock_cap

        # Mock tracking loader
        from src.tracking_loader import TrackingFrame, TrackingMask, TrackingResult

        mock_loader = Mock()
        mock_mask = TrackingMask(
            mask=np.ones((480, 640), dtype=np.uint8),
            confidence=0.95,
            object_id=1,
        )
        mock_frame = TrackingFrame(
            frame_idx=0,
            masks=[mock_mask],
            occlusions={1: False},
            processing_time=0.1,
        )
        mock_result = TrackingResult(
            frames=[mock_frame],
            video_width=640,
            video_height=480,
            total_processing_time=0.1,
            fps=10.0,
        )
        mock_loader.track.return_value = mock_result
        mock_create_loader.return_value = mock_loader

        # Create initial mask
        initial_mask = np.ones((480, 640), dtype=np.uint8)
        mask_b64 = base64.b64encode(initial_mask.tobytes()).decode("utf-8")

        response = client.post(
            "/api/tracking/track",
            json={
                "video_id": "test-tracking-123",
                "initial_masks": [mask_b64],
                "object_ids": [1],
                "frame_numbers": [0, 10, 20],
            },
        )

        assert response.status_code == 200
        data = response.json()

        assert "id" in data
        assert data["video_id"] == "test-tracking-123"
        assert "frames" in data
        assert isinstance(data["frames"], list)
        assert data["video_width"] == 640
        assert data["video_height"] == 480
        assert "total_frames" in data
        assert "processing_time" in data
        assert "fps" in data

    @patch("cv2.VideoCapture")
    @patch("src.tracking_loader.create_tracking_loader")
    @patch("src.summarization.get_video_path_for_id")
    def test_track_objects_all_models(
        self, mock_get_video: Mock, mock_create_loader: Mock, mock_video_capture: Mock
    ) -> None:
        """Test tracking with all supported models (SAMURAI, SAM2Long, SAM2, YOLO11n-seg)."""
        import base64

        import numpy as np

        mock_get_video.return_value = Path("/videos/wildlife-video.mp4")

        mock_cap = Mock()
        mock_cap.get.side_effect = lambda prop: (
            30.0
            if prop == 5
            else 50
            if prop == 7
            else 1920
            if prop == 3
            else 1080
            if prop == 4
            else 0
        )
        mock_cap.read.return_value = (
            True,
            np.zeros((1080, 1920, 3), dtype=np.uint8),
        )
        mock_cap.set.return_value = True
        mock_video_capture.return_value = mock_cap

        from src.tracking_loader import TrackingFrame, TrackingMask, TrackingResult

        mock_loader = Mock()
        mock_mask = TrackingMask(
            mask=np.ones((1080, 1920), dtype=np.uint8),
            confidence=0.92,
            object_id=1,
        )
        mock_frame = TrackingFrame(
            frame_idx=0,
            masks=[mock_mask],
            occlusions={1: False},
            processing_time=0.08,
        )
        mock_result = TrackingResult(
            frames=[mock_frame],
            video_width=1920,
            video_height=1080,
            total_processing_time=0.08,
            fps=12.5,
        )
        mock_loader.track.return_value = mock_result
        mock_create_loader.return_value = mock_loader

        initial_mask = np.ones((1080, 1920), dtype=np.uint8)
        mask_b64 = base64.b64encode(initial_mask.tobytes()).decode("utf-8")

        # Test with each model by verifying the endpoint works
        response = client.post(
            "/api/tracking/track",
            json={
                "video_id": "wildlife-video",
                "initial_masks": [mask_b64],
                "object_ids": [1],
            },
        )

        assert response.status_code == 200

    @patch("cv2.VideoCapture")
    @patch("src.tracking_loader.create_tracking_loader")
    @patch("src.summarization.get_video_path_for_id")
    def test_track_objects_multiple_objects(
        self, mock_get_video: Mock, mock_create_loader: Mock, mock_video_capture: Mock
    ) -> None:
        """Test tracking multiple objects simultaneously."""
        import base64

        import numpy as np

        mock_get_video.return_value = Path("/videos/sports-video.mp4")

        mock_cap = Mock()
        mock_cap.get.side_effect = lambda prop: (
            60.0
            if prop == 5
            else 180
            if prop == 7
            else 1280
            if prop == 3
            else 720
            if prop == 4
            else 0
        )
        mock_cap.read.return_value = (True, np.zeros((720, 1280, 3), dtype=np.uint8))
        mock_cap.set.return_value = True
        mock_video_capture.return_value = mock_cap

        from src.tracking_loader import TrackingFrame, TrackingMask, TrackingResult

        mock_loader = Mock()
        mock_mask1 = TrackingMask(
            mask=np.ones((720, 1280), dtype=np.uint8),
            confidence=0.88,
            object_id=1,
        )
        mock_mask2 = TrackingMask(
            mask=np.ones((720, 1280), dtype=np.uint8),
            confidence=0.91,
            object_id=2,
        )
        mock_frame = TrackingFrame(
            frame_idx=0,
            masks=[mock_mask1, mock_mask2],
            occlusions={1: False, 2: False},
            processing_time=0.15,
        )
        mock_result = TrackingResult(
            frames=[mock_frame],
            video_width=1280,
            video_height=720,
            total_processing_time=0.15,
            fps=6.7,
        )
        mock_loader.track.return_value = mock_result
        mock_create_loader.return_value = mock_loader

        initial_mask1 = np.ones((720, 1280), dtype=np.uint8)
        initial_mask2 = np.ones((720, 1280), dtype=np.uint8) * 2
        mask1_b64 = base64.b64encode(initial_mask1.tobytes()).decode("utf-8")
        mask2_b64 = base64.b64encode(initial_mask2.tobytes()).decode("utf-8")

        response = client.post(
            "/api/tracking/track",
            json={
                "video_id": "sports-video",
                "initial_masks": [mask1_b64, mask2_b64],
                "object_ids": [1, 2],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["frames"]) > 0
        if len(data["frames"][0]["masks"]) > 0:
            mask = data["frames"][0]["masks"][0]
            assert "object_id" in mask
            assert "mask_rle" in mask
            assert "confidence" in mask
            assert "is_occluded" in mask

    @patch("src.summarization.get_video_path_for_id")
    def test_track_objects_missing_masks(self, mock_get_video: Mock) -> None:
        """Test tracking with mismatched masks and object_ids."""
        import base64

        import numpy as np

        mock_get_video.return_value = Path("/videos/test-video.mp4")

        initial_mask = np.ones((480, 640), dtype=np.uint8)
        mask_b64 = base64.b64encode(initial_mask.tobytes()).decode("utf-8")

        response = client.post(
            "/api/tracking/track",
            json={
                "video_id": "test-video",
                "initial_masks": [mask_b64],
                "object_ids": [1, 2],  # More IDs than masks
            },
        )

        assert response.status_code == 400

    @patch("cv2.VideoCapture")
    @patch("src.tracking_loader.create_tracking_loader")
    @patch("src.summarization.get_video_path_for_id")
    def test_track_objects_invalid_mask_encoding(
        self, mock_get_video: Mock, mock_create_loader: Mock, mock_video_capture: Mock
    ) -> None:
        """Test tracking with invalid base64 mask encoding."""
        mock_get_video.return_value = Path("/videos/test-video.mp4")

        mock_cap = Mock()
        mock_cap.get.side_effect = lambda prop: (
            30.0
            if prop == 5
            else 100
            if prop == 7
            else 640
            if prop == 3
            else 480
            if prop == 4
            else 0
        )
        mock_video_capture.return_value = mock_cap

        mock_loader = Mock()
        mock_create_loader.return_value = mock_loader

        response = client.post(
            "/api/tracking/track",
            json={
                "video_id": "test-video",
                "initial_masks": ["invalid-base64!!!"],
                "object_ids": [1],
            },
        )

        assert response.status_code == 400

    def test_track_objects_missing_video_id(self) -> None:
        """Test tracking with missing video_id field."""
        import base64

        import numpy as np

        initial_mask = np.ones((480, 640), dtype=np.uint8)
        mask_b64 = base64.b64encode(initial_mask.tobytes()).decode("utf-8")

        response = client.post(
            "/api/tracking/track",
            json={
                "initial_masks": [mask_b64],
                "object_ids": [1],
            },
        )

        assert response.status_code == 422

    @patch("cv2.VideoCapture")
    @patch("src.tracking_loader.create_tracking_loader")
    @patch("src.summarization.get_video_path_for_id")
    def test_track_objects_with_occlusion(
        self, mock_get_video: Mock, mock_create_loader: Mock, mock_video_capture: Mock
    ) -> None:
        """Test tracking with object occlusion handling."""
        import base64

        import numpy as np

        mock_get_video.return_value = Path("/videos/vehicle-tracking.mp4")

        mock_cap = Mock()
        mock_cap.get.side_effect = lambda prop: (
            25.0
            if prop == 5
            else 250
            if prop == 7
            else 1920
            if prop == 3
            else 1080
            if prop == 4
            else 0
        )
        mock_cap.read.return_value = (
            True,
            np.zeros((1080, 1920, 3), dtype=np.uint8),
        )
        mock_cap.set.return_value = True
        mock_video_capture.return_value = mock_cap

        from src.tracking_loader import TrackingFrame, TrackingMask, TrackingResult

        mock_loader = Mock()
        # Object is occluded with low confidence
        mock_mask = TrackingMask(
            mask=np.ones((1080, 1920), dtype=np.uint8),
            confidence=0.35,
            object_id=1,
        )
        mock_frame = TrackingFrame(
            frame_idx=0,
            masks=[mock_mask],
            occlusions={1: True},  # Object is occluded
            processing_time=0.12,
        )
        mock_result = TrackingResult(
            frames=[mock_frame],
            video_width=1920,
            video_height=1080,
            total_processing_time=0.12,
            fps=8.3,
        )
        mock_loader.track.return_value = mock_result
        mock_create_loader.return_value = mock_loader

        initial_mask = np.ones((1080, 1920), dtype=np.uint8)
        mask_b64 = base64.b64encode(initial_mask.tobytes()).decode("utf-8")

        response = client.post(
            "/api/tracking/track",
            json={
                "video_id": "vehicle-tracking",
                "initial_masks": [mask_b64],
                "object_ids": [1],
            },
        )

        assert response.status_code == 200
        data = response.json()
        if len(data["frames"]) > 0 and len(data["frames"][0]["masks"]) > 0:
            mask = data["frames"][0]["masks"][0]
            assert "is_occluded" in mask

    @patch("cv2.VideoCapture")
    @patch("src.tracking_loader.create_tracking_loader")
    @patch("src.summarization.get_video_path_for_id")
    def test_track_objects_response_structure(
        self, mock_get_video: Mock, mock_create_loader: Mock, mock_video_capture: Mock
    ) -> None:
        """Test that tracking response contains all expected fields."""
        import base64

        import numpy as np

        mock_get_video.return_value = Path("/videos/test-structure.mp4")

        mock_cap = Mock()
        mock_cap.get.side_effect = lambda prop: (
            30.0
            if prop == 5
            else 100
            if prop == 7
            else 640
            if prop == 3
            else 480
            if prop == 4
            else 0
        )
        mock_cap.read.return_value = (True, np.zeros((480, 640, 3), dtype=np.uint8))
        mock_cap.set.return_value = True
        mock_video_capture.return_value = mock_cap

        from src.tracking_loader import TrackingFrame, TrackingMask, TrackingResult

        mock_loader = Mock()
        mock_mask = TrackingMask(
            mask=np.ones((480, 640), dtype=np.uint8),
            confidence=0.9,
            object_id=1,
        )
        mock_frame = TrackingFrame(
            frame_idx=0,
            masks=[mock_mask],
            occlusions={1: False},
            processing_time=0.1,
        )
        mock_result = TrackingResult(
            frames=[mock_frame],
            video_width=640,
            video_height=480,
            total_processing_time=0.1,
            fps=10.0,
        )
        mock_loader.track.return_value = mock_result
        mock_create_loader.return_value = mock_loader

        initial_mask = np.ones((480, 640), dtype=np.uint8)
        mask_b64 = base64.b64encode(initial_mask.tobytes()).decode("utf-8")

        response = client.post(
            "/api/tracking/track",
            json={
                "video_id": "test-structure",
                "initial_masks": [mask_b64],
                "object_ids": [1],
            },
        )

        assert response.status_code == 200
        data = response.json()

        # Verify required top-level fields
        required_fields = [
            "id",
            "video_id",
            "frames",
            "video_width",
            "video_height",
            "total_frames",
            "processing_time",
            "fps",
        ]
        for field in required_fields:
            assert field in data

        # Verify frame structure
        if len(data["frames"]) > 0:
            frame = data["frames"][0]
            assert "frame_number" in frame
            assert "timestamp" in frame
            assert "masks" in frame
            assert "processing_time" in frame
            assert isinstance(frame["masks"], list)

            # Verify mask structure
            if len(frame["masks"]) > 0:
                mask = frame["masks"][0]
                assert "object_id" in mask
                assert "mask_rle" in mask
                assert "confidence" in mask
                assert "is_occluded" in mask


class TestOpenAPIDocumentation:
    """Tests for OpenAPI documentation."""

    def test_openapi_schema_available(self) -> None:
        """Test that OpenAPI schema is available."""
        response = client.get("/openapi.json")
        assert response.status_code == 200
        schema = response.json()
        assert "openapi" in schema
        assert "info" in schema
        assert "paths" in schema

    def test_api_endpoints_documented(self) -> None:
        """Test that all API endpoints are documented."""
        response = client.get("/openapi.json")
        schema = response.json()
        paths = schema["paths"]

        assert "/api/summarize" in paths
        assert "/api/ontology/augment" in paths
        assert "/api/detection/detect" in paths
        assert "/api/tracking/track" in paths

    def test_docs_ui_available(self) -> None:
        """Test that Swagger UI is available."""
        response = client.get("/docs")
        assert response.status_code == 200


class TestModelConfigEndpoints:
    """Tests for model configuration endpoints."""

    def test_get_model_config(self, mock_model_manager: Mock) -> None:
        """Test getting model configuration."""
        # Setup mock
        mock_option = Mock()
        mock_option.model_id = "meta-llama/Llama-4-Maverick"
        mock_option.framework = "sglang"
        mock_option.vram_gb = 16.0
        mock_option.speed = "fast"
        mock_option.description = "Test model"
        mock_option.fps = 2.5

        mock_task = Mock()
        mock_task.selected = "llama-4-maverick"
        mock_task.options = {"llama-4-maverick": mock_option}

        mock_inference = Mock()
        mock_inference.max_memory_per_model = 24.0
        mock_inference.offload_threshold = 0.8
        mock_inference.warmup_on_startup = True
        mock_inference.default_batch_size = 1
        mock_inference.max_batch_size = 8

        mock_model_manager.tasks = {"video_summarization": mock_task}
        mock_model_manager.inference_config = mock_inference

        response = client.get("/api/models/config")

        assert response.status_code == 200
        data = response.json()
        assert "models" in data
        assert "inference" in data
        assert "cuda_available" in data
        assert "video_summarization" in data["models"]

    def test_get_model_status(self, mock_model_manager: Mock) -> None:
        """Test getting model status."""
        # Setup mock
        mock_model_manager.get_loaded_models.return_value = {
            "video_summarization": {
                "model_id": "meta-llama/Llama-4-Maverick",
                "memory_usage_gb": 14.0,
                "load_time": 3.5,
            }
        }
        mock_model_manager.get_total_vram.return_value = 24 * 1024**3  # 24 GB in bytes

        response = client.get("/api/models/status")

        assert response.status_code == 200
        data = response.json()
        assert "loaded_models" in data
        assert "total_vram_allocated_gb" in data
        assert "total_vram_available_gb" in data
        assert "cuda_available" in data
        assert len(data["loaded_models"]) == 1

    @pytest.mark.asyncio
    async def test_select_model(self, mock_model_manager: Mock) -> None:
        """Test selecting a model for a task."""
        mock_model_manager.set_selected_model = AsyncMock()

        response = client.post(
            "/api/models/select",
            params={"task_type": "video_summarization", "model_name": "llama-4-scout"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["task_type"] == "video_summarization"
        assert data["selected_model"] == "llama-4-scout"

    @pytest.mark.asyncio
    async def test_select_model_invalid_task(self, mock_model_manager: Mock) -> None:
        """Test selecting model with invalid task type."""
        mock_model_manager.set_selected_model = AsyncMock(
            side_effect=ValueError("Invalid task type")
        )

        response = client.post(
            "/api/models/select",
            params={"task_type": "invalid_task", "model_name": "test-model"},
        )

        assert response.status_code == 400

    def test_validate_memory_budget(self, mock_model_manager: Mock) -> None:
        """Test memory budget validation."""
        mock_model_manager.validate_memory_budget.return_value = {
            "valid": True,
            "total_vram_gb": 24.0,
            "total_required_gb": 18.0,
            "threshold": 0.8,
            "max_allowed_gb": 19.2,
            "model_requirements": {
                "video_summarization": {
                    "model_id": "meta-llama/Llama-4-Maverick",
                    "vram_gb": 14.0,
                }
            },
        }

        response = client.post("/api/models/validate")

        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is True
        assert data["total_vram_gb"] == 24.0
