"""Tests for YamlModelRepository.

Exercises the YAML-backed repository's read path, error handling, selection
state management, and reload behaviour against a ``tmp_path`` config file.
Each test writes its own minimal YAML rather than sharing a fixture so
failures point directly at the input that broke.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from src.infrastructure.adapters.outbound.persistence.yaml_model_repository import (
    YamlModelRepository,
)

if TYPE_CHECKING:
    from pathlib import Path


def _write_yaml(path: Path, content: str) -> None:
    """Write ``content`` to ``path`` as a UTF-8 YAML file."""
    path.write_text(content, encoding="utf-8")


def _minimal_yaml() -> str:
    """Return a YAML fixture with two tasks, one model each, and inference settings."""
    return """
models:
  video_summarization:
    selected: llama-scout
    options:
      llama-scout:
        model_id: meta-llama/Llama-4-Scout
        framework: transformers
        vram_gb: 24
        cpu_compatible: false
        speed: medium
        description: Vision-language model
  object_detection:
    selected: yolo-world
    options:
      yolo-world:
        model_id: ultralytics/yoloworld
        framework: ultralytics
        vram_gb: 4
        cpu_compatible: true
        speed: fast
        description: Open-vocabulary detector
inference:
  max_memory_per_model: auto
  offload_threshold: 0.85
  warmup_on_startup: false
  default_batch_size: 1
  max_batch_size: 8
"""


class TestConstruction:
    """Construction + reload behaviour."""

    def test_load_valid_yaml_populates_tasks(self, tmp_path: Path) -> None:
        cfg = tmp_path / "models.yaml"
        _write_yaml(cfg, _minimal_yaml())
        repo = YamlModelRepository(cfg)

        tasks = repo.get_all_tasks()
        assert set(tasks.keys()) == {"video_summarization", "object_detection"}

    def test_missing_file_raises_file_not_found(self, tmp_path: Path) -> None:
        with pytest.raises(FileNotFoundError, match="Config file not found"):
            YamlModelRepository(tmp_path / "does-not-exist.yaml")

    def test_non_mapping_root_raises_value_error(self, tmp_path: Path) -> None:
        cfg = tmp_path / "bad.yaml"
        _write_yaml(cfg, "- just\n- a\n- list\n")

        with pytest.raises(ValueError, match="expected mapping"):
            YamlModelRepository(cfg)

    def test_empty_file_raises_value_error(self, tmp_path: Path) -> None:
        cfg = tmp_path / "empty.yaml"
        _write_yaml(cfg, "")

        with pytest.raises(ValueError, match="expected mapping"):
            YamlModelRepository(cfg)

    def test_accepts_pathlib_path(self, tmp_path: Path) -> None:
        cfg = tmp_path / "models.yaml"
        _write_yaml(cfg, _minimal_yaml())
        repo = YamlModelRepository(cfg)

        assert repo.config_path == str(cfg)

    def test_accepts_string_path(self, tmp_path: Path) -> None:
        cfg = tmp_path / "models.yaml"
        _write_yaml(cfg, _minimal_yaml())
        repo = YamlModelRepository(str(cfg))

        assert repo.config_path == str(cfg)


class TestLookups:
    """get_task / get_model lookups and their None branches."""

    @pytest.fixture
    def repo(self, tmp_path: Path) -> YamlModelRepository:
        cfg = tmp_path / "models.yaml"
        _write_yaml(cfg, _minimal_yaml())
        return YamlModelRepository(cfg)

    def test_get_task_returns_task_config(self, repo: YamlModelRepository) -> None:
        task = repo.get_task("video_summarization")
        assert task is not None
        assert task.selected == "llama-scout"

    def test_get_task_unknown_returns_none(self, repo: YamlModelRepository) -> None:
        assert repo.get_task("no_such_task") is None

    def test_get_model_returns_model_config(self, repo: YamlModelRepository) -> None:
        model = repo.get_model("object_detection", "yolo-world")
        assert model is not None
        assert model.model_id == "ultralytics/yoloworld"

    def test_get_model_unknown_task_returns_none(self, repo: YamlModelRepository) -> None:
        assert repo.get_model("no_task", "whatever") is None

    def test_get_model_unknown_model_returns_none(self, repo: YamlModelRepository) -> None:
        assert repo.get_model("object_detection", "no-such-model") is None

    def test_get_all_tasks_returns_copy(self, repo: YamlModelRepository) -> None:
        snapshot = repo.get_all_tasks()
        snapshot.clear()
        assert set(repo.get_all_tasks().keys()) == {
            "video_summarization",
            "object_detection",
        }


class TestInferenceConfig:
    """The singleton InferenceConfig accessor."""

    def test_inference_config_reflects_yaml_values(self, tmp_path: Path) -> None:
        cfg = tmp_path / "models.yaml"
        _write_yaml(cfg, _minimal_yaml())
        repo = YamlModelRepository(cfg)

        inference = repo.get_inference_config()
        assert inference.offload_threshold == 0.85
        assert inference.warmup_on_startup is False
        assert inference.default_batch_size == 1
        assert inference.max_batch_size == 8


class TestSelection:
    """set_selected_model validation + mutation."""

    @pytest.fixture
    def repo_with_two_options(self, tmp_path: Path) -> YamlModelRepository:
        cfg = tmp_path / "models.yaml"
        _write_yaml(
            cfg,
            """
