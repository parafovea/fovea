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

Subpackages are imported by their concrete paths rather than re-exported
here, so importing one outbound subpackage does not force-load its siblings.
This keeps a pure-data import (for example a Pydantic schema) from dragging in
the video processor and its `cv2` dependency.
"""

__all__: list[str] = []
