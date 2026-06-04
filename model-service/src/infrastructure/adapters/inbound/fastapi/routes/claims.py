"""Claim extraction and synthesis routes.

Provides endpoints for extracting atomic claims from video summaries
and synthesizing narrative summaries from claim hierarchies. Routes wire
concrete infrastructure adapters to application use cases.
"""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, NotRequired, TypedDict, cast

if TYPE_CHECKING:
    from src.domain.entities.architectures import LLMArchitecture

from fastapi import APIRouter, HTTPException
from opentelemetry import trace

from src.infrastructure.adapters.inbound.fastapi.dependencies import ModelManagerDep  # noqa: TC001
from src.infrastructure.adapters.inbound.fastapi.mappers import (
    claim_relationship_schema_to_dto,
    claim_source_schema_to_dto,
    extracted_claim_dto_to_schema,
)
from src.infrastructure.adapters.inbound.fastapi.schemas import (
    ClaimExtractionRequest,
    ClaimExtractionResponse,
    ErrorResponse,
    SummarySynthesisRequest,
    SummarySynthesisResponse,
)

router = APIRouter()
tracer = trace.get_tracer(__name__)
logger = logging.getLogger(__name__)


class ClaimDict(TypedDict):
    """Recursive claim structure with optional subclaims."""

    subclaims: NotRequired[list[ClaimDict]]


def _count_claims_recursive(claims: list[ClaimDict]) -> int:
    """Count claims recursively including subclaims."""
    count = len(claims)
    for claim in claims:
        subclaims = claim.get("subclaims", [])
        if subclaims:
            count += _count_claims_recursive(subclaims)
    return count


