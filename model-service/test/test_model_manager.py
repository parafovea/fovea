"""
Tests for ModelManager class.

This module contains tests for model loading, unloading, memory management,
and configuration validation.
"""

import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest
import yaml

from src.model_manager import (
    InferenceConfig,
    ModelConfig,
    ModelManager,
    TaskConfig,
)


@pytest.fixture
def sample_config():
    """Sample model configuration for testing."""
    return {
        "models": {
            "video_summarization": {
                "selected": "test-model-1",
                "options": {
                    "test-model-1": {
                        "model_id": "test/model-1",
                        "framework": "sglang",
                        "vram_gb": 10,
                        "quantization": "4bit",
                        "speed": "fast",
                        "description": "Test model 1",
                    },
                    "test-model-2": {
                        "model_id": "test/model-2",
                        "framework": "pytorch",
                        "vram_gb": 5,
                        "speed": "very_fast",
                        "description": "Test model 2",
                    },
                },
            },
            "object_detection": {
                "selected": "yolo-test",
                "options": {
                    "yolo-test": {
                        "model_id": "ultralytics/yolo-test",
                        "framework": "pytorch",
                        "vram_gb": 2,
                        "speed": "real_time",
                        "fps": 60,
                        "description": "Test YOLO model",
                    },
                },
            },
        },
        "inference": {
            "max_memory_per_model": "auto",
            "offload_threshold": 0.85,
            "warmup_on_startup": False,
            "default_batch_size": 1,
            "max_batch_size": 8,
        },
    }


@pytest.fixture
def config_file(sample_config):
    """Create temporary config file."""
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".yaml", delete=False
    ) as f:
        yaml.dump(sample_config, f)
        config_path = f.name

    yield config_path

    Path(config_path).unlink()


@pytest.fixture
def model_manager(config_file):
    """Create ModelManager instance with test configuration."""
    return ModelManager(config_file)


class TestModelConfig:
    """Tests for ModelConfig class."""

    def test_model_config_initialization(self):
        """Test ModelConfig initialization from dictionary."""
        config_dict = {
            "model_id": "test/model",
            "framework": "pytorch",
            "vram_gb": 8,
            "quantization": "4bit",
            "speed": "fast",
            "description": "Test model",
            "fps": 30,
        }
        config = ModelConfig(config_dict)

        assert config.model_id == "test/model"
        assert config.framework == "pytorch"
        assert config.vram_gb == 8
        assert config.quantization == "4bit"
        assert config.speed == "fast"
        assert config.description == "Test model"
        assert config.fps == 30

    def test_model_config_vram_bytes(self):
        """Test VRAM conversion from GB to bytes."""
        config = ModelConfig(
            {"model_id": "test", "framework": "pytorch", "vram_gb": 8}
        )
        expected_bytes = 8 * 1024 * 1024 * 1024
        assert config.vram_bytes == expected_bytes

    def test_model_config_optional_fields(self):
        """Test ModelConfig with optional fields."""
        config = ModelConfig({"model_id": "test", "framework": "pytorch"})

        assert config.vram_gb == 0
        assert config.quantization is None
        assert config.speed == "medium"
        assert config.description == ""
        assert config.fps is None


class TestTaskConfig:
    """Tests for TaskConfig class."""

    def test_task_config_initialization(self):
        """Test TaskConfig initialization from dictionary."""
        config_dict = {
            "selected": "model-a",
            "options": {
                "model-a": {
                    "model_id": "test/model-a",
                    "framework": "pytorch",
                    "vram_gb": 4,
                },
                "model-b": {
                    "model_id": "test/model-b",
                    "framework": "sglang",
                    "vram_gb": 8,
                },
            },
        }
        task_config = TaskConfig("test_task", config_dict)

        assert task_config.task_name == "test_task"
        assert task_config.selected == "model-a"
        assert len(task_config.options) == 2
        assert "model-a" in task_config.options
        assert "model-b" in task_config.options

    def test_get_selected_config(self):
        """Test getting selected model configuration."""
        config_dict = {
            "selected": "model-a",
            "options": {
                "model-a": {
                    "model_id": "test/model-a",
                    "framework": "pytorch",
                    "vram_gb": 4,
                },
            },
        }
        task_config = TaskConfig("test_task", config_dict)
        selected = task_config.get_selected_config()

        assert selected.model_id == "test/model-a"
        assert selected.framework == "pytorch"


