"""Application ports.

This package defines the interfaces (ports) for the application following
hexagonal architecture. Inbound ports define what the application can do,
outbound ports define what the application needs.
"""

from src.application.ports import inbound, outbound

__all__ = [
    "inbound",
    "outbound",
]
