"""Mappers converting between FastAPI schemas and application DTOs."""

from src.infrastructure.adapters.inbound.fastapi.mappers.claims import (
    claim_relationship_schema_to_dto,
    claim_source_schema_to_dto,
    extracted_claim_dto_to_schema,
)
from src.infrastructure.adapters.inbound.fastapi.mappers.detection import (
    detection_request_schema_to_dto,
    detection_response_dto_to_schema,
)
from src.infrastructure.adapters.inbound.fastapi.mappers.ontology import (
    ontology_type_dto_to_schema,
)
from src.infrastructure.adapters.inbound.fastapi.mappers.summarization import (
    key_frame_dto_to_schema,
    summarize_request_schema_to_dto,
    summarize_response_dto_to_schema,
)
from src.infrastructure.adapters.inbound.fastapi.mappers.tracking import (
    tracking_request_schema_to_dto,
    tracking_response_dto_to_schema,
)

__all__ = [
    "claim_relationship_schema_to_dto",
    "claim_source_schema_to_dto",
    "detection_request_schema_to_dto",
    "detection_response_dto_to_schema",
    "extracted_claim_dto_to_schema",
    "key_frame_dto_to_schema",
    "ontology_type_dto_to_schema",
    "summarize_request_schema_to_dto",
    "summarize_response_dto_to_schema",
    "tracking_request_schema_to_dto",
    "tracking_response_dto_to_schema",
]
