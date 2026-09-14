"""FastAPI route implementations.

This package contains API endpoint implementations organized by domain.
Each module contains routes for a specific domain concern.

Modules
-------
summarization
    Video summarization endpoints (/api/summarize).
detection
    Object detection endpoints (/api/detection/detect).
tracking
    Video tracking endpoints (/api/tracking/track).
ontology
    Ontology augmentation endpoints (/api/ontology/augment).
claims
    Claim extraction and synthesis endpoints.
models
    Model management endpoints (/api/models/*).
thumbnails
    Thumbnail generation endpoints.
transcribe
    Audio transcription endpoints (/api/transcribe).
diarize
    Speaker diarization endpoints (/api/diarize).
admin
    Operational/admin endpoints.
"""

from fastapi import APIRouter

from src.infrastructure.adapters.inbound.fastapi.routes.admin import (
    router as admin_router,
)
from src.infrastructure.adapters.inbound.fastapi.routes.claims import (
    router as claims_router,
)
from src.infrastructure.adapters.inbound.fastapi.routes.detection import (
    router as detection_router,
)
from src.infrastructure.adapters.inbound.fastapi.routes.diarize import (
    router as diarize_router,
)
from src.infrastructure.adapters.inbound.fastapi.routes.layers import (
    router as layers_router,
)
from src.infrastructure.adapters.inbound.fastapi.routes.models import (
    router as models_router,
)
from src.infrastructure.adapters.inbound.fastapi.routes.ontology import (
    router as ontology_router,
)
from src.infrastructure.adapters.inbound.fastapi.routes.summarization import (
    router as summarization_router,
)
from src.infrastructure.adapters.inbound.fastapi.routes.thumbnails import (
    router as thumbnails_router,
)
from src.infrastructure.adapters.inbound.fastapi.routes.tracking import (
    router as tracking_router,
)
from src.infrastructure.adapters.inbound.fastapi.routes.transcribe import (
    router as transcribe_router,
)

router = APIRouter(prefix="/api")
router.include_router(summarization_router)
router.include_router(detection_router)
router.include_router(tracking_router)
router.include_router(ontology_router)
router.include_router(claims_router)
router.include_router(layers_router)
router.include_router(models_router)
router.include_router(thumbnails_router)
router.include_router(transcribe_router)
router.include_router(diarize_router)
router.include_router(admin_router)

__all__ = ["router"]
