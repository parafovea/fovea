"""FastAPI application for AI model inference services.

This module provides the main FastAPI application with endpoints for video
summarization, ontology augmentation, and object detection using open-weight
AI models.
"""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .model_manager import ModelManager
from .observability import configure_observability, instrument_app
from .routes import router, set_model_manager

# Global model manager instance
model_manager: ModelManager | None = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage application lifecycle for FastAPI application.

    Handles startup and shutdown operations including model loading
    and resource cleanup.

    Parameters
    ----------
    app : FastAPI
        The FastAPI application instance.

    Yields
    ------
    None
        Control during application runtime.
    """
    global model_manager

    # Startup
    print("Model service starting up...")
    configure_observability()

    # Initialize ModelManager
    config_path = os.getenv(
        "MODEL_CONFIG_PATH",
        str(Path(__file__).parent.parent / "config" / "models.yaml"),
    )
    print(f"Loading model configuration from: {config_path}")

    model_manager = ModelManager(config_path)
    set_model_manager(model_manager)

    # Warmup models if configured
    await model_manager.warmup_models()

    print("Model service ready")

    yield

    # Shutdown
    print("Model service shutting down...")
    if model_manager:
        await model_manager.shutdown()
    print("Model service stopped")


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
