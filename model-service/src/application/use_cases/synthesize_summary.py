"""Summary synthesis from claim hierarchies.

This module provides functions for generating coherent narrative summaries
from structured claim hierarchies. Supports:
- Single-source synthesis (one video's claims)
- Multi-source synthesis (multiple videos' claims for collections)
- Conflict detection and resolution
- Hierarchical claim structure preservation
- Claim relation integration (supports, conflicts, etc.)

The use case is framework-neutral. It accepts DTOs and an injected
``ILanguageModel`` port; the concrete adapter is wired at the composition
root.
"""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any

from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

from src.application.dto.generation import GenerationConfigDTO
from src.application.dto.reasoning_parser import parse_reasoned_output

if TYPE_CHECKING:
    from src.application.dto.claims import ClaimRelationshipDTO, ClaimSourceDTO
    from src.application.dto.reasoning import ThinkingTrace
    from src.application.ports.outbound.llm import ILanguageModel

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)


# Reference marker parsing: #name = type, @name = object, ^name = annotation.
# A marker name is alphanumeric, underscores, hyphens, or periods.
_MARKER_PATTERN = re.compile(r"([#@^])([A-Za-z_][\w.\-]*)")

_MARKER_TYPE: dict[str, str] = {
    "#": "typeRef",
    "@": "objectRef",
    "^": "annotationRef",
}


def parse_reference_markers(text: str) -> list[dict[str, str]]:
    """Parse ``#/@/^`` markers into a GlossItem array.

    Parameters
    ----------
    text : str
        Raw text with inline reference markers.

    Returns
    -------
    list[dict[str, str]]
        Ordered list of gloss items. Each item has keys ``type`` and
        ``content``. ``type`` is one of ``text``, ``typeRef``, ``objectRef``,
        or ``annotationRef``.
    """
    if not text:
        return []

    items: list[dict[str, str]] = []
    last_end = 0

    for match in _MARKER_PATTERN.finditer(text):
        start, end = match.span()
        if start > last_end:
            items.append({"type": "text", "content": text[last_end:start]})
        marker, name = match.group(1), match.group(2)
        items.append({"type": _MARKER_TYPE[marker], "content": name})
        last_end = end

    if last_end < len(text):
        items.append({"type": "text", "content": text[last_end:]})

    return items


class SynthesizeSummaryUseCase:
    """Use case for synthesizing narrative summaries from claim hierarchies."""

    def __init__(self, language_model: ILanguageModel) -> None:
        """Initialize the use case with required ports.

        Parameters
        ----------
        language_model : ILanguageModel
            Loaded language model port for text generation.
        """
        self._llm = language_model
        self.last_reasoning_trace: ThinkingTrace | None = None

    async def execute(
        self,
        *,
        claim_sources: list[ClaimSourceDTO],
        claim_relations: list[ClaimRelationshipDTO] | None,
        synthesis_strategy: str,
        ontology_context: dict[str, Any] | None,
        persona_context: dict[str, Any] | None,
        max_length: int,
        include_conflicts: bool,
        include_citations: bool,
    ) -> list[dict[str, str]]:
        """Synthesize a narrative summary.

        Parameters
        ----------
        claim_sources : list[ClaimSourceDTO]
            Claim hierarchies from one or more sources.
        claim_relations : list[ClaimRelationshipDTO] | None
            Relationships between claims.
        synthesis_strategy : str
            Strategy: "hierarchical", "chronological", "narrative", or
            "analytical".
        ontology_context : dict[str, Any] | None
            Ontology types and glosses.
        persona_context : dict[str, Any] | None
            Persona information.
        max_length : int
            Maximum summary length in words.
        include_conflicts : bool
            Whether to mention conflicts.
        include_citations : bool
            Whether to include citations.

        Returns
        -------
        list[dict[str, str]]
            GlossItem array.
        """
        with tracer.start_as_current_span("use_case.synthesize_summary") as span:
            span.set_attribute("use_case.synthesis_strategy", synthesis_strategy)
            span.set_attribute("use_case.source_count", len(claim_sources))
            span.set_attribute("use_case.max_length", max_length)
            span.set_attribute(
                "use_case.relation_count",
                len(claim_relations) if claim_relations else 0,
            )
            try:
                prompt = build_synthesis_prompt(
                    claim_sources=claim_sources,
                    claim_relations=claim_relations,
                    synthesis_strategy=synthesis_strategy,
                    ontology_context=ontology_context,
                    persona_context=persona_context,
                    max_length=max_length,
                    include_conflicts=include_conflicts,
                    include_citations=include_citations,
                )

                config = GenerationConfigDTO(
                    max_tokens=8192,
                    temperature=0.8,
                    top_p=0.9,
                    stop_sequences=["---END---"],
                )

                logger.info(
                    "Synthesizing summary using strategy: %s from %d source(s)",
                    synthesis_strategy,
                    len(claim_sources),
                )
                result = await self._llm.generate_with_config(prompt=prompt, config=config)

                reasoned = parse_reasoned_output(
                    result.text,
                    model_id=self._llm.model_id,
                    tokens_used=result.tokens_used,
                )
                self.last_reasoning_trace = reasoned.thinking
                summary_gloss = parse_reference_markers(reasoned.text)
                span.set_attribute("use_case.output_gloss_items", len(summary_gloss))
                logger.info("Synthesized summary with %d gloss items", len(summary_gloss))
                return summary_gloss
            except Exception as exc:
                span.record_exception(exc)
                span.set_status(Status(StatusCode.ERROR))
                raise


