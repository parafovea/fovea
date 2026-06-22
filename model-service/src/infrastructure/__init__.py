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

Subpackages are imported by their concrete paths rather than re-exported
here, so importing one subpackage does not force-load its siblings (and the
heavy ML dependencies they pull in).
"""

__all__: list[str] = []
