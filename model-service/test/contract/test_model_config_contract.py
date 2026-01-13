"""Contract tests for model configuration endpoints.

These tests verify the API contract for model configuration endpoints
using fake model manager implementations.
"""

import pytest
from fastapi.testclient import TestClient

from test.fakes import FakeModelConfig, FakeModelManager, FakeModelManagerConfig


@pytest.fixture
def fake_manager() -> FakeModelManager:
    """Create a fake model manager with default tasks."""
    config = FakeModelManagerConfig(
        device="cuda",
        total_vram_gb=24.0,
        total_ram_gb=32.0,
    )
    manager = FakeModelManager(config)

    # Add default tasks
    manager.add_task(
        "video_summarization",
        "qwen-2-5-vl-7b",
        FakeModelConfig(
            model_id="Qwen/Qwen2.5-VL-7B-Instruct",
            framework="sglang",
            vram_gb=8.0,
            cpu_memory_gb=0,
            cpu_compatible=False,
        ),
    )
    manager.add_task(
        "object_detection",
        "yolo-world-v2",
        FakeModelConfig(
            model_id="yolov8l-worldv2.pt",
            framework="pytorch",
            vram_gb=2.0,
            cpu_memory_gb=2.0,
            cpu_compatible=True,
        ),
    )

    return manager


@pytest.fixture
def cpu_fake_manager() -> FakeModelManager:
    """Create a fake model manager in CPU-only mode."""
    config = FakeModelManagerConfig(
        device="cpu",
        total_vram_gb=0,
        total_ram_gb=16.0,
    )
    manager = FakeModelManager(config)

    # Add CPU-compatible tasks
    manager.add_task(
        "video_summarization",
        "moondream-2b",
        FakeModelConfig(
            model_id="vikhyat/moondream2",
            framework="transformers",
            vram_gb=0,
            cpu_memory_gb=4.0,
            cpu_compatible=True,
        ),
    )

    return manager


class TestModelConfigContract:
    """Contract tests for /api/models/config endpoint."""

    def test_validate_memory_returns_required_fields(
        self,
        fake_manager: FakeModelManager,
    ) -> None:
        """Validate memory returns all required fields."""
        result = fake_manager.validate_memory_budget()

        # Verify required fields
        assert "valid" in result
        assert "total_vram_gb" in result
        assert "total_required_gb" in result
        assert "threshold" in result
        assert "max_allowed_gb" in result
        assert "model_requirements" in result
        assert "cpu_only_mode" in result
        assert "device" in result

    def test_validate_memory_shows_gpu_mode(
        self,
        fake_manager: FakeModelManager,
    ) -> None:
        """GPU mode shows VRAM info."""
        result = fake_manager.validate_memory_budget()

        assert result["cpu_only_mode"] is False
        assert result["device"] == "cuda"
        assert result["total_vram_gb"] > 0

    def test_validate_memory_shows_cpu_mode(
        self,
        cpu_fake_manager: FakeModelManager,
    ) -> None:
        """CPU mode shows RAM info."""
        result = cpu_fake_manager.validate_memory_budget()

        assert result["cpu_only_mode"] is True
        assert result["device"] == "cpu"
        assert result["total_ram_gb"] is not None
        assert result["total_ram_gb"] > 0


class TestModelLoadingContract:
    """Contract tests for model loading operations."""

    @pytest.mark.asyncio
    async def test_load_model_returns_model_info(
        self,
        fake_manager: FakeModelManager,
    ) -> None:
        """Load model returns model information."""
        model = await fake_manager.load_model("video_summarization")

        assert model is not None
        assert model["task_type"] == "video_summarization"
        assert model["model_id"] == "Qwen/Qwen2.5-VL-7B-Instruct"
        assert model["framework"] == "sglang"

    @pytest.mark.asyncio
    async def test_load_model_invalid_task_raises_error(
        self,
        fake_manager: FakeModelManager,
    ) -> None:
        """Load model with invalid task raises ValueError."""
        with pytest.raises(ValueError, match="Invalid task type"):
            await fake_manager.load_model("invalid_task")

    @pytest.mark.asyncio
    async def test_load_model_tracks_memory_usage(
        self,
        fake_manager: FakeModelManager,
    ) -> None:
        """Load model tracks memory usage."""
        await fake_manager.load_model("video_summarization")

        assert "video_summarization" in fake_manager.model_memory_usage
        assert fake_manager.model_memory_usage["video_summarization"] > 0

    @pytest.mark.asyncio
    async def test_unload_model_clears_memory(
        self,
        fake_manager: FakeModelManager,
    ) -> None:
        """Unload model clears memory tracking."""
        await fake_manager.load_model("video_summarization")
        await fake_manager.unload_model("video_summarization")

        assert "video_summarization" not in fake_manager.loaded_models
        assert "video_summarization" not in fake_manager.model_memory_usage


class TestModelSelectionContract:
    """Contract tests for model selection operations."""

    @pytest.mark.asyncio
    async def test_select_model_changes_selection(
        self,
        fake_manager: FakeModelManager,
    ) -> None:
        """Select model changes the selected model."""
        # Add alternative model
        fake_manager.tasks["video_summarization"].options["alt-model"] = FakeModelConfig(
            model_id="alt-model-id",
            framework="pytorch",
        )

        await fake_manager.set_selected_model("video_summarization", "alt-model")

        assert fake_manager.tasks["video_summarization"].selected == "alt-model"

    @pytest.mark.asyncio
    async def test_select_model_invalid_name_raises_error(
        self,
        fake_manager: FakeModelManager,
    ) -> None:
        """Select invalid model name raises ValueError."""
        with pytest.raises(ValueError, match="Invalid model name"):
            await fake_manager.set_selected_model("video_summarization", "nonexistent")

    @pytest.mark.asyncio
    async def test_select_model_reloads_if_loaded(
        self,
        fake_manager: FakeModelManager,
    ) -> None:
        """Select model reloads if already loaded."""
        # Add alternative model
        fake_manager.tasks["video_summarization"].options["alt-model"] = FakeModelConfig(
            model_id="alt-model-id",
            framework="pytorch",
        )

        await fake_manager.load_model("video_summarization")
        await fake_manager.set_selected_model("video_summarization", "alt-model")

        # Verify operations
        ops = [op["operation"] for op in fake_manager.operation_history]
        assert ops == ["load_model", "unload_model", "load_model"]


class TestCPUModeContract:
    """Contract tests for CPU-only mode."""

    def test_cpu_mode_detected_correctly(
        self,
        cpu_fake_manager: FakeModelManager,
    ) -> None:
        """CPU mode is detected correctly."""
        assert cpu_fake_manager.cpu_only_mode is True
        assert cpu_fake_manager.device == "cpu"

    def test_cpu_mode_uses_ram_for_validation(
        self,
        cpu_fake_manager: FakeModelManager,
    ) -> None:
        """CPU mode uses RAM for memory validation."""
        result = cpu_fake_manager.validate_memory_budget()

        # Should report RAM, not VRAM
        assert result["total_ram_gb"] is not None
        assert result["total_vram_gb"] == 0

    @pytest.mark.asyncio
    async def test_cpu_mode_loads_cpu_compatible_models(
        self,
        cpu_fake_manager: FakeModelManager,
    ) -> None:
        """CPU mode loads CPU-compatible models."""
        model = await cpu_fake_manager.load_model("video_summarization")

        assert model["model_id"] == "vikhyat/moondream2"
        config = cpu_fake_manager.tasks["video_summarization"].get_selected_config()
        assert config.cpu_compatible is True