async def synthesize_summary_from_claims(
    claim_sources: list[ClaimSourceDTO],
    claim_relations: list[ClaimRelationshipDTO] | None,
    synthesis_strategy: str,
    ontology_context: dict[str, Any] | None,
    persona_context: dict[str, Any] | None,
    language_model: ILanguageModel,
    max_length: int,
    include_conflicts: bool,
    include_citations: bool,
) -> list[dict[str, str]]:
    """Functional entry point for summary synthesis.

    Thin wrapper over :class:`SynthesizeSummaryUseCase` for call sites
    and tests that prefer a function-style API.
    """
    use_case = SynthesizeSummaryUseCase(language_model=language_model)
    return await use_case.execute(
        claim_sources=claim_sources,
        claim_relations=claim_relations,
        synthesis_strategy=synthesis_strategy,
        ontology_context=ontology_context,
        persona_context=persona_context,
        max_length=max_length,
        include_conflicts=include_conflicts,
        include_citations=include_citations,
    )


def build_synthesis_prompt(
    claim_sources: list[ClaimSourceDTO],
    claim_relations: list[ClaimRelationshipDTO] | None,
    synthesis_strategy: str,
    ontology_context: dict[str, Any] | None,
    persona_context: dict[str, Any] | None,
    max_length: int,
    include_conflicts: bool,
    include_citations: bool,
) -> str:
    """Build LLM prompt for summary synthesis.

    Parameters
    ----------
    claim_sources : list[ClaimSourceDTO]
        Claim hierarchies from sources.
    claim_relations : list[ClaimRelationshipDTO] | None
        Relationships between claims.
    synthesis_strategy : str
        Synthesis strategy.
    ontology_context : dict[str, Any] | None
        Ontology types and glosses.
    persona_context : dict[str, Any] | None
        Persona information.
    max_length : int
        Maximum summary length.
    include_conflicts : bool
        Explicitly mention conflicts.
    include_citations : bool
        Include citations.

    Returns
    -------
    str
        Formatted prompt for LLM.
    """
    prompt_parts = [
        "You are an expert at synthesizing coherent narratives from structured claims.",
        "",
    ]

    if persona_context:
        role = persona_context.get("role", "")
        info_need = persona_context.get("information_need", "")
        if role:
            prompt_parts.append(f"PERSONA ROLE: {role}")
        if info_need:
            prompt_parts.append(f"INFORMATION NEED: {info_need}")
        if role or info_need:
            prompt_parts.append("")

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

    prompt_parts.append("CLAIMS TO SYNTHESIZE:")
    prompt_parts.append("")
    for i, source in enumerate(claim_sources, 1):
        source_label = (
            source.metadata.get("title", source.source_id) if source.metadata else source.source_id
        )
        prompt_parts.append(f"Source {i}: {source_label} ({source.source_type})")
        prompt_parts.extend(_format_claims_hierarchy(source.claims, indent=1))
        prompt_parts.append("")

    if claim_relations and include_conflicts:
        conflicts = [
            r for r in claim_relations if r.relation_type in ["conflicts_with", "contradicts"]
        ]
        if conflicts:
            prompt_parts.append("CONFLICTS DETECTED:")
            for conflict in conflicts[:10]:
                prompt_parts.append(
                    f"  - Claim {conflict.source_claim_id} {conflict.relation_type} "
                    f"Claim {conflict.target_claim_id}"
                )
                if conflict.notes:
                    prompt_parts.append(f"    Note: {conflict.notes}")
            prompt_parts.append("")

    if synthesis_strategy == "hierarchical":
        prompt_parts.extend(
            [
                "TASK: Synthesize a coherent summary following the hierarchical claim structure.",
                "",
                "INSTRUCTIONS:",
                "1. Organize the summary following the claim hierarchy",
                "2. Start with top-level claims, then incorporate subclaims as supporting details",
                "3. Maintain logical flow and coherence",
                "4. Use # syntax for types (e.g., #Person, #Event)",
                "5. Use @ syntax for specific objects (e.g., @JohnDoe, @Location)",
                f"6. Keep summary under {max_length} words",
            ]
        )
    elif synthesis_strategy == "chronological":
        prompt_parts.extend(
            [
                "TASK: Synthesize a chronological narrative from the claims.",
                "",
                "INSTRUCTIONS:",
                "1. Identify temporal claims and order events chronologically",
                "2. Create a narrative flow showing progression over time",
                "3. Use temporal markers (dates, times, sequences)",
                "4. Use # syntax for types and @ for objects",
                f"5. Keep summary under {max_length} words",
            ]
        )
    elif synthesis_strategy == "narrative":
        prompt_parts.extend(
            [
                "TASK: Synthesize an engaging narrative summary from the claims.",
                "",
                "INSTRUCTIONS:",
                "1. Create a story-like flow with introduction, body, conclusion",
                "2. Connect claims with narrative transitions",
                "3. Emphasize key events and relationships",
                "4. Use # syntax for types and @ for objects",
                f"5. Keep summary under {max_length} words",
            ]
        )
    else:
        prompt_parts.extend(
            [
                "TASK: Synthesize an analytical summary emphasizing evidence and conflicts.",
                "",
                "INSTRUCTIONS:",
                "1. Present claims with supporting and conflicting evidence",
                "2. Explicitly mention contradictions and uncertainties",
                '3. Use analytical language ("suggests", "contradicts", "supports")',
                "4. Use # syntax for types and @ for objects",
                f"5. Keep summary under {max_length} words",
            ]
        )

    if include_conflicts and claim_relations:
        prompt_parts.append("7. Explicitly mention detected conflicts in the narrative")

    if include_citations:
        prompt_parts.append("8. Include claim IDs as inline citations (e.g., [claim-123])")

    prompt_parts.extend(
        [
            "",
            "OUTPUT FORMAT:",
            "Write a coherent narrative summary incorporating the claims above.",
            "Use natural language with # and @ references where appropriate.",
            "",
            "Summary:",
        ]
    )

    return "\n".join(prompt_parts)


def _format_claims_hierarchy(claims: list[dict[str, Any]], indent: int = 0) -> list[str]:
    """Format claim hierarchy for prompt.

    Parameters
    ----------
    claims : list[dict[str, Any]]
        List of claim dictionaries.
    indent : int
        Current indentation level.

    Returns
    -------
    list[str]
        Formatted claim text lines.
    """
    lines = []
    prefix = "  " * indent

    for claim in claims:
        claim_text = claim.get("text", "")
        claim_id = claim.get("id", "")
        confidence = claim.get("confidence")

        line = f"{prefix}- {claim_text}"
        if claim_id:
            line += f" [id: {claim_id}]"
        if confidence is not None:
            line += f" (confidence: {confidence:.2f})"
        lines.append(line)

        subclaims = claim.get("subclaims", [])
        if subclaims:
            lines.extend(_format_claims_hierarchy(subclaims, indent + 1))

    return lines
