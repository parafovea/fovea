"""Dependency injection container.

This module provides a simple dependency injection container that wires
infrastructure adapters to application ports. Uses manual factory pattern
for explicit, type-safe dependency resolution.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.application.ports.inbound import (
        IClaimExtractionService,
        IClaimSynthesisService,
        IDetectionService,
        IModelManagementService,
        IOntologyService,
        ISummarizationService,
        ITrackingService,
    )
    from src.model_manager import ModelManager

logger = logging.getLogger(__name__)


@dataclass
class ContainerConfig:
    """Configuration for the dependency injection container.

    Parameters
    ----------
    model_config_path : Path
        Path to models.yaml configuration file.
    enable_telemetry : bool
        Whether to enable OpenTelemetry tracing.
    enable_warmup : bool
        Whether to warm up models on startup.
    """

    model_config_path: Path
    enable_telemetry: bool = True
    enable_warmup: bool = False


@dataclass
class Container:
    """Dependency injection container for the model service.

    Provides lazy initialization of services and manages their lifecycle.
    Services are created on first access and cached for subsequent requests.

    Parameters
    ----------
    config : ContainerConfig
        Container configuration.

    Examples
    --------
    >>> config = ContainerConfig(model_config_path=Path("config/models.yaml"))
    >>> container = Container(config)
    >>> model_manager = container.model_manager
    """

    config: ContainerConfig
    _model_manager: ModelManager | None = field(default=None, init=False, repr=False)
    _initialized: bool = field(default=False, init=False, repr=False)

    @property
    def model_manager(self) -> ModelManager:
        """Get or create the ModelManager instance.

        Returns
        -------
        ModelManager
            Singleton ModelManager instance.
        """
        if self._model_manager is None:
            from src.model_manager import ModelManager

            self._model_manager = ModelManager(str(self.config.model_config_path))
            logger.info("ModelManager initialized")

        return self._model_manager

    async def initialize(self) -> None:
        """Initialize the container and warm up services.

        This method should be called during application startup to
        initialize services and optionally warm up models.
        """
        if self._initialized:
            return

        logger.info("Initializing container")

        # Initialize model manager
        _ = self.model_manager

        # Warm up models if configured
        if self.config.enable_warmup:
            logger.info("Warming up models")
            await self.model_manager.warmup_models()

        self._initialized = True
        logger.info("Container initialized")

    async def shutdown(self) -> None:
        """Shutdown the container and release resources.

        This method should be called during application shutdown to
        properly clean up resources.
        """
        logger.info("Shutting down container")

        if self._model_manager is not None:
            await self._model_manager.shutdown()
            self._model_manager = None

        self._initialized = False
        logger.info("Container shutdown complete")


# Global container instance
_container: Container | None = None


def get_container() -> Container:
    """Get the global container instance.

    Returns
    -------
    Container
        Global container instance.

    Raises
    ------
    RuntimeError
        If container has not been initialized.
    """
    if _container is None:
        raise RuntimeError("Container not initialized. Call init_container() first.")
    return _container


def init_container(config: ContainerConfig) -> Container:
    """Initialize the global container instance.

    Parameters
    ----------
    config : ContainerConfig
        Container configuration.

    Returns
    -------
    Container
        Initialized container instance.
    """
    global _container
    _container = Container(config)
    logger.info("Global container created")
    return _container


async def shutdown_container() -> None:
    """Shutdown the global container instance."""
    global _container
    if _container is not None:
        await _container.shutdown()
        _container = None