models:
  video_summarization:
    selected: llama-scout
    options:
      llama-scout:
        model_id: meta-llama/Llama-4-Scout
        framework: transformers
        vram_gb: 24
        cpu_compatible: false
        speed: medium
        description: Scout
      deepseek:
        model_id: deepseek/deepseek-v3
        framework: sglang
        vram_gb: 48
        cpu_compatible: false
        speed: slow
        description: Deepseek
inference:
  offload_threshold: 0.8
""",
        )
        return YamlModelRepository(cfg)

    def test_set_selected_model_updates_task(
        self, repo_with_two_options: YamlModelRepository
    ) -> None:
        repo_with_two_options.set_selected_model("video_summarization", "deepseek")
        task = repo_with_two_options.get_task("video_summarization")
        assert task is not None
        assert task.selected == "deepseek"

    def test_set_selected_model_unknown_task_raises(
        self, repo_with_two_options: YamlModelRepository
    ) -> None:
        with pytest.raises(ValueError, match="Unknown task"):
            repo_with_two_options.set_selected_model("no_task", "deepseek")

    def test_set_selected_model_unknown_model_raises(
        self, repo_with_two_options: YamlModelRepository
    ) -> None:
        with pytest.raises(ValueError, match="not a valid option"):
            repo_with_two_options.set_selected_model("video_summarization", "no-such-model")


class TestReload:
    """reload() refreshes the in-memory view from disk."""

    def test_reload_picks_up_new_task(self, tmp_path: Path) -> None:
        cfg = tmp_path / "models.yaml"
        _write_yaml(cfg, _minimal_yaml())
        repo = YamlModelRepository(cfg)
        assert "video_tracking" not in repo.get_all_tasks()

        # Rewrite the file with an additional task under ``models:``. Appending
        # raw YAML text to ``_minimal_yaml()`` would land the new block inside
        # the ``inference:`` section, so splice the new block before it.
        _write_yaml(
            cfg,
            """
models:
  video_summarization:
    selected: llama-scout
    options:
      llama-scout:
        model_id: meta-llama/Llama-4-Scout
        framework: transformers
        vram_gb: 24
        cpu_compatible: false
        speed: medium
        description: Scout
  video_tracking:
    selected: sam2
    options:
      sam2:
        model_id: facebook/sam2-small
        framework: pytorch
        vram_gb: 4
        cpu_compatible: false
        speed: fast
        description: SAM 2
inference: {}
""",
        )
        repo.reload()

        assert "video_tracking" in repo.get_all_tasks()

    def test_reload_resets_in_memory_selection_to_disk_value(self, tmp_path: Path) -> None:
        cfg = tmp_path / "models.yaml"
        _write_yaml(
            cfg,
            """
models:
  video_summarization:
    selected: llama-scout
    options:
      llama-scout:
        model_id: meta-llama/Llama-4-Scout
        framework: transformers
        vram_gb: 24
        cpu_compatible: false
        speed: medium
        description: Scout
      deepseek:
        model_id: deepseek/deepseek-v3
        framework: sglang
        vram_gb: 48
        cpu_compatible: false
        speed: slow
        description: Deepseek
inference: {}
""",
        )
        repo = YamlModelRepository(cfg)
        repo.set_selected_model("video_summarization", "deepseek")
        task_before_reload = repo.get_task("video_summarization")
        assert task_before_reload is not None
        assert task_before_reload.selected == "deepseek"

        repo.reload()
        task_after_reload = repo.get_task("video_summarization")
        assert task_after_reload is not None
        assert task_after_reload.selected == "llama-scout"
