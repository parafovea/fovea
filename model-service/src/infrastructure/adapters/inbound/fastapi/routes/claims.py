"""Claim extraction and synthesis routes.

Provides endpoints for extracting atomic claims from video summaries
and synthesizing narrative summaries from claim hierarchies.
"""

import logging
import time
from typing import NotRequired, TypedDict, cast

from fastapi import APIRouter, HTTPException
from opentelemetry import trace

from src.infrastructure.adapters.inbound.fastapi.dependencies import ModelManagerDep
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

    subclaims: NotRequired[list["ClaimDict"]]


def _count_claims_recursive(claims: list[ClaimDict]) -> int:
    """Count claims recursively including subclaims.

    Parameters
    ----------
    claims : list[ClaimDict]
        List of claim dictionaries.

    Returns
    -------
    int
        Total count of claims and subclaims.
    """
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
    """Extract atomic claims from video summary.

    Parameters
    ----------
    request : ClaimExtractionRequest
        Extraction request with summary text, context, and configuration.
    manager : ModelManagerDep
        Injected model manager instance.

    Returns
    -------
    ClaimExtractionResponse
        Extracted claims with hierarchical structure.

    Raises
    ------
    HTTPException
        If extraction fails or configuration is invalid.
    """
    with tracer.start_as_current_span("extract_claims") as span:
        span.set_attribute("summary_id", request.summary_id)
        span.set_attribute("strategy", request.extraction_strategy)

        from src.application.use_cases.extract_claims import extract_claims_from_summary
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

            # Get LLM configuration
            selected_config = task_config.get_selected_config()
            llm_config = LLMConfig(
                model_id=selected_config.model_id,
                quantization=selected_config.quantization or "none",
                framework=LLMFramework(selected_config.framework),
                max_tokens=4096,
                temperature=0.7,
            )

            # Load LLM
            loader = create_llm_loader(llm_config)
            await loader.load()

            try:
                # Build context from request
                ontology_context = None
                if request.ontology_types:
                    ontology_context = {
                        "types": request.ontology_types,
                        "glosses": request.ontology_glosses or {},
                    }

                # Extract claims
                start_time = time.time()
                claims = await extract_claims_from_summary(
                    summary_text=request.summary_text,
                    sentences=request.sentences,
                    strategy=request.extraction_strategy,
                    max_claims=request.max_claims,
                    min_confidence=request.min_confidence,
                    llm_loader=loader,
                    ontology_context=ontology_context,
                    annotation_context=request.annotations,
                )
                processing_time = time.time() - start_time

                span.set_attribute("claims_extracted", len(claims))
                span.set_attribute("processing_time", processing_time)

                return ClaimExtractionResponse(
                    summary_id=request.summary_id,
                    claims=claims,
                    model_used=llm_config.model_id,
                    processing_time=processing_time,
                )

            finally:
                await loader.unload()

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
    """Synthesize summary from claim hierarchies.

    Parameters
    ----------
    request : SummarySynthesisRequest
        Synthesis request with claim hierarchies, relations, and configuration.
    manager : ModelManagerDep
        Injected model manager instance.

    Returns
    -------
    SummarySynthesisResponse
        Generated summary with metadata.

    Raises
    ------
    HTTPException
        If synthesis fails or configuration is invalid.
    """
    with tracer.start_as_current_span("synthesize_summary") as span:
        span.set_attribute("summary_id", request.summary_id)
        span.set_attribute("num_sources", len(request.claim_sources))
        span.set_attribute("synthesis_strategy", request.synthesis_strategy)

        from src.application.use_cases.synthesize_summary import (
            synthesize_summary_from_claims,
        )
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

            # Get LLM configuration (needs larger context for multi-source)
            selected_config = task_config.get_selected_config()
            llm_config = LLMConfig(
                model_id=selected_config.model_id,
                quantization=selected_config.quantization or "none",
                framework=LLMFramework(selected_config.framework),
                max_tokens=8192,  # Larger for complex syntheses
                temperature=0.8,
            )

            # Load LLM
            loader = create_llm_loader(llm_config)
            await loader.load()

            try:
                # Synthesize summary
                start_time = time.time()
                summary_gloss = await synthesize_summary_from_claims(
                    claim_sources=request.claim_sources,
                    claim_relations=request.claim_relations,
                    synthesis_strategy=request.synthesis_strategy,
                    ontology_context=request.ontology_context,
                    persona_context=request.persona_context,
                    llm_loader=loader,
                    max_length=request.max_length,
                    include_conflicts=request.include_conflicts,
                    include_citations=request.include_citations,
                )
                processing_time = time.time() - start_time

                span.set_attribute("summary_length", len(summary_gloss))
                span.set_attribute("processing_time", processing_time)

                # Calculate claims used
                claims_used = sum(
                    _count_claims_recursive(cast(list[ClaimDict], src.claims))
                    for src in request.claim_sources
                )

                # Build metadata
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
                await loader.unload()

        except Exception as e:
            logger.error("Summary synthesis failed: %s", e)
            span.set_attribute("error", str(e))
            raise HTTPException(status_code=500, detail=f"Summary synthesis failed: {e}") from e
