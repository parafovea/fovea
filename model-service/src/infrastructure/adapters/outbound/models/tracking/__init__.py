"""Video tracking model adapters.

This package contains adapters for video tracking models that
implement the ITrackingModel outbound port interface.

Modules
-------
loader
    Tracking loader implementations and factory.
"""

from src.infrastructure.adapters.outbound.models.tracking.loader import (
    SAM2Loader,
    SAM2LongLoader,
    SAMURAILoader,
    TrackingConfig,
    TrackingFrame,
    TrackingFramework,
    TrackingMask,
    TrackingModelLoader,
    TrackingResult,
    YOLO11SegLoader,
    create_tracking_loader,
    tracking_registry,
)

__all__ = [
    "SAM2Loader",
    "SAM2LongLoader",
    "SAMURAILoader",
    "TrackingConfig",
    "TrackingFrame",
    "TrackingFramework",
    "TrackingMask",
    "TrackingModelLoader",
    "TrackingResult",
    "YOLO11SegLoader",
    "create_tracking_loader",
    "tracking_registry",
]
