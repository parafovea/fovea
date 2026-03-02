"""Outbound adapters (driven adapters).

This package contains adapters that the application drives to interact
with external systems. In hexagonal architecture, these adapters implement
outbound port interfaces.

Subpackages
-----------
models
    ML model loader adapters (VLM, LLM, detection, tracking, audio).
external_apis
    External API client adapters (Anthropic, OpenAI, Google, etc.).
video
    Video processing adapters (OpenCV, FFmpeg).
persistence
    Persistence adapters (YAML config repository).
"""

from src.infrastructure.adapters.outbound import (
    external_apis,
    models,
    persistence,
    video,
)

__all__ = [
    "external_apis",
    "models",
    "persistence",
    "video",
]
