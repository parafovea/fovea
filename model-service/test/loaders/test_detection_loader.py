"""Tests for detection_loader module with multiple model architectures."""

from pathlib import Path
from unittest.mock import MagicMock, Mock, patch

import numpy as np
import pytest
import torch
from PIL import Image

from src.detection_loader import (
    BoundingBox,
    Detection,
    DetectionConfig,
    DetectionFramework,
    DetectionResult,
    Florence2Loader,
    GroundingDINOLoader,
    OWLv2Loader,
    YOLOWorldLoader,
    create_detection_loader,
)

pytestmark = pytest.mark.requires_models


@pytest.fixture
def sample_image() -> Image.Image:
    """Create a sample PIL image for testing."""
    return Image.fromarray(np.random.randint(0, 255, (640, 480, 3), dtype=np.uint8))


@pytest.fixture
def detection_config() -> DetectionConfig:
    """Create a sample detection configuration."""
    return DetectionConfig(
        model_id="ultralytics/yolo-world-v2-l",
        framework=DetectionFramework.PYTORCH,
        confidence_threshold=0.25,
        device="cpu",
        cache_dir=None,
    )


class TestBoundingBox:
    """Tests for BoundingBox dataclass."""

    def test_bounding_box_creation(self) -> None:
        """Test BoundingBox creation with normalized coordinates."""
        bbox = BoundingBox(x1=0.1, y1=0.2, x2=0.5, y2=0.7)

        assert bbox.x1 == 0.1
        assert bbox.y1 == 0.2
        assert bbox.x2 == 0.5
        assert bbox.y2 == 0.7

    def test_to_absolute_coordinates(self) -> None:
        """Test conversion from normalized to absolute coordinates."""
        bbox = BoundingBox(x1=0.1, y1=0.2, x2=0.5, y2=0.7)

        x1, y1, x2, y2 = bbox.to_absolute(width=1000, height=800)

        assert x1 == 100
        assert y1 == 160
        assert x2 == 500
        assert y2 == 560

    def test_to_absolute_edge_cases(self) -> None:
        """Test coordinate conversion with edge values."""
        bbox_zero = BoundingBox(x1=0.0, y1=0.0, x2=0.0, y2=0.0)
        x1, y1, x2, y2 = bbox_zero.to_absolute(width=800, height=600)
        assert (x1, y1, x2, y2) == (0, 0, 0, 0)

        bbox_full = BoundingBox(x1=0.0, y1=0.0, x2=1.0, y2=1.0)
        x1, y1, x2, y2 = bbox_full.to_absolute(width=800, height=600)
        assert (x1, y1, x2, y2) == (0, 0, 800, 600)


class TestDetection:
    """Tests for Detection dataclass."""

    def test_detection_creation(self) -> None:
        """Test Detection creation with all fields."""
        bbox = BoundingBox(x1=0.1, y1=0.2, x2=0.5, y2=0.7)
        detection = Detection(bbox=bbox, confidence=0.85, label="person")

        assert detection.bbox == bbox
        assert detection.confidence == 0.85
        assert detection.label == "person"


class TestDetectionResult:
    """Tests for DetectionResult dataclass."""

    def test_detection_result_creation(self) -> None:
        """Test DetectionResult creation with multiple detections."""
        bbox1 = BoundingBox(x1=0.1, y1=0.2, x2=0.3, y2=0.4)
        bbox2 = BoundingBox(x1=0.5, y1=0.6, x2=0.8, y2=0.9)

        detections = [
            Detection(bbox=bbox1, confidence=0.9, label="cat"),
            Detection(bbox=bbox2, confidence=0.7, label="dog"),
        ]

        result = DetectionResult(
            detections=detections,
            image_width=1920,
            image_height=1080,
            processing_time=0.15,
        )

        assert len(result.detections) == 2
        assert result.image_width == 1920
        assert result.image_height == 1080
        assert result.processing_time == 0.15


