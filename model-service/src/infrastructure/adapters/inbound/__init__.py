"""Inbound adapters (driving adapters).

This package contains adapters that drive the application from external
triggers. In hexagonal architecture, these adapters translate external
requests into application port calls.

Subpackages
-----------
fastapi
    FastAPI HTTP adapter for REST API endpoints.
"""

from src.infrastructure.adapters.inbound import fastapi

__all__ = [
    "fastapi",
]
