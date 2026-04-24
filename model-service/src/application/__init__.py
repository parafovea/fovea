"""Application layer.

This package contains use cases and port definitions following hexagonal
architecture. The application layer coordinates domain logic and defines
interfaces for external dependencies.

Subpackages
-----------
ports
    Interface definitions for inbound (driving) and outbound (driven) adapters.
use_cases
    Application services implementing business workflows.
dto
    Data transfer objects for crossing layer boundaries.
services
    Domain services shared across use cases.
"""

from src.application import dto, ports, services, use_cases

__all__ = [
    "dto",
    "ports",
    "services",
    "use_cases",
]
