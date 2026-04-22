"""Tests for model configuration domain entities."""

from __future__ import annotations

import pytest

from src.domain.entities.model_config import (
    DeviceInfo,
    InferenceConfig,
    ModelConfig,
    TaskConfig,
)


class TestModelConfig:
    def test_defaults(self) -> None:
        cfg = ModelConfig(model_id="m", framework="pytorch")
        assert cfg.vram_gb == 0.0
        assert cfg.speed == "medium"
        assert cfg.is_local is True
        assert cfg.is_external_api is False

    def test_is_external_api(self) -> None:
        cfg = ModelConfig(model_id="m", framework="external_api")
        assert cfg.is_external_api
        assert not cfg.is_local

    def test_memory_bytes(self) -> None:
        cfg = ModelConfig(model_id="m", framework="pytorch", vram_gb=2.0, cpu_memory_gb=4.0)
        assert cfg.vram_bytes == int(2.0 * 1024 * 1024 * 1024)
        assert cfg.cpu_memory_bytes == int(4.0 * 1024 * 1024 * 1024)

    def test_memory_for_device(self) -> None:
        cfg = ModelConfig(model_id="m", framework="pytorch", vram_gb=8.0, cpu_memory_gb=16.0)
        assert cfg.memory_for_device("cpu") == 16.0
        assert cfg.memory_for_device("cuda") == 8.0
        assert cfg.memory_for_device("mps") == 8.0

    def test_to_dict_and_from_dict_roundtrip(self) -> None:
        cfg = ModelConfig(
            model_id="m-id",
            framework="pytorch",
            vram_gb=2.5,
            cpu_compatible=True,
            quantization="4bit",
            fps=30,
        )
        restored = ModelConfig.from_dict(cfg.to_dict())
        assert restored == cfg

    def test_from_dict_with_minimal_input(self) -> None:
        cfg = ModelConfig.from_dict({"model_id": "m", "framework": "pytorch"})
        assert cfg.model_id == "m"
        assert cfg.speed == "medium"


class TestTaskConfig:
    def test_selected_config(self) -> None:
        a = ModelConfig(model_id="a", framework="pytorch")
        b = ModelConfig(model_id="b", framework="pytorch")
        task = TaskConfig(task_name="t", selected="a", options={"a": a, "b": b})
        assert task.selected_config is a

    def test_available_models(self) -> None:
        a = ModelConfig(model_id="a", framework="pytorch")
        b = ModelConfig(model_id="b", framework="pytorch")
        task = TaskConfig(task_name="t", selected="a", options={"a": a, "b": b})
        assert set(task.available_models) == {"a", "b"}

    def test_is_valid_selection(self) -> None:
        a = ModelConfig(model_id="a", framework="pytorch")
        task = TaskConfig(task_name="t", selected="a", options={"a": a})
        assert task.is_valid_selection("a")
        assert not task.is_valid_selection("missing")

    def test_cpu_compatible_options(self) -> None:
        a = ModelConfig(model_id="a", framework="pytorch", cpu_compatible=True)
        b = ModelConfig(model_id="b", framework="pytorch", cpu_compatible=False)
        task = TaskConfig(task_name="t", selected="a", options={"a": a, "b": b})
        compatible = task.get_cpu_compatible_options()
        assert set(compatible.keys()) == {"a"}

    def test_to_dict(self) -> None:
        a = ModelConfig(model_id="a", framework="pytorch")
        task = TaskConfig(task_name="t", selected="a", options={"a": a})
        d = task.to_dict()
        assert d["selected"] == "a"
        assert "a" in d["options"]


class TestInferenceConfig:
    def test_defaults_valid(self) -> None:
        cfg = InferenceConfig()
        assert cfg.max_memory_per_model == "auto"
        assert cfg.default_batch_size == 1

    def test_invalid_offload_threshold(self) -> None:
        with pytest.raises(ValueError, match="offload_threshold"):
            InferenceConfig(offload_threshold=1.5)

    def test_invalid_default_batch_size(self) -> None:
        with pytest.raises(ValueError, match="default_batch_size"):
            InferenceConfig(default_batch_size=0)

    def test_max_batch_less_than_default(self) -> None:
        with pytest.raises(ValueError, match="max_batch_size"):
            InferenceConfig(default_batch_size=8, max_batch_size=4)

    def test_from_dict(self) -> None:
        cfg = InferenceConfig.from_dict(
            {
                "max_memory_per_model": "16GB",
                "offload_threshold": 0.5,
                "warmup_on_startup": True,
                "default_batch_size": 2,
                "max_batch_size": 16,
            }
        )
        assert cfg.max_memory_per_model == "16GB"
        assert cfg.warmup_on_startup is True

    def test_from_dict_defaults(self) -> None:
        cfg = InferenceConfig.from_dict({})
        assert cfg.max_memory_per_model == "auto"


class TestDeviceInfo:
    def test_is_cpu_only(self) -> None:
        info = DeviceInfo(
            device="cpu",
            cuda_available=False,
            mps_available=False,
            total_vram_gb=0.0,
            available_vram_gb=0.0,
            total_ram_gb=16.0,
            available_ram_gb=8.0,
        )
        assert info.is_cpu_only
        assert not info.has_gpu

    def test_has_gpu_cuda(self) -> None:
        info = DeviceInfo(
            device="cuda",
            cuda_available=True,
            mps_available=False,
            total_vram_gb=24.0,
            available_vram_gb=20.0,
            total_ram_gb=64.0,
            available_ram_gb=32.0,
            gpu_name="RTX 4090",
            cuda_version="12.1",
        )
        assert info.has_gpu
        assert not info.is_cpu_only

    def test_has_gpu_mps(self) -> None:
        info = DeviceInfo(
            device="mps",
            cuda_available=False,
            mps_available=True,
            total_vram_gb=0.0,
            available_vram_gb=0.0,
            total_ram_gb=32.0,
            available_ram_gb=16.0,
        )
        assert info.has_gpu

    def test_to_dict(self) -> None:
        info = DeviceInfo(
            device="cuda",
            cuda_available=True,
            mps_available=False,
            total_vram_gb=8.0,
            available_vram_gb=4.0,
            total_ram_gb=32.0,
            available_ram_gb=16.0,
            gpu_name="GPU",
            cuda_version="12.0",
        )
        d = info.to_dict()
        assert d["device"] == "cuda"
        assert d["gpu_name"] == "GPU"
        assert d["cuda_version"] == "12.0"
