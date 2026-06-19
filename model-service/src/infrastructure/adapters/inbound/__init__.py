"""Inbound adapters (driving adapters).

This package contains adapters that drive the application from external
triggers. In hexagonal architecture, these adapters translate external
requests into application port calls.

Subpackages
-----------
fastapi
    FastAPI HTTP adapter for REST API endpoints.

The fastapi subpackage is imported by its concrete path rather than
re-exported here, so importing a schema module does not force-load the
adapter package eagerly.
"""

__all__: list[str] = []
