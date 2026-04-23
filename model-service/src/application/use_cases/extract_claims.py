"""Claim extraction from video summaries using LLMs.

This module provides functions for extracting atomic factual claims from
summary text using language models. Supports multiple extraction strategies,
contextual enrichment from ontology and annotations, and hierarchical claim
decomposition.

The use case is framework-neutral. It depends only on application DTOs and
the ``ILanguageModel`` port.
"""

from __future__ import annotations

import json
import logging
import re
from typing import TYPE_CHECKING, Any

from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

from src.application.dto.claims import ExtractedClaimDTO
from src.application.dto.generation import GenerationConfigDTO
from src.application.dto.reasoning_parser import parse_reasoned_output

if TYPE_CHECKING:
    from src.application.dto.reasoning import ThinkingTrace
    from src.application.ports.outbound.llm import ILanguageModel

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)


class ExtractClaimsUseCase:
    """Use case for extracting atomic claims from summary text."""

    def __init__(self, language_model: ILanguageModel) -> None:
        """Initialize with an injected language model port."""
        self._llm = language_model

    async def execute(
        self,
        *,
        summary_text: str,
        sentences: list[str] | None,
        strategy: str,
        max_claims: int,
        min_confidence: float,
        ontology_context: dict[str, Any] | None = None,
        annotation_context: list[dict[str, Any]] | None = None,
    ) -> list[ExtractedClaimDTO]:
        """Extract claims from summary text."""
        with tracer.start_as_current_span("use_case.extract_claims") as span:
            span.set_attribute("use_case.strategy", strategy)
            span.set_attribute("use_case.max_claims", max_claims)
            span.set_attribute("use_case.min_confidence", min_confidence)
            span.set_attribute("use_case.summary_length", len(summary_text))
            try:
                if sentences is None:
                    sentences = split_into_sentences(summary_text)
                span.set_attribute("use_case.input_sentence_count", len(sentences))

                prompt = build_extraction_prompt(
                    summary_text=summary_text,
                    sentences=sentences,
                    strategy=strategy,
                    ontology_context=ontology_context,
                    annotation_context=annotation_context,
                    max_claims=max_claims,
                )

                config = GenerationConfigDTO(
                    max_tokens=4096,
                    temperature=0.7,
                    top_p=0.9,
                    stop_sequences=["---END---"],
                )

                safe_strategy = str(strategy).replace("\r", "").replace("\n", "")
                logger.info("Extracting claims using strategy: %s", safe_strategy)
                result = await self._llm.generate_with_config(prompt=prompt, config=config)

                reasoned = parse_reasoned_output(
                    result.text,
                    model_id=self._llm.model_id,
                    tokens_used=result.tokens_used,
                )

                claims = parse_claims_response(
                    response=reasoned.text,
                    summary_text=summary_text,
                    sentences=sentences,
                    min_confidence=min_confidence,
                )
                claims = claims[:max_claims]
                if reasoned.thinking is not None:
                    claims = [_attach_trace(claim, reasoned.thinking) for claim in claims]
                span.set_attribute("use_case.output_claim_count", len(claims))
                logger.info("Extracted %d claims", len(claims))
                return claims
            except Exception as exc:
                span.record_exception(exc)
                span.set_status(Status(StatusCode.ERROR))
                raise


async def extract_claims_from_summary(
    summary_text: str,
    sentences: list[str] | None,
    strategy: str,
    max_claims: int,
    min_confidence: float,
    language_model: ILanguageModel,
    ontology_context: dict[str, Any] | None = None,
    annotation_context: list[dict[str, Any]] | None = None,
) -> list[ExtractedClaimDTO]:
    """Functional wrapper over :class:`ExtractClaimsUseCase`."""
    use_case = ExtractClaimsUseCase(language_model=language_model)
    return await use_case.execute(
        summary_text=summary_text,
        sentences=sentences,
        strategy=strategy,
        max_claims=max_claims,
        min_confidence=min_confidence,
        ontology_context=ontology_context,
        annotation_context=annotation_context,
    )


