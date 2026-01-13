"""FastAPI route implementations.

This package contains API endpoint implementations organized by domain.
Each module contains routes for a specific domain concern.

Modules
-------
summarization
    Video summarization endpoints (/api/summarize).
detection
    Object detection endpoints (/api/detect).
tracking
    Video tracking endpoints (/api/track).
ontology
    Ontology augmentation endpoints (/api/ontology/augment).
claims
    Claim extraction and synthesis endpoints.
models
    Model management endpoints (/api/models/*).
health
    Health check endpoints.
thumbnail
    Thumbnail generation endpoints.
"""

__all__: list[str] = []
