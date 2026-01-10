"""Summary synthesis from claim hierarchies.

This module provides functions for generating coherent narrative summaries
from structured claim hierarchies. Supports:
- Single-source synthesis (one video's claims)
- Multi-source synthesis (multiple videos' claims for collections)
- Conflict detection and resolution
- Hierarchical claim structure preservation
- Claim relation integration (supports, conflicts, etc.)
"""

import logging
from typing import Any

from .llm_loader import GenerationConfig, LLMLoader
from .models import ClaimRelationship, ClaimSource

logger = logging.getLogger(__name__)


async def synthesize_summary_from_claims(
    claim_sources: list[ClaimSource],
    claim_relations: list[ClaimRelationship] | None,
    synthesis_strategy: str,
    ontology_context: dict[str, Any] | None,
    persona_context: dict[str, Any] | None,
    llm_loader: LLMLoader,
    max_length: int,
    include_conflicts: bool,
    include_citations: bool,
) -> list[dict[str, Any]]:
    """Synthesize narrative summary from claim hierarchies.

    Parameters
    ----------
    claim_sources : list[ClaimSource]
        Claim hierarchies from one or more videos/collections.
    claim_relations : list[ClaimRelationship] | None
        Relationships between claims (conflicts, support, etc.).
    synthesis_strategy : str
        Strategy: "hierarchical", "chronological", "narrative", "analytical".
    ontology_context : dict[str, Any] | None
        Ontology types and glosses for context.
    persona_context : dict[str, Any] | None
        Persona information for perspective.
    llm_loader : LLMLoader
        Loaded LLM for generation.
    max_length : int
        Maximum summary length in words.
    include_conflicts : bool
        Whether to explicitly mention conflicts.
    include_citations : bool
        Whether to include claim citations.

    Returns
    -------
    list[dict[str, Any]]
        Summary as GlossItem array with # and @ references.
    """
    # Build synthesis prompt
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

    # Generate summary using LLM
    generation_config = GenerationConfig(
        max_tokens=8192,  # Larger for complex syntheses
        temperature=0.8,
        top_p=0.9,
        stop_sequences=["---END---"],
    )

    logger.info(
        "Synthesizing summary using strategy: %s from %d source(s)",
        synthesis_strategy,
        len(claim_sources),
    )
    result = await llm_loader.generate(prompt=prompt, generation_config=generation_config)

    # For now, return summary as simple text GlossItem
    # TODO: Parse #/@/^ references and convert to proper GlossItem structure
    summary_gloss = [{"type": "text", "content": result.text}]

    logger.info("Synthesized summary with %d gloss items", len(summary_gloss))
    return summary_gloss


def build_synthesis_prompt(
    claim_sources: list[ClaimSource],
    claim_relations: list[ClaimRelationship] | None,
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
    claim_sources : list[ClaimSource]
        Claim hierarchies from sources.
    claim_relations : list[ClaimRelationship] | None
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

    # Add persona context if provided
    if persona_context:
        role = persona_context.get("role", "")
        info_need = persona_context.get("information_need", "")
        if role:
            prompt_parts.append(f"PERSONA ROLE: {role}")
        if info_need:
            prompt_parts.append(f"INFORMATION NEED: {info_need}")
        if role or info_need:
            prompt_parts.append("")

    # Add ontology context if provided
    if ontology_context and ontology_context.get("types"):
        prompt_parts.append("ONTOLOGY TYPES (for reference):")
        for type_def in ontology_context["types"][:20]:  # Limit to 20 types
            type_name = type_def.get("name")
            type_gloss = ontology_context.get("glosses", {}).get(type_def.get("id"), "")
            if type_gloss:
                prompt_parts.append(f"  - #{type_name}: {type_gloss}")
            else:
                prompt_parts.append(f"  - #{type_name}")
        prompt_parts.append("")

    # Add claim sources
    prompt_parts.append("CLAIMS TO SYNTHESIZE:")
    prompt_parts.append("")
    for i, source in enumerate(claim_sources, 1):
        source_label = (
            source.metadata.get("title", source.source_id) if source.metadata else source.source_id
        )
        prompt_parts.append(f"Source {i}: {source_label} ({source.source_type})")
        prompt_parts.extend(_format_claims_hierarchy(source.claims, indent=1))
        prompt_parts.append("")

    # Add claim relationships if provided and conflicts should be included
    if claim_relations and include_conflicts:
        conflicts = [
            r for r in claim_relations if r.relation_type in ["conflicts_with", "contradicts"]
        ]
        if conflicts:
            prompt_parts.append("CONFLICTS DETECTED:")
            for conflict in conflicts[:10]:  # Limit to 10
                prompt_parts.append(
                    f"  - Claim {conflict.source_claim_id} {conflict.relation_type} "
                    f"Claim {conflict.target_claim_id}"
                )
                if conflict.notes:
                    prompt_parts.append(f"    Note: {conflict.notes}")
            prompt_parts.append("")

    # Add strategy-specific instructions
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
    else:  # analytical
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

        # Format claim line
        line = f"{prefix}- {claim_text}"
        if claim_id:
            line += f" [id: {claim_id}]"
        if confidence is not None:
            line += f" (confidence: {confidence:.2f})"
        lines.append(line)

        # Recursively add subclaims
        subclaims = claim.get("subclaims", [])
        if subclaims:
            lines.extend(_format_claims_hierarchy(subclaims, indent + 1))

    return lines