class TestYOLOWorldLoader:
    """Tests for YOLO-World v2.1 detection loader."""

    @patch("ultralytics.YOLO")
    def test_load_yolo_world_success(
        self, mock_yolo_class: Mock, detection_config: DetectionConfig
    ) -> None:
        """Test successful YOLO-World model loading."""
        mock_model = MagicMock()
        mock_yolo_class.return_value = mock_model

        loader = YOLOWorldLoader(detection_config)
        loader.load()

        mock_yolo_class.assert_called_once_with(detection_config.model_id)
        assert loader.model is not None

    @patch("ultralytics.YOLO")
    def test_load_yolo_world_failure(
        self, mock_yolo_class: Mock, detection_config: DetectionConfig
    ) -> None:
        """Test YOLO-World model loading failure."""
        mock_yolo_class.side_effect = RuntimeError("Model not found")

        loader = YOLOWorldLoader(detection_config)

        with pytest.raises(RuntimeError, match="Model loading failed"):
            loader.load()

    @patch("ultralytics.YOLO")
    def test_detect_yolo_world_success(
        self, mock_yolo_class: Mock, detection_config: DetectionConfig, sample_image: Image.Image
    ) -> None:
        """Test successful object detection with YOLO-World."""
        mock_model = MagicMock()
        mock_model.names = {0: "person", 1: "car"}

        mock_box = MagicMock()
        mock_box.xyxy = torch.tensor([[100.0, 150.0, 300.0, 400.0]])
        mock_box.conf = torch.tensor([0.85])
        mock_box.cls = torch.tensor([0])

        mock_result = MagicMock()
        mock_result.boxes = [mock_box]

        mock_model.return_value = [mock_result]
        mock_yolo_class.return_value = mock_model

        loader = YOLOWorldLoader(detection_config)
        loader.load()

        result = loader.detect(sample_image, "person. car.")

        assert isinstance(result, DetectionResult)
        assert len(result.detections) == 1
        assert result.detections[0].label == "person"
        assert result.detections[0].confidence == pytest.approx(0.85, rel=1e-5)
        assert result.image_width == sample_image.width
        assert result.image_height == sample_image.height

    def test_detect_without_loading(
        self, detection_config: DetectionConfig, sample_image: Image.Image
    ) -> None:
        """Test detection fails if model not loaded."""
        loader = YOLOWorldLoader(detection_config)

        with pytest.raises(RuntimeError, match="Model not loaded"):
            loader.detect(sample_image, "person")

    @patch("ultralytics.YOLO")
    def test_detect_filters_low_confidence(
        self, mock_yolo_class: Mock, sample_image: Image.Image
    ) -> None:
        """Test detection filters out low confidence predictions."""
        config = DetectionConfig(
            model_id="ultralytics/yolo-world-v2-l",
            framework=DetectionFramework.PYTORCH,
            confidence_threshold=0.7,
            device="cpu",
        )

        mock_model = MagicMock()
        mock_model.names = {0: "person"}

        mock_box = MagicMock()
        mock_box.xyxy = torch.tensor([[100.0, 150.0, 300.0, 400.0]])
        mock_box.conf = torch.tensor([0.5])
        mock_box.cls = torch.tensor([0])

        mock_result = MagicMock()
        mock_result.boxes = [mock_box]

        mock_model.return_value = [mock_result]
        mock_yolo_class.return_value = mock_model

        loader = YOLOWorldLoader(config)
        loader.load()

        result = loader.detect(sample_image, "person")

        assert len(result.detections) == 0


class TestGroundingDINOLoader:
    """Tests for Grounding DINO 1.5 detection loader."""

    @pytest.mark.skip(reason="groundingdino requires manual installation from source")
    def test_load_grounding_dino_success(self) -> None:
        """Test successful Grounding DINO model loading."""
        pass

    @pytest.mark.skip(reason="groundingdino requires manual installation from source")
    def test_load_grounding_dino_failure(self) -> None:
        """Test Grounding DINO model loading failure."""
        pass


