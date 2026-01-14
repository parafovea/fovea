"""Observability infrastructure.

This package contains observability components for monitoring,
tracing, and logging.

Modules
-------
telemetry
    OpenTelemetry setup and instrumentation.
"""

from src.infrastructure.observability.telemetry import (
    configure_observability,
    instrument_app,
    meter,
    model_inference_counter,
    model_inference_duration,
)

__all__ = [
    "configure_observability",
    "instrument_app",
    "meter",
    "model_inference_counter",
    "model_inference_duration",
]
