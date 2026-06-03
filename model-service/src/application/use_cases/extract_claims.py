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
from dataclasses import dataclass, field
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


@dataclass(frozen=True)
class ExtractClaimsRequest:
    """Bundled input for :meth:`ExtractClaimsUseCase.execute`.

    Grouping the request fields onto a single immutable object keeps the
    use-case signature stable as the route adds new optional inputs
    (ontology context, annotation context, generation budgets) without
    growing the positional/keyword footprint. The route constructs one
    of these per request from the FastAPI schema and the model-service
    inference config; the use case never sees any of these fields as
    bare arguments.
    """

    summary_text: str
    strategy: str
    max_claims: int
    min_confidence: float
    sentences: list[str] | None = None
    ontology_context: dict[str, Any] | None = None
    annotation_context: list[dict[str, Any]] | None = field(default=None)
    max_output_tokens: int = 1024


class ExtractClaimsUseCase:
    """Use case for extracting atomic claims from summary text."""

    def __init__(self, language_model: ILanguageModel) -> None:
        """Initialize with an injected language model port."""
        self._llm = language_model

    async def execute(self, request: ExtractClaimsRequest) -> list[ExtractedClaimDTO]:
        """Extract claims from summary text."""
        with tracer.start_as_current_span("use_case.extract_claims") as span:
            span.set_attribute("use_case.strategy", request.strategy)
            span.set_attribute("use_case.max_claims", request.max_claims)
            span.set_attribute("use_case.min_confidence", request.min_confidence)
            span.set_attribute("use_case.summary_length", len(request.summary_text))
            try:
                sentences = request.sentences
                if sentences is None:
                    sentences = split_into_sentences(request.summary_text)
                span.set_attribute("use_case.input_sentence_count", len(sentences))

                prompt = build_extraction_prompt(
                    summary_text=request.summary_text,
                    sentences=sentences,
                    strategy=request.strategy,
                    ontology_context=request.ontology_context,
                    annotation_context=request.annotation_context,
                    max_claims=request.max_claims,
                )

                # Grammar-constrained decoding via JSON schema:
                # adapters that support it (llama-cpp-python GBNF,
                # vLLM guided_json, sglang JSON guidance) physically
                # prevent invalid tokens at decode time, so small
                # models cannot emit malformed output. The schema is
                # the minimal shape the parser needs; the prompt still
                # asks for confidence/sentence_index/subclaims so the
                # model can emit those when capable, but the decoder
                # is only required to honor the top-level array of
                # {text} objects.
                config = GenerationConfigDTO(
                    max_tokens=request.max_output_tokens,
                    temperature=0.2,
                    top_p=0.9,
                    stop_sequences=["---END---"],
                    json_schema=_claims_array_schema(request.max_claims),
                )

                safe_strategy = str(request.strategy).replace("\r", "").replace("\n", "")
                logger.info("Extracting claims using strategy: %s", safe_strategy)
                result = await self._llm.generate_with_config(prompt=prompt, config=config)
                logger.info(
                    "Claim-extraction LLM emitted %d tokens; raw head: %r",
                    result.tokens_used or 0,
                    (result.text or "")[:300],
                )

                reasoned = parse_reasoned_output(
                    result.text,
                    model_id=self._llm.model_id,
                    tokens_used=result.tokens_used,
                )

                claims = parse_claims_response(
                    response=reasoned.text,
                    summary_text=request.summary_text,
                    sentences=sentences,
                    min_confidence=request.min_confidence,
                )
                claims = claims[: request.max_claims]
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
        ExtractClaimsRequest(
            summary_text=summary_text,
            sentences=sentences,
            strategy=strategy,
            max_claims=max_claims,
            min_confidence=min_confidence,
            ontology_context=ontology_context,
            annotation_context=annotation_context,
        )
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


def _claims_array_schema(max_claims: int) -> dict[str, Any]:
    """JSON Schema for a claim-extraction response.

    Minimal-yet-typed: the decoder is required to emit a top-level
    array of objects with a ``text`` string, and may also emit
    ``confidence``, ``sentence_index``, ``claim_type``, ``char_start``,
    ``char_end``, and recursive ``subclaims``. Schema is generated per
    call so ``max_claims`` enters the grammar's array length bound
    (some backends honor ``maxItems``; the use case still trims to
    ``max_claims`` after parsing as a belt-and-suspenders measure for
    backends that ignore the bound).
    """
    claim_schema: dict[str, Any] = {
        "type": "object",
        "properties": {
            "text": {"type": "string", "minLength": 1},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "sentence_index": {"type": ["integer", "null"], "minimum": 0},
            "char_start": {"type": ["integer", "null"], "minimum": 0},
            "char_end": {"type": ["integer", "null"], "minimum": 0},
            "claim_type": {"type": ["string", "null"]},
            "subclaims": {"type": "array", "items": {"$ref": "#/$defs/claim"}},
        },
        "required": ["text"],
        "additionalProperties": False,
    }
    return {
        "$defs": {"claim": claim_schema},
        "type": "array",
        "items": claim_schema,
        # Force at least one claim. Without `minItems`, grammar-
        # constrained decoders take the cheapest valid path and emit
        # `[]` because that satisfies the schema with zero output
        # tokens. The use case can still filter by min_confidence
        # downstream, so demanding ≥1 claim here is the right tradeoff.
        "minItems": 1,
        "maxItems": max_claims,
    }


def parse_claims_response(
    response: str,
    summary_text: str,
    sentences: list[str],
    min_confidence: float,
) -> list[ExtractedClaimDTO]:
    """Parse LLM response into structured claims.

    The model's output usually contains a JSON array with the extracted
    claims, optionally followed by trailing prose ("Hope this helps!")
    or a second metadata array. The previous implementation used a
    greedy ``\\[.*\\]`` regex that grabbed everything between the first
    ``[`` and the last ``]`` and handed it to ``json.loads`` — which
    rejects any input with trailing characters, so a single extra
    array or paragraph collapsed the whole call to zero claims.

    Instead, walk the response, find each ``[``, and ask
    ``json.JSONDecoder().raw_decode`` to parse from that offset; the
    decoder returns the first valid JSON value and an index of where
    parsing stopped, ignoring whatever comes after. The first array
    of objects wins; if the model emits a non-array first (a string
    or object), we skip past it and keep looking.
    """
    decoder = json.JSONDecoder()
    claims_data: list[dict[str, Any]] | None = None
    for match in re.finditer(r"\[", response):
        start = match.start()
        try:
            value, _end = decoder.raw_decode(response[start:])
        except json.JSONDecodeError:
            continue
        if isinstance(value, list) and (not value or isinstance(value[0], dict)):
            claims_data = value
            break

    if claims_data is None:
        logger.warning(
            "No JSON array of claim objects found in response; first 200 chars: %r",
            response[:200],
        )
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