class TestOWLv2Loader:
    """Tests for OWLv2 detection loader."""

    @patch("transformers.Owlv2Processor")
    @patch("transformers.Owlv2ForObjectDetection")
    def test_load_owlv2_success(
        self,
        mock_model_class: Mock,
        mock_processor_class: Mock,
        detection_config: DetectionConfig,
    ) -> None:
        """Test successful OWLv2 model loading."""
        mock_model = MagicMock()
        mock_processor = MagicMock()

        mock_model_class.from_pretrained.return_value = mock_model
        mock_processor_class.from_pretrained.return_value = mock_processor

        config = DetectionConfig(
            model_id="google/owlv2-large-patch14-ensemble",
            framework=DetectionFramework.TRANSFORMERS,
            confidence_threshold=0.25,
            device="cpu",
        )

        loader = OWLv2Loader(config)
        loader.load()

        assert loader.model is not None
        assert loader.processor is not None

    @patch("transformers.Owlv2Processor")
    @patch("transformers.Owlv2ForObjectDetection")
    def test_detect_owlv2_success(
        self,
        mock_model_class: Mock,
        mock_processor_class: Mock,
        sample_image: Image.Image,
    ) -> None:
        """Test successful object detection with OWLv2."""
        mock_model = MagicMock()
        mock_processor = MagicMock()

        mock_processor.return_value = {"pixel_values": torch.randn(1, 3, 224, 224)}
        mock_processor.post_process_object_detection.return_value = [
            {
                "boxes": torch.tensor([[100.0, 150.0, 300.0, 400.0]]),
                "scores": torch.tensor([0.92]),
                "labels": torch.tensor([0]),
            }
        ]

        mock_model_class.from_pretrained.return_value = mock_model
        mock_processor_class.from_pretrained.return_value = mock_processor

        config = DetectionConfig(
            model_id="google/owlv2-large-patch14-ensemble",
            framework=DetectionFramework.TRANSFORMERS,
            confidence_threshold=0.25,
            device="cpu",
        )

        loader = OWLv2Loader(config)
        loader.load()

        result = loader.detect(sample_image, "cat. dog. bird.")

        assert isinstance(result, DetectionResult)
        assert len(result.detections) == 1
        assert result.detections[0].confidence == pytest.approx(0.92, rel=1e-5)


class TestFlorence2Loader:
    """Tests for Florence-2 detection loader."""

    @patch("transformers.AutoProcessor")
    @patch("transformers.AutoModelForCausalLM")
    def test_load_florence2_success(
        self,
        mock_model_class: Mock,
        mock_processor_class: Mock,
        detection_config: DetectionConfig,
    ) -> None:
        """Test successful Florence-2 model loading."""
        mock_model = MagicMock()
        mock_processor = MagicMock()

        mock_model_class.from_pretrained.return_value = mock_model
        mock_processor_class.from_pretrained.return_value = mock_processor

        config = DetectionConfig(
            model_id="microsoft/Florence-2-large",
            framework=DetectionFramework.TRANSFORMERS,
            confidence_threshold=0.25,
            device="cpu",
        )

        loader = Florence2Loader(config)
        loader.load()

        assert loader.model is not None
        assert loader.processor is not None

    @patch("transformers.AutoProcessor")
    @patch("transformers.AutoModelForCausalLM")
    def test_detect_florence2_success(
        self,
        mock_model_class: Mock,
        mock_processor_class: Mock,
        sample_image: Image.Image,
    ) -> None:
        """Test successful object detection with Florence-2."""
        mock_model = MagicMock()
        mock_processor = MagicMock()

        mock_processor.return_value = {"pixel_values": torch.randn(1, 3, 224, 224)}
        mock_model.generate.return_value = torch.tensor([[1, 2, 3]])
        mock_processor.batch_decode.return_value = [
            '{"bboxes": [[50, 60, 200, 300]], "labels": ["person"]}'
        ]

        mock_model_class.from_pretrained.return_value = mock_model
        mock_processor_class.from_pretrained.return_value = mock_processor

        config = DetectionConfig(
            model_id="microsoft/Florence-2-large",
            framework=DetectionFramework.TRANSFORMERS,
            confidence_threshold=0.25,
            device="cpu",
        )

        loader = Florence2Loader(config)
        loader.load()

        result = loader.detect(sample_image, "person in the image")

        assert isinstance(result, DetectionResult)
        assert len(result.detections) == 1
        assert result.detections[0].label == "person"

    def test_parse_florence_output_valid_json(self) -> None:
        """Test parsing valid Florence-2 output."""
        config = DetectionConfig(
            model_id="microsoft/Florence-2-large",
            framework=DetectionFramework.TRANSFORMERS,
        )
        loader = Florence2Loader(config)

        result = '{"bboxes": [[100, 150, 300, 400], [50, 60, 200, 250]], "labels": ["cat", "dog"]}'
        detections = loader._parse_florence_output(result, width=640, height=480)

        assert len(detections) == 2
        assert detections[0].label == "cat"
        assert detections[1].label == "dog"

    def test_parse_florence_output_invalid_json(self) -> None:
        """Test parsing invalid Florence-2 output."""
        config = DetectionConfig(
            model_id="microsoft/Florence-2-large",
            framework=DetectionFramework.TRANSFORMERS,
        )
        loader = Florence2Loader(config)

        result = "invalid json output"
        detections = loader._parse_florence_output(result, width=640, height=480)

        assert len(detections) == 0


