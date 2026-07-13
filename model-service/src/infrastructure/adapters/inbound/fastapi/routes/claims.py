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

from src.infrastructure.adapters.inbound.fastapi import dto_bridge, models
from src.infrastructure.adapters.inbound.fastapi.dependencies import ModelManagerDep  # noqa: TC001
from src.infrastructure.adapters.inbound.fastapi.dx_bodies import (
    as_request,
    as_response,
    dump,
)

router = APIRouter()
tracer = trace.get_tracer(__name__)
logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    # Handlers type-check against the source wire models; at runtime the body is
    # the Pydantic mirror FastAPI validates against (the ``else`` branch).
    _ClaimExtractionRequestBody = models.ClaimExtractionRequest
    _SummarySynthesisRequestBody = models.SummarySynthesisRequest
else:
    _ClaimExtractionRequestBody = as_request(models.ClaimExtractionRequest)
    _SummarySynthesisRequestBody = as_request(models.SummarySynthesisRequest)


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
    response_model=as_response(models.ClaimExtractionResponse),
    responses={
        400: {"model": as_response(models.ErrorResponse)},
        500: {"model": as_response(models.ErrorResponse)},
    },
    summary="Extract atomic claims from summary text",
    description="Decomposes summary text into atomic factual claims using LLM. "
    "Supports hierarchical subclaim extraction and configurable context sources.",
)
async def extract_claims(
    request: _ClaimExtractionRequestBody,
    manager: ModelManagerDep,
) -> dict[str, object]:
    """Extract atomic claims from video summary."""
    with tracer.start_as_current_span("extract_claims") as span:
        span.set_attribute("summary_id", request.summary_id)
        span.set_attribute("strategy", request.extraction_strategy)

        from src.application.use_cases.extract_claims import (
            ExtractClaimsRequest,
            ExtractClaimsUseCase,
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

            # ML loader imports are deferred until a valid task is confirmed so a
            # missing-task request fails fast without pulling in the ML stack.
            from src.infrastructure.adapters.outbound.llm_adapter import LLMLoaderAdapter
            from src.infrastructure.adapters.outbound.models.llm.loader import (
                LLMConfig,
                LLMFramework,
                create_llm_loader,
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
                        "types": [dict(t) for t in request.ontology_types],
                        "glosses": dict(request.ontology_glosses or {}),
                    }

                start_time = time.time()
                use_case = ExtractClaimsUseCase(language_model=language_model)
                claim_dtos = await use_case.execute(
                    ExtractClaimsRequest(
                        summary_text=request.summary_text,
                        sentences=(
                            list(request.sentences)
                            if request.sentences is not None
                            else None
                        ),
                        strategy=request.extraction_strategy,
                        max_claims=request.max_claims,
                        min_confidence=request.min_confidence,
                        ontology_context=ontology_context,
                        annotation_context=(
                            [dict(a) for a in request.annotations]
                            if request.annotations is not None
                            else None
                        ),
                        max_output_tokens=manager.inference_config.llm_max_claims_tokens,
                    )
                )
                processing_time = time.time() - start_time

                claims = tuple(dto_bridge.extracted_claim(c) for c in claim_dtos)

                span.set_attribute("claims_extracted", len(claims))
                span.set_attribute("processing_time", processing_time)

                return dump(
                    models.ClaimExtractionResponse(
                        summary_id=request.summary_id,
                        claims=claims,
                        model_used=llm_config.model_id,
                        processing_time=processing_time,
                    )
                )

            finally:
                await language_model.aunload()

        except Exception as e:
            logger.error("Claim extraction failed: %s", e)
            span.set_attribute("error", str(e))
            raise HTTPException(status_code=500, detail=f"Claim extraction failed: {e}") from e


@router.post(
    "/synthesize-summary",
    response_model=as_response(models.SummarySynthesisResponse),
    responses={
        400: {"model": as_response(models.ErrorResponse)},
        500: {"model": as_response(models.ErrorResponse)},
    },
    summary="Synthesize narrative summary from claim hierarchies",
    description="Generates coherent summary text from structured claims. "
    "Supports hierarchical claims, claim relations, and multi-source synthesis.",
)
async def synthesize_summary(
    request: _SummarySynthesisRequestBody,
    manager: ModelManagerDep,
) -> dict[str, object]:
    """Synthesize summary from claim hierarchies."""
    with tracer.start_as_current_span("synthesize_summary") as span:
        span.set_attribute("summary_id", request.summary_id)
        span.set_attribute("num_sources", len(request.claim_sources))
        span.set_attribute("synthesis_strategy", request.synthesis_strategy)

        from src.application.use_cases.synthesize_summary import SynthesizeSummaryUseCase

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

            # ML loader imports are deferred until a valid task is confirmed so a
            # missing-task request fails fast without pulling in the ML stack.
            from src.infrastructure.adapters.outbound.llm_adapter import LLMLoaderAdapter
            from src.infrastructure.adapters.outbound.models.llm.loader import (
                LLMConfig,
                LLMFramework,
                create_llm_loader,
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
                from src.application.dto.claims import (
                    ClaimRelationshipDTO,
                    ClaimSourceDTO,
                )

                claim_source_dtos = [
                    ClaimSourceDTO(
                        source_id=source.source_id,
                        source_type=source.source_type,
                        claims=[dict(claim) for claim in source.claims],
                        metadata=(
                            dict(source.metadata) if source.metadata is not None else None
                        ),
                    )
                    for source in request.claim_sources
                ]
                claim_relation_dtos = (
                    [
                        ClaimRelationshipDTO(
                            source_claim_id=relation.source_claim_id,
                            target_claim_id=relation.target_claim_id,
                            relation_type=relation.relation_type,
                            confidence=relation.confidence,
                            notes=relation.notes,
                        )
                        for relation in request.claim_relations
                    ]
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

                # Gloss items carry string values, a subset of the wire field's
                # JsonValue; the cast widens across dict invariance at the boundary.
                gloss = cast(
                    "tuple[dict[str, models.JsonValue], ...]", tuple(summary_gloss)
                )
                return dump(
                    models.SummarySynthesisResponse(
                        summary_id=request.summary_id,
                        summary_gloss=gloss,
                        model_used=llm_config.model_id,
                        processing_time=processing_time,
                        claims_used=claims_used,
                        synthesis_metadata={
                            "strategy": request.synthesis_strategy,
                            "num_sources": len(request.claim_sources),
                            "conflicts_detected": conflicts_detected,
                        },
                    )
                )

            finally:
                await language_model.aunload()

        except Exception as e:
            logger.error("Summary synthesis failed: %s", e)
            span.set_attribute("error", str(e))
            raise HTTPException(status_code=500, detail=f"Summary synthesis failed: {e}") from e
