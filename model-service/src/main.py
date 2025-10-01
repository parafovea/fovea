"""
FastAPI application for AI model inference services.

This module provides the main FastAPI application with endpoints for video
summarization, ontology augmentation, and object detection using open-weight
AI models.
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """
    Manage application lifecycle.

    Handles startup and shutdown operations for the FastAPI application,
    including model loading and resource cleanup.

    Args:
        app: The FastAPI application instance

    Yields:
        None during application runtime
    """
    # Startup
    print("Model service starting up...")

    yield

    # Shutdown
    print("Model service shutting down...")


app = FastAPI(
    title="Fovea Model Service",
    description="AI model inference service for video annotation",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check() -> JSONResponse:
    """
    Health check endpoint.

    Returns the service health status and current timestamp.

    Returns:
        JSONResponse with status and timestamp
    """
    return JSONResponse(
        content={
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "service": "model-service",
        }
    )


@app.get("/")
async def root() -> JSONResponse:
    """
    Root endpoint.

    Returns basic service information.

    Returns:
        JSONResponse with service name and version
    """
    return JSONResponse(
        content={
            "service": "Fovea Model Service",
            "version": "1.0.0",
            "docs": "/docs",
        }
    )
