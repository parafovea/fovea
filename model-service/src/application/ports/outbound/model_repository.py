"""Model Repository port definition.

This module defines the interface for model configuration persistence.
"""

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.domain.entities import InferenceConfig, ModelConfig, TaskConfig


class IModelRepository(ABC):
    """Interface for model configuration repository.

    Implementors must provide methods for reading and updating
    model configuration from persistent storage.
    """

    @abstractmethod
    def get_all_tasks(self) -> dict[str, TaskConfig]:
        """Get all task configurations.

        Returns
        -------
        dict[str, TaskConfig]
            Dictionary mapping task names to configurations.

        Raises
        ------
        ConfigurationError
            If configuration cannot be loaded.
        """
        pass

    @abstractmethod
    def get_task(self, task_name: str) -> TaskConfig | None:
        """Get configuration for a specific task.

        Parameters
        ----------
        task_name : str
            Name of the task.

        Returns
        -------
        TaskConfig | None
            Task configuration, or None if not found.
        """
        pass

    @abstractmethod
    def get_model(self, task_name: str, model_name: str) -> ModelConfig | None:
        """Get configuration for a specific model.

        Parameters
        ----------
        task_name : str
            Name of the task.
        model_name : str
            Name of the model option.

        Returns
        -------
        ModelConfig | None
            Model configuration, or None if not found.
        """
        pass

    @abstractmethod
    def get_inference_config(self) -> InferenceConfig:
        """Get global inference configuration.

        Returns
        -------
        InferenceConfig
            Inference configuration settings.

        Raises
        ------
        ConfigurationError
            If configuration cannot be loaded.
        """
        pass

    @abstractmethod
    def set_selected_model(self, task_name: str, model_name: str) -> None:
        """Set the selected model for a task.

        Parameters
        ----------
        task_name : str
            Name of the task.
        model_name : str
            Name of the model to select.

        Raises
        ------
        InvalidTaskTypeError
            If task name is invalid.
        ValueError
            If model name is not a valid option.
        """
        pass

    @abstractmethod
    def reload(self) -> None:
        """Reload configuration from source.

        Raises
        ------
        ConfigurationError
            If configuration cannot be reloaded.
        """
        pass

    @property
    @abstractmethod
    def config_path(self) -> str:
        """Get the configuration file path.

        Returns
        -------
        str
            Path to configuration file.
        """
        pass
