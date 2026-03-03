"""Tests for ONNX detection model loaders."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, Mock, patch

import numpy as np
import pytest
from PIL import Image

from src.infrastructure.adapters.outbound.models.detection.loader import (
    DetectionConfig,
    DetectionFramework,
    DetectionResult,
    create_detection_loader,
)
from src.infrastructure.adapters.outbound.models.onnx.base import ONNXConfig, ONNXModelLoader
from src.infrastructure.adapters.outbound.models.onnx.florence import Florence2ONNXLoader
from src.infrastructure.adapters.outbound.models.onnx.grounding_dino import GroundingDINOONNXLoader
from src.infrastructure.adapters.outbound.models.onnx.yolo_world import YOLOWorldONNXLoader

pytestmark = pytest.mark.requires_models


@pytest.fixture
def sample_image() -> Image.Image:
    """Create a sample 640x480 RGB PIL image for testing."""
    return Image.fromarray(np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8))


@pytest.fixture
def onnx_detection_config() -> DetectionConfig:
    """Create a detection configuration with ONNX framework."""
    return DetectionConfig(
        model_id="test-org/test-model",
        framework=DetectionFramework.ONNX,
        confidence_threshold=0.25,
        device="cpu",
        cache_dir=None,
    )


# ---------------------------------------------------------------------------
# ONNXConfig
# ---------------------------------------------------------------------------


class TestONNXConfig:
    """Tests for the ONNXConfig dataclass and its default values."""

    def test_creation_with_defaults(self) -> None:
        config = ONNXConfig(model_id="test-org/model")

        assert config.model_id == "test-org/model"
        assert config.num_threads == 4
        assert config.cache_dir is None
        assert config.graph_optimization_level == "ORT_ENABLE_ALL"

    def test_creation_with_custom_values(self) -> None:
        cache = Path("/tmp/onnx_cache")
        config = ONNXConfig(
            model_id="custom/model",
            num_threads=8,
            cache_dir=cache,
            graph_optimization_level="ORT_ENABLE_BASIC",
        )

        assert config.model_id == "custom/model"
        assert config.num_threads == 8
        assert config.cache_dir == cache
        assert config.graph_optimization_level == "ORT_ENABLE_BASIC"


# ---------------------------------------------------------------------------
# ONNXModelLoader (base)
# ---------------------------------------------------------------------------


class TestONNXModelLoader:
    """Tests for the ONNXModelLoader base class lifecycle helpers."""

    def test_is_loaded_initially_false(self) -> None:
        config = ONNXConfig(model_id="test/model")
        loader = ONNXModelLoader(config)

        assert loader.is_loaded is False

    def test_is_loaded_after_session_set(self) -> None:
        config = ONNXConfig(model_id="test/model")
        loader = ONNXModelLoader(config)
        loader._session = MagicMock()

        assert loader.is_loaded is True

    def test_unload_session_clears_session(self) -> None:
        config = ONNXConfig(model_id="test/model")
        loader = ONNXModelLoader(config)
        loader._session = MagicMock()

        loader._unload_session()

        assert loader._session is None
        assert loader.is_loaded is False


# ---------------------------------------------------------------------------
# YOLOWorldONNXLoader
# ---------------------------------------------------------------------------


class TestYOLOWorldONNXLoader:
    """Tests for YOLO-World ONNX model loading, detection, and unloading."""

    def test_init_creates_onnx_config_from_detection_config(
        self, onnx_detection_config: DetectionConfig
    ) -> None:
        loader = YOLOWorldONNXLoader(onnx_detection_config)

        assert loader.onnx_config.model_id == onnx_detection_config.model_id
        assert loader.config is onnx_detection_config

    def test_init_uses_explicit_onnx_config(self, onnx_detection_config: DetectionConfig) -> None:
        explicit = ONNXConfig(model_id="explicit/model", num_threads=2)
        loader = YOLOWorldONNXLoader(onnx_detection_config, onnx_config=explicit)

        assert loader.onnx_config is explicit
        assert loader.onnx_config.model_id == "explicit/model"

    @patch("huggingface_hub.hf_hub_download", return_value="/fake/model.onnx")
    def test_load_downloads_and_creates_session(
        self,
        _mock_download: Mock,
        onnx_detection_config: DetectionConfig,
    ) -> None:
        # Mock onnxruntime at sys.modules level since it's not installed locally
        mock_ort = MagicMock()
        mock_ort.GraphOptimizationLevel.ORT_ENABLE_ALL = 99
        with patch.dict("sys.modules", {"onnxruntime": mock_ort}):
            loader = YOLOWorldONNXLoader(onnx_detection_config)
            loader.load()

        assert loader.is_loaded

    @patch("huggingface_hub.hf_hub_download", side_effect=Exception("download failed"))
    def test_load_raises_runtime_error_on_failure(
        self,
        _mock_download: Mock,
        onnx_detection_config: DetectionConfig,
    ) -> None:
        loader = YOLOWorldONNXLoader(onnx_detection_config)

        with pytest.raises(RuntimeError, match="Model loading failed"):
            loader.load()

    def test_detect_raises_when_not_loaded(
        self,
        onnx_detection_config: DetectionConfig,
        sample_image: Image.Image,
    ) -> None:
        loader = YOLOWorldONNXLoader(onnx_detection_config)

        with pytest.raises(RuntimeError, match="Model not loaded"):
            loader.detect(sample_image, "person. car.")

    def test_detect_returns_detection_result(
        self,
        onnx_detection_config: DetectionConfig,
        sample_image: Image.Image,
    ) -> None:
        loader = YOLOWorldONNXLoader(onnx_detection_config)

        mock_session = MagicMock()
        mock_input = MagicMock()
        mock_input.name = "images"
        mock_session.get_inputs.return_value = [mock_input]

        # One detection: cx=320, cy=320, w=100, h=100, score=0.9, class0=0.9, class1=0.1
        pred = np.array([[320, 320, 100, 100, 0.9, 0.9, 0.1]], dtype=np.float32)
        mock_session.run.return_value = [pred[np.newaxis, :]]
        loader._session = mock_session

        result = loader.detect(sample_image, "person. car.")

        assert isinstance(result, DetectionResult)
        assert result.image_width == 640
        assert result.image_height == 480
        assert len(result.detections) == 1
        assert result.detections[0].label == "person"
        assert result.detections[0].confidence == pytest.approx(0.9)

    def test_detect_filters_low_confidence(
        self,
        sample_image: Image.Image,
    ) -> None:
        config = DetectionConfig(
            model_id="test/yolo",
            framework=DetectionFramework.ONNX,
            confidence_threshold=0.8,
            device="cpu",
        )
        loader = YOLOWorldONNXLoader(config)

        mock_session = MagicMock()
        mock_input = MagicMock()
        mock_input.name = "images"
        mock_session.get_inputs.return_value = [mock_input]

        # Detection with score 0.3 (below 0.8 threshold)
        pred = np.array([[320, 320, 100, 100, 0.3, 0.3]], dtype=np.float32)
        mock_session.run.return_value = [pred[np.newaxis, :]]
        loader._session = mock_session

        result = loader.detect(sample_image, "person")

        assert len(result.detections) == 0

    def test_unload_clears_session_and_model(
        self,
        onnx_detection_config: DetectionConfig,
    ) -> None:
        loader = YOLOWorldONNXLoader(onnx_detection_config)
        loader._session = MagicMock()
        loader.model = MagicMock()

        loader.unload()

        assert loader._session is None
        assert loader.model is None
        assert loader.is_loaded is False


# ---------------------------------------------------------------------------
# Florence2ONNXLoader
# ---------------------------------------------------------------------------


class TestFlorence2ONNXLoader:
    """Tests for Florence-2 ONNX model loading, detection, and unloading."""

    def test_init_creates_onnx_config_from_detection_config(
        self, onnx_detection_config: DetectionConfig
    ) -> None:
        loader = Florence2ONNXLoader(onnx_detection_config)

        assert loader.onnx_config.model_id == onnx_detection_config.model_id
        assert loader._processor is None

    def test_detect_raises_when_not_loaded(
        self,
        onnx_detection_config: DetectionConfig,
        sample_image: Image.Image,
    ) -> None:
        loader = Florence2ONNXLoader(onnx_detection_config)

        with pytest.raises(RuntimeError, match="Model not loaded"):
            loader.detect(sample_image, "person")

    def test_detect_with_combined_session(
        self,
        onnx_detection_config: DetectionConfig,
        sample_image: Image.Image,
    ) -> None:
        loader = Florence2ONNXLoader(onnx_detection_config)

        mock_processor = MagicMock()
        mock_processor.return_value = {
            "input_ids": np.array([[1, 2, 3]]),
            "pixel_values": np.random.rand(1, 3, 224, 224).astype(np.float32),
        }
        mock_processor.batch_decode.return_value = ["<OD> object detected"]
        mock_processor.post_process_generation.return_value = {
            "<OD>": {
                "bboxes": [[50.0, 60.0, 200.0, 300.0]],
                "labels": ["cat"],
            }
        }
        loader._processor = mock_processor

        mock_session = MagicMock()
        mock_session.run.return_value = [np.array([[10, 20, 30]])]
        loader._session = mock_session

        result = loader.detect(sample_image, "cat")

        assert isinstance(result, DetectionResult)
        assert result.image_width == 640
        assert result.image_height == 480
        assert len(result.detections) == 1
        assert result.detections[0].label == "cat"
        assert result.detections[0].confidence == pytest.approx(1.0)

    def test_detect_with_encoder_decoder_sessions(
        self,
        onnx_detection_config: DetectionConfig,
        sample_image: Image.Image,
    ) -> None:
        loader = Florence2ONNXLoader(onnx_detection_config)

        mock_processor = MagicMock()
        mock_processor.return_value = {
            "input_ids": np.array([[1, 2, 3]]),
            "pixel_values": np.random.rand(1, 3, 224, 224).astype(np.float32),
        }
        mock_processor.batch_decode.return_value = ["<OD> object detected"]
        mock_processor.post_process_generation.return_value = {
            "<OD>": {
                "bboxes": [[10.0, 20.0, 100.0, 200.0]],
                "labels": ["dog"],
            }
        }
        loader._processor = mock_processor

        mock_encoder = MagicMock()
        mock_encoder.run.return_value = [np.zeros((1, 10, 512))]
        mock_decoder = MagicMock()
        mock_decoder.run.return_value = [np.array([[5, 6, 7]])]

        loader._encoder_session = mock_encoder
        loader._decoder_session = mock_decoder

        result = loader.detect(sample_image, "")

        assert isinstance(result, DetectionResult)
        assert len(result.detections) == 1
        assert result.detections[0].label == "dog"

    def test_unload_clears_all_components(
        self,
        onnx_detection_config: DetectionConfig,
    ) -> None:
        loader = Florence2ONNXLoader(onnx_detection_config)
        loader._session = MagicMock()
        loader._encoder_session = MagicMock()
        loader._decoder_session = MagicMock()
        loader._processor = MagicMock()
        loader.model = MagicMock()

        loader.unload()

        assert loader._session is None
        assert loader._encoder_session is None
        assert loader._decoder_session is None
        assert loader._processor is None
        assert loader.model is None


# ---------------------------------------------------------------------------
# GroundingDINOONNXLoader
# ---------------------------------------------------------------------------


class TestGroundingDINOONNXLoader:
    """Tests for GroundingDINO ONNX model loading, detection, and unloading."""

    def test_init_creates_onnx_config_from_detection_config(
        self, onnx_detection_config: DetectionConfig
    ) -> None:
        loader = GroundingDINOONNXLoader(onnx_detection_config)

        assert loader.onnx_config.model_id == onnx_detection_config.model_id
        assert loader._tokenizer is None

    def test_detect_raises_when_not_loaded(
        self,
        onnx_detection_config: DetectionConfig,
        sample_image: Image.Image,
    ) -> None:
        loader = GroundingDINOONNXLoader(onnx_detection_config)

        with pytest.raises(RuntimeError, match="Model not loaded"):
            loader.detect(sample_image, "person")

    def test_detect_returns_detections(
        self,
        onnx_detection_config: DetectionConfig,
        sample_image: Image.Image,
    ) -> None:
        loader = GroundingDINOONNXLoader(onnx_detection_config)

        mock_tokenizer = MagicMock()
        mock_tokenizer.return_value = {
            "input_ids": np.array([[1, 2, 3]]),
            "attention_mask": np.array([[1, 1, 1]]),
        }
        loader._tokenizer = mock_tokenizer

        mock_session = MagicMock()
        mock_input_pv = MagicMock()
        mock_input_pv.name = "pixel_values"
        mock_input_ids = MagicMock()
        mock_input_ids.name = "input_ids"
        mock_input_am = MagicMock()
        mock_input_am.name = "attention_mask"
        mock_session.get_inputs.return_value = [mock_input_pv, mock_input_ids, mock_input_am]

        # High logit (sigmoid(5.0) ~ 0.993) in cxcywh normalized format
        pred_logits = np.array([[[5.0]]], dtype=np.float32)
        pred_boxes = np.array([[[0.5, 0.5, 0.2, 0.2]]], dtype=np.float32)
        mock_session.run.return_value = [pred_logits, pred_boxes]
        loader._session = mock_session

        result = loader.detect(sample_image, "person")

        assert isinstance(result, DetectionResult)
        assert len(result.detections) == 1
        assert result.detections[0].label == "person"
        assert result.detections[0].confidence > 0.99

    def test_detect_filters_low_confidence(
        self,
        sample_image: Image.Image,
    ) -> None:
        config = DetectionConfig(
            model_id="test/grounding-dino",
            framework=DetectionFramework.ONNX,
            confidence_threshold=0.9,
            device="cpu",
        )
        loader = GroundingDINOONNXLoader(config)

        mock_tokenizer = MagicMock()
        mock_tokenizer.return_value = {
            "input_ids": np.array([[1]]),
            "attention_mask": np.array([[1]]),
        }
        loader._tokenizer = mock_tokenizer

        mock_session = MagicMock()
        mock_input_pv = MagicMock()
        mock_input_pv.name = "pixel_values"
        mock_input_ids = MagicMock()
        mock_input_ids.name = "input_ids"
        mock_input_am = MagicMock()
        mock_input_am.name = "attention_mask"
        mock_session.get_inputs.return_value = [mock_input_pv, mock_input_ids, mock_input_am]

        # Low logit (sigmoid(0.0) = 0.5, below 0.9 threshold)
        pred_logits = np.array([[[0.0]]], dtype=np.float32)
        pred_boxes = np.array([[[0.5, 0.5, 0.2, 0.2]]], dtype=np.float32)
        mock_session.run.return_value = [pred_logits, pred_boxes]
        loader._session = mock_session

        result = loader.detect(sample_image, "person")

        assert len(result.detections) == 0

    def test_unload_clears_session_and_tokenizer(
        self,
        onnx_detection_config: DetectionConfig,
    ) -> None:
        loader = GroundingDINOONNXLoader(onnx_detection_config)
        loader._session = MagicMock()
        loader._tokenizer = MagicMock()
        loader.model = MagicMock()

        loader.unload()

        assert loader._session is None
        assert loader._tokenizer is None
        assert loader.model is None
        assert loader.is_loaded is False


# ---------------------------------------------------------------------------
# create_detection_loader factory (ONNX dispatch)
# ---------------------------------------------------------------------------


class TestCreateDetectionLoaderONNX:
    """Tests for the create_detection_loader factory with ONNX framework."""

    def test_dispatches_yolo_world(self) -> None:
        config = DetectionConfig(
            model_id="test/yolo-world-v2",
            framework=DetectionFramework.ONNX,
        )
        loader = create_detection_loader("yolo-world-v2", config)
        assert isinstance(loader, YOLOWorldONNXLoader)

    def test_dispatches_florence(self) -> None:
        config = DetectionConfig(
            model_id="microsoft/florence-2-large",
            framework=DetectionFramework.ONNX,
        )
        loader = create_detection_loader("florence-2", config)
        assert isinstance(loader, Florence2ONNXLoader)

    def test_dispatches_grounding_dino(self) -> None:
        config = DetectionConfig(
            model_id="IDEA-Research/grounding-dino-tiny",
            framework=DetectionFramework.ONNX,
        )
        loader = create_detection_loader("grounding-dino", config)
        assert isinstance(loader, GroundingDINOONNXLoader)

    def test_raises_for_unknown_onnx_model(self) -> None:
        config = DetectionConfig(
            model_id="unknown/model",
            framework=DetectionFramework.ONNX,
        )
        with pytest.raises(ValueError, match="No ONNX loader available"):
            create_detection_loader("unknown", config)