def build_extraction_prompt(
    summary_text: str,
    sentences: list[str],
    strategy: str,
    ontology_context: dict[str, Any] | None,
    annotation_context: list[dict[str, Any]] | None,
    max_claims: int,
) -> str:
    """Build LLM prompt for claim extraction."""
    prompt_parts = [
        "You are an expert at analyzing text and extracting atomic factual claims.",
        "",
        "SUMMARY TEXT:",
        summary_text,
        "",
    ]

    if ontology_context and ontology_context.get("types"):
        prompt_parts.append("ONTOLOGY TYPES (for reference):")
        for type_def in ontology_context["types"][:20]:
            type_name = type_def.get("name")
            type_gloss = ontology_context.get("glosses", {}).get(type_def.get("id"), "")
            if type_gloss:
                prompt_parts.append(f"  - #{type_name}: {type_gloss}")
            else:
                prompt_parts.append(f"  - #{type_name}")
        prompt_parts.append("")

    if annotation_context:
        prompt_parts.append("ANNOTATED OBJECTS (for reference):")
        for ann in annotation_context[:15]:
            obj_name = ann.get("name", ann.get("label", "Unknown"))
            obj_type = ann.get("type", "")
            prompt_parts.append(f"  - @{obj_name} ({obj_type})")
        prompt_parts.append("")

    if strategy == "sentence-based":
        prompt_parts.extend(
            [
                "TASK: Extract atomic factual claims from the summary.",
                "",
                "INSTRUCTIONS:",
                "1. For each sentence, extract 1-5 atomic claims",
                "2. Each claim should express ONE verifiable fact",
                "3. Decompose complex sentences into subclaims",
                "4. Reference ontology types using # syntax (e.g., #Person, #Event)",
                "5. Reference annotated objects using @ syntax (e.g., @John, @Location)",
                f"6. Extract up to {max_claims} total claims",
                "",
                "OUTPUT FORMAT (JSON array):",
                "[",
                "  {",
                '    "text": "The JWST was launched",',
                '    "sentence_index": 0,',
                '    "char_start": 0,',
                '    "char_end": 25,',
                '    "subclaims": [',
                "      {",
                '        "text": "JWST is a telescope",',
                '        "confidence": 0.95,',
                '        "claim_type": "entity"',
                "      }",
                "    ],",
                '    "confidence": 0.92,',
                '    "claim_type": "event"',
                "  }",
                "]",
                "",
                "Extract claims now:",
            ]
        )
    elif strategy == "hierarchical":
        prompt_parts.extend(
            [
                "TASK: Extract claims using hierarchical decomposition.",
                "",
                "INSTRUCTIONS:",
                "1. Identify top-level claims (main facts)",
                "2. Decompose each top-level claim into 2-5 subclaims",
                "3. Each subclaim can have its own subclaims (max depth: 3)",
                "4. Use # for types and @ for objects",
                f"5. Extract up to {max_claims} top-level claims",
                "",
                "OUTPUT FORMAT: Same as sentence-based",
                "",
                "Extract claims now:",
            ]
        )
    else:
        prompt_parts.extend(
            [
                "TASK: Extract claims from semantic units (not necessarily sentences).",
                "",
                "INSTRUCTIONS:",
                "1. Identify semantic boundaries (logical chunks)",
                "2. Extract atomic claims from each chunk",
                "3. Use # for types and @ for objects",
                f"4. Extract up to {max_claims} claims",
                "",
                "OUTPUT FORMAT: Same as sentence-based",
                "",
                "Extract claims now:",
            ]
        )

    return "\n".join(prompt_parts)


def parse_claims_response(
    response: str,
    summary_text: str,
    sentences: list[str],
    min_confidence: float,
) -> list[ExtractedClaimDTO]:
    """Parse LLM response into structured claims."""
    json_match = re.search(r"\[.*\]", response, re.DOTALL)
    if not json_match:
        logger.warning("No JSON array found in response")
        return []

    try:
        claims_data = json.loads(json_match.group(0))
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON: {e}")
        return []

    claims: list[ExtractedClaimDTO] = []
    for claim_data in claims_data:
        try:
            confidence = float(claim_data.get("confidence", 0.5))
            if confidence < min_confidence:
                continue

            subclaims: list[ExtractedClaimDTO] = []
            for subclaim_data in claim_data.get("subclaims", []):
                subclaim = parse_single_claim(subclaim_data, min_confidence)
                if subclaim is not None:
                    subclaims.append(subclaim)

            claims.append(
                ExtractedClaimDTO(
                    text=str(claim_data["text"]),
                    confidence=confidence,
                    sentence_index=claim_data.get("sentence_index"),
                    char_start=claim_data.get("char_start"),
                    char_end=claim_data.get("char_end"),
                    subclaims=subclaims,
                    claim_type=claim_data.get("claim_type"),
                )
            )
        except (KeyError, TypeError, ValueError) as e:
            logger.warning(f"Failed to parse claim: {e}")
            continue

    return claims


def parse_single_claim(
    claim_data: dict[str, Any], min_confidence: float
) -> ExtractedClaimDTO | None:
    """Parse single claim recursively."""
    confidence = float(claim_data.get("confidence", 0.5))
    if confidence < min_confidence:
        return None

    subclaims: list[ExtractedClaimDTO] = []
    for subclaim_data in claim_data.get("subclaims", []):
        subclaim = parse_single_claim(subclaim_data, min_confidence)
        if subclaim is not None:
            subclaims.append(subclaim)

    return ExtractedClaimDTO(
        text=str(claim_data["text"]),
        confidence=confidence,
        sentence_index=claim_data.get("sentence_index"),
        char_start=claim_data.get("char_start"),
        char_end=claim_data.get("char_end"),
        subclaims=subclaims,
        claim_type=claim_data.get("claim_type"),
    )


def _attach_trace(claim: ExtractedClaimDTO, trace: ThinkingTrace) -> ExtractedClaimDTO:
    """Return a claim DTO with the given thinking trace attached."""
    return ExtractedClaimDTO(
        text=claim.text,
        confidence=claim.confidence,
        sentence_index=claim.sentence_index,
        char_start=claim.char_start,
        char_end=claim.char_end,
        subclaims=[_attach_trace(sc, trace) for sc in claim.subclaims],
        claim_type=claim.claim_type,
        reasoning_trace=trace,
    )


def split_into_sentences(text: str) -> list[str]:
    """Split text into sentences using simple heuristics."""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    return [s.strip() for s in sentences if s.strip()]
