"""FastAPI inbound adapter.

This package implements the FastAPI HTTP adapter for the model service.
Routes are organized by domain concern and use dependency injection
for service access.

Subpackages
-----------
routes
    API endpoint implementations organized by domain.
schemas
    Pydantic request/response models for API contracts.
mappers
    DTO to schema and schema to DTO mappers.
"""

__all__: list[str] = []
