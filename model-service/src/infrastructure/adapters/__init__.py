"""Infrastructure adapters.

This package contains adapter implementations that connect the application
to external systems. Follows hexagonal architecture with inbound (driving)
and outbound (driven) adapters.

Subpackages
-----------
inbound
    Adapters that drive the application (e.g., FastAPI routes).
outbound
    Adapters that the application drives (e.g., ML models, external APIs).
"""

from src.infrastructure.adapters import inbound, outbound

__all__ = [
    "inbound",
    "outbound",
]