class TestCreateDetectionLoader:
    """Tests for detection loader factory function."""

    def test_create_yolo_world_loader(self, detection_config: DetectionConfig) -> None:
        """Test creating YOLO-World loader."""
        loader = create_detection_loader("yolo-world-v2", detection_config)
        assert isinstance(loader, YOLOWorldLoader)

    def test_create_grounding_dino_loader(self, detection_config: DetectionConfig) -> None:
        """Test creating Grounding DINO loader."""
        loader = create_detection_loader("grounding-dino-1-5", detection_config)
        assert isinstance(loader, GroundingDINOLoader)

    def test_create_owlv2_loader(self, detection_config: DetectionConfig) -> None:
        """Test creating OWLv2 loader."""
        loader = create_detection_loader("owlv2", detection_config)
        assert isinstance(loader, OWLv2Loader)

    def test_create_florence2_loader(self, detection_config: DetectionConfig) -> None:
        """Test creating Florence-2 loader."""
        loader = create_detection_loader("florence-2", detection_config)
        assert isinstance(loader, Florence2Loader)

    def test_create_loader_with_aliases(self, detection_config: DetectionConfig) -> None:
        """Test factory function with model name aliases."""
        loader1 = create_detection_loader("yoloworld", detection_config)
        assert isinstance(loader1, YOLOWorldLoader)

        loader2 = create_detection_loader("groundingdino", detection_config)
        assert isinstance(loader2, GroundingDINOLoader)

        loader3 = create_detection_loader("owl-v2", detection_config)
        assert isinstance(loader3, OWLv2Loader)

        loader4 = create_detection_loader("florence2", detection_config)
        assert isinstance(loader4, Florence2Loader)

    def test_create_loader_unknown_model(self, detection_config: DetectionConfig) -> None:
        """Test factory function with unknown model name."""
        with pytest.raises(ValueError, match="Unknown model name"):
            create_detection_loader("unknown-model", detection_config)


class TestDetectionModelUnload:
    """Tests for model unloading functionality."""

    @patch("torch.cuda.is_available")
    @patch("torch.cuda.empty_cache")
    @patch("ultralytics.YOLO")
    def test_unload_releases_memory(
        self,
        mock_yolo_class: Mock,
        mock_empty_cache: Mock,
        mock_cuda_available: Mock,
        detection_config: DetectionConfig,
    ) -> None:
        """Test model unload releases GPU memory."""
        mock_model = MagicMock()
        mock_yolo_class.return_value = mock_model
        mock_cuda_available.return_value = True

        loader = YOLOWorldLoader(detection_config)
        loader.load()
        loader.unload()

        assert loader.model is None
        mock_empty_cache.assert_called_once()


class TestDetectionConfigVariations:
    """Tests for different DetectionConfig variations."""

    def test_config_with_custom_threshold(self) -> None:
        """Test configuration with custom confidence threshold."""
        config = DetectionConfig(
            model_id="test/model",
            confidence_threshold=0.65,
        )

        assert config.confidence_threshold == 0.65

    def test_config_with_cache_dir(self) -> None:
        """Test configuration with custom cache directory."""
        cache_path = Path("/tmp/model_cache")
        config = DetectionConfig(
            model_id="test/model",
            cache_dir=cache_path,
        )

        assert config.cache_dir == cache_path

    def test_config_defaults(self) -> None:
        """Test configuration with default values."""
        config = DetectionConfig(model_id="test/model")

        assert config.framework == DetectionFramework.PYTORCH
        assert config.confidence_threshold == 0.25
        assert config.device == "cuda"
        assert config.cache_dir is None
