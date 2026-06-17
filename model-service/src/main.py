"""FastAPI application for AI model inference services.

This module provides the main FastAPI application with endpoints for video
summarization, ontology augmentation, and object detection using open-weight
AI models. Serves as the composition root, wiring the dependency injection
container to the FastAPI application.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .infrastructure.adapters.inbound.fastapi.routes import router
from .infrastructure.config.container import (
    ContainerConfig,
    init_container,
    shutdown_container,
)
from .infrastructure.config.settings import get_settings
from .infrastructure.observability import configure_observability, instrument_app


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage application lifecycle for FastAPI application.

    Handles startup and shutdown operations including container
    initialization and resource cleanup.

    Parameters
    ----------
    app : FastAPI
        The FastAPI application instance.

    Yields
    ------
    None
        Control during application runtime.
    """
    # Startup. Validate the environment once, up front, so a misconfigured
    # deployment fails fast before observability or the container come up.
    settings = get_settings()

    configure_observability()

    # Initialize DI container
    config = ContainerConfig(
        model_config_path=settings.model_config_path,
        enable_warmup=True,
    )
    container = init_container(config)
    await container.initialize()

    yield

    # Shutdown
    await shutdown_container()


app = FastAPI(
    title="Fovea Model Service",
    description="AI model inference service for video annotation",
    version="0.1.0",
    lifespan=lifespan,
)

# Configure OpenTelemetry instrumentation
instrument_app(app)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router)


@app.get("/health")
async def health_check() -> JSONResponse:
    """Health check endpoint returning service status.

    Returns
    -------
    JSONResponse
        JSON response with status, timestamp, and service name.
    """
    return JSONResponse(
        content={
            "status": "healthy",
            "timestamp": datetime.now(UTC).isoformat(),
            "service": "model-service",
        }
    )


@app.get("/")
async def root() -> JSONResponse:
    """Root endpoint returning basic service information.

    Returns
    -------
    JSONResponse
        JSON response with service name, version, and documentation URL.
    """
    return JSONResponse(
        content={
            "service": "Fovea Model Service",
            "version": "0.1.0",
            "docs": "/docs",
        }
    )