class TestInferenceConfig:
    """Tests for InferenceConfig class."""

    def test_inference_config_initialization(self):
        """Test InferenceConfig initialization."""
        config_dict = {
            "max_memory_per_model": "auto",
            "offload_threshold": 0.85,
            "warmup_on_startup": True,
            "default_batch_size": 2,
            "max_batch_size": 16,
        }
        inference_config = InferenceConfig(config_dict)

        assert inference_config.max_memory_per_model == "auto"
        assert inference_config.offload_threshold == 0.85
        assert inference_config.warmup_on_startup is True
        assert inference_config.default_batch_size == 2
        assert inference_config.max_batch_size == 16

    def test_inference_config_defaults(self):
        """Test InferenceConfig default values."""
        inference_config = InferenceConfig({})

        assert inference_config.max_memory_per_model == "auto"
        assert inference_config.offload_threshold == 0.85
        assert inference_config.warmup_on_startup is False
        assert inference_config.default_batch_size == 1
        assert inference_config.max_batch_size == 8


class TestModelManager:
    """Tests for ModelManager class."""

    def test_model_manager_initialization(self, model_manager):
        """Test ModelManager initialization."""
        assert model_manager is not None
        assert len(model_manager.tasks) == 2
        assert "video_summarization" in model_manager.tasks
        assert "object_detection" in model_manager.tasks

    def test_load_config_file_not_found(self):
        """Test loading config from non-existent file."""
        with pytest.raises(FileNotFoundError):
            ModelManager("/nonexistent/config.yaml")

    def test_load_config_invalid_yaml(self):
        """Test loading invalid YAML configuration."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write("invalid: yaml: content: :")
            config_path = f.name

        try:
            with pytest.raises(yaml.YAMLError):
                ModelManager(config_path)
        finally:
            Path(config_path).unlink()

    @patch("torch.cuda.is_available")
    @patch("torch.cuda.current_device")
    @patch("torch.cuda.get_device_properties")
    @patch("torch.cuda.memory_allocated")
    def test_get_available_vram(
        self, mock_mem_allocated, mock_device_props, mock_current_device, mock_cuda_available, model_manager
    ):
        """Test getting available VRAM."""
        mock_cuda_available.return_value = True
        mock_current_device.return_value = 0
        mock_device_props.return_value.total_memory = 16 * 1024**3
        mock_mem_allocated.return_value = 4 * 1024**3

        available = model_manager.get_available_vram()
        expected = 12 * 1024**3

        assert available == expected

    @patch("torch.cuda.is_available")
    def test_get_available_vram_no_cuda(self, mock_cuda_available, model_manager):
        """Test getting available VRAM when CUDA is not available."""
        mock_cuda_available.return_value = False

        available = model_manager.get_available_vram()

        assert available == 0

    @patch("torch.cuda.is_available")
    @patch("torch.cuda.current_device")
    @patch("torch.cuda.get_device_properties")
    def test_get_total_vram(self, mock_device_props, mock_current_device, mock_cuda_available, model_manager):
        """Test getting total VRAM."""
        mock_cuda_available.return_value = True
        mock_current_device.return_value = 0
        mock_device_props.return_value.total_memory = 16 * 1024**3

        total = model_manager.get_total_vram()

        assert total == 16 * 1024**3

    @patch("torch.cuda.is_available")
    @patch("torch.cuda.current_device")
    @patch("torch.cuda.memory_allocated")
    @patch("torch.cuda.get_device_properties")
    def test_get_memory_usage_percentage(
        self, mock_device_props, mock_mem_allocated, mock_current_device, mock_cuda_available, model_manager
    ):
        """Test getting memory usage percentage."""
        mock_cuda_available.return_value = True
        mock_current_device.return_value = 0
        mock_device_props.return_value.total_memory = 16 * 1024**3
        mock_mem_allocated.return_value = 4 * 1024**3

        usage = model_manager.get_memory_usage_percentage()

        assert usage == 0.25

    def test_check_memory_available(self, model_manager):
        """Test checking memory availability."""
        with patch.object(
            model_manager, "get_available_vram", return_value=16 * 1024**3
        ):
            assert model_manager.check_memory_available(8 * 1024**3) is True
            assert model_manager.check_memory_available(20 * 1024**3) is False

    def test_get_lru_model_empty(self, model_manager):
        """Test getting LRU model when no models loaded."""
        lru = model_manager.get_lru_model()
        assert lru is None

    @pytest.mark.asyncio
    async def test_unload_model(self, model_manager):
        """Test unloading a model."""
        model_manager.loaded_models["test_task"] = {"model": "data"}
        model_manager.model_load_times["test_task"] = 123456
        model_manager.model_memory_usage["test_task"] = 1000

        with patch("torch.cuda.is_available", return_value=True), patch(
            "torch.cuda.empty_cache"
        ):
            await model_manager.unload_model("test_task")

        assert "test_task" not in model_manager.loaded_models
        assert "test_task" not in model_manager.model_load_times
        assert "test_task" not in model_manager.model_memory_usage

    @pytest.mark.asyncio
    async def test_unload_model_not_loaded(self, model_manager):
        """Test unloading a model that is not loaded."""
        await model_manager.unload_model("nonexistent_task")

    @pytest.mark.asyncio
    async def test_evict_lru_model(self, model_manager):
        """Test evicting LRU model."""
        model_manager.loaded_models["task1"] = {"model": "data1"}
        model_manager.loaded_models["task2"] = {"model": "data2"}
        model_manager.model_load_times["task1"] = 100
        model_manager.model_load_times["task2"] = 200
        model_manager.model_memory_usage["task1"] = 1000
        model_manager.model_memory_usage["task2"] = 2000

        with patch("torch.cuda.is_available", return_value=True), patch(
            "torch.cuda.empty_cache"
        ):
            evicted = await model_manager.evict_lru_model()

        assert evicted == "task1"
        assert "task1" not in model_manager.loaded_models
        assert "task2" in model_manager.loaded_models

    @pytest.mark.asyncio
    async def test_evict_lru_model_empty(self, model_manager):
        """Test evicting LRU model when no models loaded."""
        evicted = await model_manager.evict_lru_model()
        assert evicted is None

    @pytest.mark.asyncio
    async def test_load_model(self, model_manager):
        """Test loading a model."""
        with patch.object(
            model_manager, "check_memory_available", return_value=True
        ), patch("torch.cuda.is_available", return_value=True), patch(
            "torch.cuda.memory_allocated", side_effect=[0, 5 * 1024**3]
        ):
            model = await model_manager.load_model("video_summarization")

        assert model is not None
        assert "video_summarization" in model_manager.loaded_models
        assert model_manager.loaded_models["video_summarization"] == model

    @pytest.mark.asyncio
    async def test_load_model_already_loaded(self, model_manager):
        """Test loading a model that is already loaded."""
        existing_model = {"model": "existing"}
        model_manager.loaded_models["video_summarization"] = existing_model

        model = await model_manager.load_model("video_summarization")

        assert model == existing_model

    @pytest.mark.asyncio
    async def test_load_model_invalid_task(self, model_manager):
        """Test loading model with invalid task type."""
        with pytest.raises(ValueError, match="Invalid task type"):
            await model_manager.load_model("invalid_task")

    @pytest.mark.asyncio
    async def test_load_model_with_eviction(self, model_manager):
        """Test loading model when memory needs to be freed."""
        model_manager.loaded_models["other_task"] = {"model": "other"}
        model_manager.model_load_times["other_task"] = 100
        model_manager.model_memory_usage["other_task"] = 1000

        with patch.object(
            model_manager, "check_memory_available", side_effect=[False, True]
        ), patch.object(
            model_manager, "get_memory_usage_percentage", return_value=0.9
        ), patch.object(
            model_manager, "get_total_vram", return_value=32 * 1024**3
        ), patch("torch.cuda.is_available", return_value=True), patch(
            "torch.cuda.memory_allocated", side_effect=[0, 5 * 1024**3]
        ), patch(
            "torch.cuda.empty_cache"
        ):
            _model = await model_manager.load_model("video_summarization")

        assert "video_summarization" in model_manager.loaded_models
        assert "other_task" not in model_manager.loaded_models

    @pytest.mark.asyncio
    async def test_load_model_insufficient_memory(self, model_manager):
        """Test loading model with insufficient memory."""
        with (
            patch.object(model_manager, "check_memory_available", return_value=False),
            patch.object(model_manager, "evict_lru_model", return_value=None),
            pytest.raises(RuntimeError, match="Insufficient memory"),
        ):
            await model_manager.load_model("video_summarization")

    @pytest.mark.asyncio
    async def test_get_model(self, model_manager):
        """Test getting model (loads if needed)."""
        with patch.object(
            model_manager, "check_memory_available", return_value=True
        ), patch("torch.cuda.is_available", return_value=True), patch(
            "torch.cuda.memory_allocated", side_effect=[0, 5 * 1024**3]
        ):
            model = await model_manager.get_model("video_summarization")

        assert model is not None

    def test_get_loaded_models(self, model_manager):
        """Test getting information about loaded models."""
        model_manager.loaded_models["video_summarization"] = {"model": "data"}
        model_manager.model_load_times["video_summarization"] = 123456.789
        model_manager.model_memory_usage["video_summarization"] = 5 * 1024**3

        loaded = model_manager.get_loaded_models()

        assert "video_summarization" in loaded
        assert loaded["video_summarization"]["model_id"] == "test/model-1"
        assert loaded["video_summarization"]["memory_usage_gb"] == 5.0
        assert loaded["video_summarization"]["load_time"] == 123456.789

    def test_get_model_config(self, model_manager):
        """Test getting model configuration."""
        config = model_manager.get_model_config("video_summarization")

        assert config is not None
        assert config.task_name == "video_summarization"
        assert config.selected == "test-model-1"

    def test_get_model_config_invalid(self, model_manager):
        """Test getting model configuration for invalid task."""
        config = model_manager.get_model_config("invalid_task")

        assert config is None

    @pytest.mark.asyncio
    async def test_set_selected_model(self, model_manager):
        """Test changing selected model."""
        await model_manager.set_selected_model("video_summarization", "test-model-2")

        assert model_manager.tasks["video_summarization"].selected == "test-model-2"
        assert (
            model_manager.config["models"]["video_summarization"]["selected"]
            == "test-model-2"
        )

    @pytest.mark.asyncio
    async def test_set_selected_model_invalid_task(self, model_manager):
        """Test changing selected model with invalid task."""
        with pytest.raises(ValueError, match="Invalid task type"):
            await model_manager.set_selected_model("invalid_task", "some-model")

    @pytest.mark.asyncio
    async def test_set_selected_model_invalid_model(self, model_manager):
        """Test changing selected model with invalid model name."""
        with pytest.raises(ValueError, match="Invalid model name"):
            await model_manager.set_selected_model(
                "video_summarization", "nonexistent-model"
            )

    @pytest.mark.asyncio
    async def test_set_selected_model_with_reload(self, model_manager):
        """Test changing selected model when model is loaded."""
        model_manager.loaded_models["video_summarization"] = {"model": "old"}
        model_manager.model_load_times["video_summarization"] = 100
        model_manager.model_memory_usage["video_summarization"] = 1000

        with patch.object(
            model_manager, "check_memory_available", return_value=True
        ), patch("torch.cuda.is_available", return_value=True), patch(
            "torch.cuda.memory_allocated", side_effect=[0, 3 * 1024**3]
        ), patch(
            "torch.cuda.empty_cache"
        ):
            await model_manager.set_selected_model(
                "video_summarization", "test-model-2"
            )

        assert model_manager.tasks["video_summarization"].selected == "test-model-2"
        assert "video_summarization" in model_manager.loaded_models

    def test_validate_memory_budget(self, model_manager):
        """Test validating memory budget."""
        with patch.object(model_manager, "get_total_vram", return_value=32 * 1024**3):
            validation = model_manager.validate_memory_budget()

        assert validation["valid"] is True
        assert validation["total_vram_gb"] == 32
        assert validation["total_required_gb"] == 12
        assert validation["threshold"] == 0.85
        assert abs(validation["max_allowed_gb"] - 27.2) < 0.01
        assert len(validation["model_requirements"]) == 2

    def test_validate_memory_budget_insufficient(self, model_manager):
        """Test validating memory budget with insufficient memory."""
        with patch.object(model_manager, "get_total_vram", return_value=8 * 1024**3):
            validation = model_manager.validate_memory_budget()

        assert validation["valid"] is False
        assert validation["total_required_gb"] == 12
        assert abs(validation["max_allowed_gb"] - 6.8) < 0.01

    @pytest.mark.asyncio
    async def test_warmup_models_disabled(self, model_manager):
        """Test warmup when disabled in config."""
        await model_manager.warmup_models()

        assert len(model_manager.loaded_models) == 0

    @pytest.mark.asyncio
    async def test_warmup_models_enabled(self, model_manager):
        """Test warmup when enabled in config."""
        model_manager.inference_config.warmup_on_startup = True

        with patch.object(
            model_manager, "check_memory_available", return_value=True
        ), patch("torch.cuda.is_available", return_value=True), patch(
            "torch.cuda.memory_allocated", side_effect=[0, 5 * 1024**3, 0, 2 * 1024**3]
        ):
            await model_manager.warmup_models()

        assert len(model_manager.loaded_models) == 2

    @pytest.mark.asyncio
    async def test_shutdown(self, model_manager):
        """Test shutdown unloads all models."""
        model_manager.loaded_models["task1"] = {"model": "data1"}
        model_manager.loaded_models["task2"] = {"model": "data2"}
        model_manager.model_load_times["task1"] = 100
        model_manager.model_load_times["task2"] = 200
        model_manager.model_memory_usage["task1"] = 1000
        model_manager.model_memory_usage["task2"] = 2000

        with patch("torch.cuda.is_available", return_value=True), patch(
            "torch.cuda.empty_cache"
        ):
            await model_manager.shutdown()

        assert len(model_manager.loaded_models) == 0
