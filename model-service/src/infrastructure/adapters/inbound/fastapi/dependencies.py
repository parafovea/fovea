"""FastAPI dependency injection.

This module provides FastAPI dependency functions for injecting
services and use cases into route handlers.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import Depends, HTTPException

if TYPE_CHECKING:
    from src.application.services.model_management import ModelManager
    from src.infrastructure.config.container import Container


def get_container_dep() -> Container:
    """Return the global DI container, creating an ephemeral one if needed.

    Tests and other environments that do not run the full app lifespan
    still receive a usable container; production lifespan initializes
    the global container explicitly.
    """
    from pathlib import Path  # noqa: PLC0415

    from src.infrastructure.config.container import (  # noqa: PLC0415
        Container,
        ContainerConfig,
        get_container,
    )

    try:
        return get_container()
    except RuntimeError:
        return Container(
            ContainerConfig(model_config_path=Path("config/models.yaml"))
        )


def get_model_manager() -> ModelManager:
    """Get the ModelManager instance from the container."""
    container = get_container_dep()
    try:
        return container.model_manager
    except RuntimeError as e:
        raise HTTPException(
            status_code=500,
            detail="Model manager not initialized",
        ) from e


ModelManagerDep = Annotated["ModelManager", Depends(get_model_manager)]
ContainerDep = Annotated["Container", Depends(get_container_dep)]
