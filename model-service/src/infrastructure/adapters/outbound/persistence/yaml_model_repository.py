"""YAML-backed implementation of the IModelRepository port.

Reads model configuration from a YAML file and exposes it as typed
TaskConfig and ModelConfig domain entities.

This adapter encapsulates all YAML I/O. The application layer depends on
the port interface, not on yaml/pathlib directly.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from src.application.ports.outbound.model_repository import IModelRepository
from src.domain.entities import InferenceConfig, ModelConfig, TaskConfig


def _build_task_config(task_name: str, raw: dict[str, Any]) -> TaskConfig:
    """Translate a YAML task block into a typed ``TaskConfig``.

    The YAML shape is ``{selected: str, options: {name: {...model fields}}}``;
    each option maps to ``ModelConfig.from_dict`` so downstream callers see
    real domain entities instead of raw dicts.
    """
    selected = str(raw.get("selected", ""))
    options_raw = raw.get("options", {})
    options: dict[str, ModelConfig] = {}
    if isinstance(options_raw, dict):
        for name, payload in options_raw.items():
            if isinstance(payload, dict):
                options[str(name)] = ModelConfig.from_dict(payload)
    return TaskConfig(task_name=task_name, selected=selected, options=options)


class YamlModelRepository(IModelRepository):
    """Load and persist model configuration from a YAML file."""

    def __init__(self, config_path: str | Path) -> None:
        """Initialise the repository from a YAML file path.

        Parameters
        ----------
        config_path : str | Path
            Path to the models YAML file.

        Raises
        ------
        FileNotFoundError
            If the config file does not exist.
        """
        self._config_path = Path(config_path)
        self._raw: dict[str, Any] = {}
        self._tasks: dict[str, TaskConfig] = {}
        self._inference: InferenceConfig | None = None
        self.reload()

    def reload(self) -> None:
        """Reload configuration from the YAML file on disk."""
        if not self._config_path.exists():
            raise FileNotFoundError(f"Config file not found: {self._config_path}")

        with self._config_path.open() as handle:
            raw = yaml.safe_load(handle)

        if not isinstance(raw, dict):
            raise ValueError(f"Invalid config format in {self._config_path}: expected mapping")

        self._raw = raw
        models_raw = raw.get("models", {})
        self._tasks = {
            task_name: _build_task_config(task_name, task_block)
            for task_name, task_block in models_raw.items()
            if isinstance(task_block, dict)
        }
        inference_raw = raw.get("inference", {})
        if not isinstance(inference_raw, dict):
            inference_raw = {}
        self._inference = InferenceConfig.from_dict(inference_raw)

    def get_all_tasks(self) -> dict[str, TaskConfig]:
        """Return all configured tasks."""
        return dict(self._tasks)

    def get_task(self, task_name: str) -> TaskConfig | None:
        """Return a single task configuration by name."""
        return self._tasks.get(task_name)

    def get_model(self, task_name: str, model_name: str) -> ModelConfig | None:
        """Return a single model configuration under a task, or None."""
        task = self._tasks.get(task_name)
        if task is None:
            return None
        return task.options.get(model_name)

    def get_inference_config(self) -> InferenceConfig:
        """Return the global inference configuration."""
        if self._inference is None:
            raise RuntimeError("Inference config not loaded")
        return self._inference

    def set_selected_model(self, task_name: str, model_name: str) -> None:
        """Mark a task's selected model. Does not persist to disk.

        Persistence is intentionally left to the caller: this repository
        reflects in-memory selection state. Add a ``save()`` method if you
        need disk durability.
        """
        task = self._tasks.get(task_name)
        if task is None:
            raise ValueError(f"Unknown task: {task_name}")
        if model_name not in task.options:
            raise ValueError(f"Model '{model_name}' is not a valid option for task '{task_name}'")
        task.selected = model_name

    @property
    def config_path(self) -> str:
        """Return the path to the YAML file."""
        return str(self._config_path)
