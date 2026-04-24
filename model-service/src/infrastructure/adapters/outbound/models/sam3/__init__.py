"""SAM 3.1 loader and adapters.

Provides a unified loader for SAM 3.1 (text-promptable detection plus
temporal mask tracking) and thin adapters exposing it via the outbound
detection and tracking ports.
"""

from src.infrastructure.adapters.outbound.models.sam3.detection_adapter import (
    SAM3DetectionAdapter,
)
from src.infrastructure.adapters.outbound.models.sam3.loader import SAM3Loader
from src.infrastructure.adapters.outbound.models.sam3.tracking_adapter import (
    SAM3TrackingAdapter,
)

__all__ = ["SAM3DetectionAdapter", "SAM3Loader", "SAM3TrackingAdapter"]
