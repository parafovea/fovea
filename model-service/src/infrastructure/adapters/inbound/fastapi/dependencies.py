"""FastAPI dependency injection.

This module provides FastAPI dependency functions for injecting
services into route handlers.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import Depends, HTTPException

if TYPE_CHECKING:
    from src.application.services.model_management import ModelManager


def get_model_manager() -> ModelManager:
    """Get the ModelManager instance from the container.

    Returns
    -------
    ModelManager
        ModelManager instance.

    Raises
    ------
    HTTPException
        If container or model manager is not initialized.
    """
    from src.infrastructure.config.container import get_container

    try:
        container = get_container()
        return container.model_manager
    except RuntimeError as e:
        raise HTTPException(
            status_code=500,
            detail="Model manager not initialized",
        ) from e


# Type alias for dependency injection
ModelManagerDep = Annotated["ModelManager", Depends(get_model_manager)]