@router.post(
    "/extract-claims",
    response_model=ClaimExtractionResponse,
    responses={
        400: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Extract atomic claims from summary text",
    description="Decomposes summary text into atomic factual claims using LLM. "
    "Supports hierarchical subclaim extraction and configurable context sources.",
)
async def extract_claims(
    request: ClaimExtractionRequest,
    manager: ModelManagerDep,
) -> ClaimExtractionResponse:
    """Extract atomic claims from video summary."""
    with tracer.start_as_current_span("extract_claims") as span:
        span.set_attribute("summary_id", request.summary_id)
        span.set_attribute("strategy", request.extraction_strategy)

        from src.application.use_cases.extract_claims import (
            ExtractClaimsRequest,
            ExtractClaimsUseCase,
        )
        from src.infrastructure.adapters.outbound.llm_adapter import LLMLoaderAdapter
        from src.infrastructure.adapters.outbound.models.llm.loader import (
            LLMConfig,
            LLMFramework,
            create_llm_loader,
        )

        try:
            task_config = manager.tasks.get("claim_extraction")
            if task_config is None:
                raise HTTPException(
                    status_code=500,
                    detail="Claim extraction task not configured",
                )

            selected_config = task_config.get_selected_config()

            if selected_config.architecture is None:
                raise RuntimeError(
                    f"Model config for {task_config.selected!r} is missing required "
                    f"architecture field; add an architecture block to "
                    f"models.yaml/models-cpu.yaml"
                )

            llm_config = LLMConfig(
                model_id=selected_config.model_id,
                quantization=selected_config.quantization or "none",
                framework=LLMFramework(selected_config.framework),
                max_tokens=4096,
                temperature=0.7,
            )

            loader = create_llm_loader(
                cast("LLMArchitecture", selected_config.architecture), llm_config
            )
            language_model = LLMLoaderAdapter(loader)
            await language_model.aload()

            try:
                ontology_context = None
                if request.ontology_types:
                    ontology_context = {
                        "types": request.ontology_types,
                        "glosses": request.ontology_glosses or {},
                    }

                start_time = time.time()
                use_case = ExtractClaimsUseCase(language_model=language_model)
                claim_dtos = await use_case.execute(
                    ExtractClaimsRequest(
                        summary_text=request.summary_text,
                        sentences=request.sentences,
                        strategy=request.extraction_strategy,
                        max_claims=request.max_claims,
                        min_confidence=request.min_confidence,
                        ontology_context=ontology_context,
                        annotation_context=request.annotations,
                        max_output_tokens=manager.inference_config.llm_max_claims_tokens,
                    )
                )
                processing_time = time.time() - start_time

                claims = [extracted_claim_dto_to_schema(c) for c in claim_dtos]

                span.set_attribute("claims_extracted", len(claims))
                span.set_attribute("processing_time", processing_time)

                return ClaimExtractionResponse(
                    summary_id=request.summary_id,
                    claims=claims,
                    model_used=llm_config.model_id,
                    processing_time=processing_time,
                )

            finally:
                await language_model.aunload()

        except Exception as e:
            logger.error("Claim extraction failed: %s", e)
            span.set_attribute("error", str(e))
            raise HTTPException(status_code=500, detail=f"Claim extraction failed: {e}") from e


@router.post(
    "/synthesize-summary",
    response_model=SummarySynthesisResponse,
    responses={
        400: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Synthesize narrative summary from claim hierarchies",
    description="Generates coherent summary text from structured claims. "
    "Supports hierarchical claims, claim relations, and multi-source synthesis.",
)
async def synthesize_summary(
    request: SummarySynthesisRequest,
    manager: ModelManagerDep,
) -> SummarySynthesisResponse:
    """Synthesize summary from claim hierarchies."""
    with tracer.start_as_current_span("synthesize_summary") as span:
        span.set_attribute("summary_id", request.summary_id)
        span.set_attribute("num_sources", len(request.claim_sources))
        span.set_attribute("synthesis_strategy", request.synthesis_strategy)

        from src.application.use_cases.synthesize_summary import SynthesizeSummaryUseCase
        from src.infrastructure.adapters.outbound.llm_adapter import LLMLoaderAdapter
        from src.infrastructure.adapters.outbound.models.llm.loader import (
            LLMConfig,
            LLMFramework,
            create_llm_loader,
        )

        try:
            task_config = manager.tasks.get("claim_synthesis")
            if task_config is None:
                raise HTTPException(
                    status_code=500,
                    detail="Claim synthesis task not configured",
                )

            selected_config = task_config.get_selected_config()

            if selected_config.architecture is None:
                raise RuntimeError(
                    f"Model config for {task_config.selected!r} is missing required "
                    f"architecture field; add an architecture block to "
                    f"models.yaml/models-cpu.yaml"
                )

            llm_config = LLMConfig(
                model_id=selected_config.model_id,
                quantization=selected_config.quantization or "none",
                framework=LLMFramework(selected_config.framework),
                max_tokens=8192,
                temperature=0.8,
            )

            loader = create_llm_loader(
                cast("LLMArchitecture", selected_config.architecture), llm_config
            )
            language_model = LLMLoaderAdapter(loader)
            await language_model.aload()

            try:
                claim_source_dtos = [claim_source_schema_to_dto(s) for s in request.claim_sources]
                claim_relation_dtos = (
                    [claim_relationship_schema_to_dto(r) for r in request.claim_relations]
                    if request.claim_relations is not None
                    else None
                )

                start_time = time.time()
                use_case = SynthesizeSummaryUseCase(language_model=language_model)
                summary_gloss = await use_case.execute(
                    claim_sources=claim_source_dtos,
                    claim_relations=claim_relation_dtos,
                    synthesis_strategy=request.synthesis_strategy,
                    ontology_context=request.ontology_context,
                    persona_context=request.persona_context,
                    max_length=request.max_length,
                    include_conflicts=request.include_conflicts,
                    include_citations=request.include_citations,
                )
                processing_time = time.time() - start_time

                span.set_attribute("summary_length", len(summary_gloss))
                span.set_attribute("processing_time", processing_time)

                claims_used = sum(
                    _count_claims_recursive(cast(list[ClaimDict], src.claims))
                    for src in request.claim_sources
                )

                conflicts_detected = 0
                if request.claim_relations:
                    conflicts_detected = len(
                        [
                            r
                            for r in request.claim_relations
                            if r.relation_type in ["conflicts_with", "contradicts"]
                        ]
                    )

                return SummarySynthesisResponse(
                    summary_id=request.summary_id,
                    summary_gloss=summary_gloss,
                    model_used=llm_config.model_id,
                    processing_time=processing_time,
                    claims_used=claims_used,
                    synthesis_metadata={
                        "strategy": request.synthesis_strategy,
                        "num_sources": len(request.claim_sources),
                        "conflicts_detected": conflicts_detected,
                    },
                )

            finally:
                await language_model.aunload()

        except Exception as e:
            logger.error("Summary synthesis failed: %s", e)
            span.set_attribute("error", str(e))
            raise HTTPException(status_code=500, detail=f"Summary synthesis failed: {e}") from e
