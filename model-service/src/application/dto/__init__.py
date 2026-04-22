"""Application-layer DTOs.

These are framework-neutral data transfer objects used by use cases and
services. They contain no imports from fastapi, infrastructure, or ML
framework packages.
"""

from src.application.dto.claims import (
    ClaimRelationshipDTO,
    ClaimSourceDTO,
    ExtractedClaimDTO,
)
from src.application.dto.external_api import ExternalAPIConfigDTO
from src.application.dto.generation import GenerationConfigDTO, GenerationResultDTO
from src.application.dto.ontology import OntologyTypeDTO
from src.application.dto.reasoning import ReasonedText, ThinkingStep, ThinkingTrace
from src.application.dto.reasoning_parser import parse_reasoned_output
from src.application.dto.summarization import (
    KeyFrameDTO,
    SummarizeRequestDTO,
    SummarizeResponseDTO,
)
from src.application.dto.typed_dicts import (
    BoundingBoxDict,
    InferenceConfigDict,
    LoadedModelInfoDict,
    MemoryValidationDict,
    ModelConfigDict,
    ModelRequirementDict,
    TaskConfigDict,
)

__all__ = [
    "BoundingBoxDict",
    "ClaimRelationshipDTO",
    "ClaimSourceDTO",
    "ExternalAPIConfigDTO",
    "ExtractedClaimDTO",
    "GenerationConfigDTO",
    "GenerationResultDTO",
    "InferenceConfigDict",
    "KeyFrameDTO",
    "LoadedModelInfoDict",
    "MemoryValidationDict",
    "ModelConfigDict",
    "ModelRequirementDict",
    "OntologyTypeDTO",
    "ReasonedText",
    "SummarizeRequestDTO",
    "SummarizeResponseDTO",
    "TaskConfigDict",
    "ThinkingStep",
    "ThinkingTrace",
    "parse_reasoned_output",
]
