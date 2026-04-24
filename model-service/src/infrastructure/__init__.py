"""Infrastructure layer.

This package contains infrastructure implementations following hexagonal
architecture. The infrastructure layer provides concrete implementations
of ports defined in the application layer.

Subpackages
-----------
adapters
    Inbound and outbound adapters for external system integration.
config
    Configuration and dependency injection setup.
observability
    Telemetry, logging, and monitoring infrastructure.
"""

from src.infrastructure import adapters, config, observability

__all__ = [
    "adapters",
    "config",
    "observability",
]
