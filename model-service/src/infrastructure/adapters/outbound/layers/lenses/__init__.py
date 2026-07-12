"""Canonical fovea-to-layers lenses.

Each lens projects one model-service output DTO to a
:class:`lairs.integrations.codecs.CorpusFragment` of canonical ``pub.layers.*``
records paired with a fovea complement, so the round-trip laws hold. This package
re-exports the six lens singletons (and their classes) the codec and adapter
compose over. Importing it requires the ``lairs`` / ``didactic`` stack, so it
lives only in the codec virtualenv.
"""

from __future__ import annotations

from src.infrastructure.adapters.outbound.layers.lenses.claims import (
    CLAIMS_LAYERS,
    ClaimsLayersLens,
)
from src.infrastructure.adapters.outbound.layers.lenses.detection import (
    DETECTION_LAYERS,
    DetectionLayersLens,
)
from src.infrastructure.adapters.outbound.layers.lenses.ontology import (
    ONTOLOGY_LAYERS,
    OntologyLayersLens,
    OntologySource,
)
from src.infrastructure.adapters.outbound.layers.lenses.summary import (
    SUMMARY_LAYERS,
    SummaryLayersLens,
)
from src.infrastructure.adapters.outbound.layers.lenses.tracking import (
    TRACKING_LAYERS,
    TrackingLayersLens,
)
from src.infrastructure.adapters.outbound.layers.lenses.transcript import (
    TRANSCRIPT_LAYERS,
    TranscriptLayersLens,
)

__all__ = [
    "CLAIMS_LAYERS",
    "DETECTION_LAYERS",
    "ONTOLOGY_LAYERS",
    "SUMMARY_LAYERS",
    "TRACKING_LAYERS",
    "TRANSCRIPT_LAYERS",
    "ClaimsLayersLens",
    "DetectionLayersLens",
    "OntologyLayersLens",
    "OntologySource",
    "SummaryLayersLens",
    "TrackingLayersLens",
    "TranscriptLayersLens",
]
