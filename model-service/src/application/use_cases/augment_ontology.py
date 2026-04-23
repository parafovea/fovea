"""Ontology augmentation using language models.

This module provides functionality to suggest new ontology types (EntityType,
EventType, RoleType, RelationType) based on existing types and domain
descriptions using language models. The use case is framework-neutral: it
depends only on DTOs and the ``ILanguageModel`` / ``IExternalAPIRouter`` ports.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

from src.application.dto.generation import GenerationConfigDTO
from src.application.dto.ontology import OntologyTypeDTO
from src.application.dto.reasoning_parser import parse_reasoned_output

if TYPE_CHECKING:
    from src.application.dto.external_api import ExternalAPIConfigDTO
    from src.application.dto.reasoning import ThinkingTrace
    from src.application.ports.outbound.external_api_router import IExternalAPIRouter
    from src.application.ports.outbound.llm import ILanguageModel

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)


@dataclass
class AugmentationContext:
    """Context for ontology augmentation."""

    domain: str
    existing_types: list[str]
    target_category: str
    persona_role: str | None = None
    information_need: str | None = None


MIN_DESCRIPTION_LENGTH = 20
MIN_EXAMPLES_COUNT = 2
HIGH_CONFIDENCE_THRESHOLD = 0.8


def create_augmentation_prompt(context: AugmentationContext, max_suggestions: int = 10) -> str:
    """Create a prompt for ontology type augmentation."""
    category_instructions = {
        "entity": {
            "definition": "Entity types represent categories of physical or abstract objects that can be observed, identified, and tracked in videos.",
            "examples": "For a retail domain: Customer, Product, Employee, Shopping Cart, Payment Terminal",
        },
        "event": {
            "definition": "Event types represent categories of actions, occurrences, or state changes that happen at specific times.",
            "examples": "For a sports domain: Pitch, Swing, Catch, Slide, Home Run",
        },
        "role": {
            "definition": "Role types represent functions or capacities that entities can fulfill in events.",
            "examples": "For a medical domain: Surgeon, Patient, Assistant, Observer, Anesthesiologist",
        },
        "relation": {
            "definition": "Relation types represent semantic connections between entities or events.",
            "examples": "For a film production domain: Contains, Appears With, Replaced By, Preceded By, Located In",
        },
    }

    instructions = category_instructions.get(
        context.target_category, category_instructions["entity"]
    )

    existing_types_str = ", ".join(context.existing_types) if context.existing_types else "None"

    persona_context = ""
    if context.persona_role:
        persona_context += f"\n- Persona Role: {context.persona_role}"
    if context.information_need:
        persona_context += f"\n- Information Need: {context.information_need}"

    return f"""You are an expert in ontology design for video annotation systems. Your task is to suggest new {context.target_category} types for a domain-specific ontology.

Domain: {context.domain}{persona_context}

Existing {context.target_category} types: {existing_types_str}

Definition:
{instructions["definition"]}

Example from a different domain:
{instructions["examples"]}

Task:
Suggest {max_suggestions} new {context.target_category} types that would be useful for this domain. For each type:
1. Provide a concise name (1-3 words, use PascalCase for multi-word names)
2. Provide a clear description (1-2 sentences)
3. If applicable, specify a parent type from the existing types
4. Provide 2-4 concrete examples of instances

Requirements:
- Types should be distinct from existing types
- Types should be relevant to the domain and persona's information needs
- Avoid overly generic or overly specific types
- Focus on types that would actually appear in video content
- Use factual, descriptive language

Output Format:
Return a valid JSON array of objects with this structure:
[
  {{
    "name": "TypeName",
    "description": "Clear description of what this type represents.",
    "parent": "ParentTypeName or null",
    "examples": ["Example1", "Example2", "Example3"]
  }}
]

Return ONLY the JSON array, no additional text or explanation."""


def parse_llm_response(response_text: str) -> list[dict[str, Any]]:
    """Parse LLM response text into structured type suggestions."""
    text = response_text.strip()

    json_match = re.search(r"\[\s*\{.*?\}\s*\]", text, re.DOTALL)
    if json_match:
        text = json_match.group(0)

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON response: {e}")
        logger.debug(f"Response text: {text}")
        raise ValueError(f"Invalid JSON in LLM response: {e}") from e

    if not isinstance(parsed, list):
        raise ValueError("LLM response must be a JSON array")

    validated_types: list[dict[str, Any]] = []
    for item in parsed:
        if not isinstance(item, dict):
            logger.warning(f"Skipping non-dict item: {item}")
            continue

        if "name" not in item or "description" not in item:
            logger.warning(f"Skipping item missing required fields: {item}")
            continue

        validated_types.append(
            {
                "name": str(item["name"]).strip(),
                "description": str(item["description"]).strip(),
                "parent": str(item["parent"]).strip() if item.get("parent") else None,
                "examples": (
                    [str(ex).strip() for ex in item["examples"]] if "examples" in item else []
                ),
            }
        )

    return validated_types


def calculate_confidence(suggestion: dict[str, Any], context: AugmentationContext) -> float:
    """Calculate confidence score for a type suggestion."""
    confidence = 0.5

    if suggestion["name"] and len(suggestion["name"]) > 0:
        confidence += 0.1

    if suggestion["description"] and len(suggestion["description"]) >= MIN_DESCRIPTION_LENGTH:
        confidence += 0.15

    if suggestion["examples"] and len(suggestion["examples"]) >= MIN_EXAMPLES_COUNT:
        confidence += 0.1

    if suggestion["parent"] and suggestion["parent"] in context.existing_types:
        confidence += 0.15
    elif suggestion["name"] and len(suggestion["name"]) > 0:
        confidence -= 0.1

    name_lower = suggestion["name"].lower()
    domain_lower = context.domain.lower()
    domain_words = set(domain_lower.split())

    name_words = set(re.findall(r"\b\w+\b", name_lower))
    if name_words & domain_words:
        confidence += 0.1

    return min(confidence, 1.0)


def extract_json_from_response(response_text: str) -> str:
    """Extract JSON from LLM response, handling markdown code blocks."""
    text = response_text.strip()

    json_code_block = re.search(r"```json\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
    if json_code_block:
        return json_code_block.group(1).strip()

    code_block = re.search(r"```\s*(.*?)\s*```", text, re.DOTALL)
    if code_block:
        return code_block.group(1).strip()

    return text


class AugmentOntologyUseCase:
    """Use case for ontology augmentation via a language model or external API."""

    def __init__(
        self,
        *,
        language_model: ILanguageModel | None = None,
        external_router: IExternalAPIRouter | None = None,
    ) -> None:
        """Initialize with at least one generation backend.

        Parameters
        ----------
        language_model : ILanguageModel | None
            Local language model port. Used by ``execute_local``.
        external_router : IExternalAPIRouter | None
            External API router port. Used by ``execute_external``.
        """
        self._llm = language_model
        self._router = external_router

    async def execute_local(
        self,
        *,
        context: AugmentationContext,
        max_suggestions: int = 10,
    ) -> list[OntologyTypeDTO]:
        """Suggest new types using the injected local language model."""
        with tracer.start_as_current_span("use_case.augment_ontology.local") as span:
            span.set_attribute("use_case.domain", context.domain)
            span.set_attribute("use_case.target_category", context.target_category)
            span.set_attribute("use_case.existing_types_count", len(context.existing_types))
            span.set_attribute("use_case.max_suggestions", max_suggestions)
            try:
                if self._llm is None:
                    raise RuntimeError("Local language model port not provided")

                prompt = create_augmentation_prompt(context, max_suggestions)
                config = GenerationConfigDTO(max_tokens=2048, temperature=0.7, top_p=0.9)
                result = await self._llm.generate_with_config(prompt=prompt, config=config)
                reasoned = parse_reasoned_output(
                    result.text,
                    model_id=self._llm.model_id,
                    tokens_used=result.tokens_used,
                )
                suggestions = _suggestions_from_response(reasoned.text, context, max_suggestions)
                if reasoned.thinking is not None:
                    suggestions = [
                        _attach_ontology_trace(s, reasoned.thinking) for s in suggestions
                    ]
                span.set_attribute("use_case.suggestions_count", len(suggestions))
                return suggestions
            except Exception as exc:
                span.record_exception(exc)
                span.set_status(Status(StatusCode.ERROR))
                raise

    async def execute_external(
        self,
        *,
        context: AugmentationContext,
        api_config: ExternalAPIConfigDTO,
        provider: str,
        max_suggestions: int = 10,
    ) -> list[OntologyTypeDTO]:
        """Suggest new types using an external provider API."""
        with tracer.start_as_current_span("use_case.augment_ontology.external") as span:
            span.set_attribute("use_case.domain", context.domain)
            span.set_attribute("use_case.target_category", context.target_category)
            span.set_attribute("use_case.provider", provider)
            span.set_attribute("use_case.max_suggestions", max_suggestions)
            try:
                if self._router is None:
                    raise RuntimeError("External API router port not provided")

                prompt = create_augmentation_prompt(context, max_suggestions)
                logger.info(f"Calling {provider} API for ontology augmentation")
                try:
                    result = await self._router.generate_text(
                        config=api_config,
                        provider=provider,
                        prompt=prompt,
                        max_tokens=2048,
                        temperature=0.7,
                    )
                    response_text = str(result["text"])
                    usage = result.get("usage", {})
                    span.set_attribute(
                        "use_case.tokens_used", int(usage.get("total_tokens", 0) or 0)
                    )
                    logger.info(
                        f"External API response received. Tokens: {usage.get('total_tokens', 'unknown')}"
                    )
                    reasoned = parse_reasoned_output(
                        response_text,
                        model_id=api_config.model_id,
                        tokens_used=int(usage.get("total_tokens", 0) or 0) or None,
                    )
                    json_text = extract_json_from_response(reasoned.text)
                    suggestions = _suggestions_from_parsed(
                        parse_llm_response(json_text), context, max_suggestions
                    )
                    if reasoned.thinking is not None:
                        suggestions = [
                            _attach_ontology_trace(s, reasoned.thinking) for s in suggestions
                        ]
                    span.set_attribute("use_case.suggestions_count", len(suggestions))
                    return suggestions
                finally:
                    await self._router.close()
            except Exception as exc:
                span.record_exception(exc)
                span.set_status(Status(StatusCode.ERROR))
                raise


def _attach_ontology_trace(suggestion: OntologyTypeDTO, trace: ThinkingTrace) -> OntologyTypeDTO:
    """Return a suggestion DTO with the given thinking trace attached."""
    return OntologyTypeDTO(
        name=suggestion.name,
        description=suggestion.description,
        parent=suggestion.parent,
        confidence=suggestion.confidence,
        examples=list(suggestion.examples),
        reasoning_trace=trace,
    )


def _suggestions_from_response(
    response_text: str, context: AugmentationContext, max_suggestions: int
) -> list[OntologyTypeDTO]:
    """Parse a raw LLM response into ranked suggestion DTOs."""
    parsed = parse_llm_response(response_text)
    return _suggestions_from_parsed(parsed, context, max_suggestions)


def _suggestions_from_parsed(
    parsed: list[dict[str, Any]], context: AugmentationContext, max_suggestions: int
) -> list[OntologyTypeDTO]:
    """Convert parsed suggestion dicts into ranked DTOs."""
    suggestions: list[OntologyTypeDTO] = []
    for item in parsed:
        confidence = calculate_confidence(item, context)
        suggestions.append(
            OntologyTypeDTO(
                name=item["name"],
                description=item["description"],
                parent=item.get("parent"),
                confidence=confidence,
                examples=list(item.get("examples", [])),
            )
        )

    suggestions.sort(key=lambda x: x.confidence, reverse=True)
    return suggestions[:max_suggestions]


async def augment_ontology_with_llm(
    context: AugmentationContext,
    language_model: ILanguageModel,
    max_suggestions: int = 10,
) -> list[OntologyTypeDTO]:
    """Functional entry point backed by a local language model port.

    Parameters
    ----------
    context : AugmentationContext
        Augmentation context.
    language_model : ILanguageModel
        Injected language model port. The model must already be loaded.
    max_suggestions : int
        Maximum number of suggestions to return.

    Returns
    -------
    list[OntologyTypeDTO]
        Ranked suggestion DTOs.
    """
    use_case = AugmentOntologyUseCase(language_model=language_model)
    return await use_case.execute_local(
        context=context,
        max_suggestions=max_suggestions,
    )


async def augment_ontology_with_external_api(
    context: AugmentationContext,
    api_config: ExternalAPIConfigDTO,
    provider: str,
    external_router: IExternalAPIRouter,
    max_suggestions: int = 10,
) -> list[OntologyTypeDTO]:
    """Functional entry point backed by an external API router port."""
    use_case = AugmentOntologyUseCase(external_router=external_router)
    return await use_case.execute_external(
        context=context,
        api_config=api_config,
        provider=provider,
        max_suggestions=max_suggestions,
    )


def generate_augmentation_reasoning(
    suggestions: list[OntologyTypeDTO], context: AugmentationContext
) -> str:
    """Generate explanation for why types were suggested."""
    if not suggestions:
        return f"No suitable {context.target_category} types found for domain: {context.domain}"

    reasoning_parts = [
        f"Generated {len(suggestions)} {context.target_category} type suggestions for the domain: {context.domain}."
    ]

    if context.existing_types:
        reasoning_parts.append(
            f"Suggestions complement {len(context.existing_types)} existing types and focus on types relevant to video annotation tasks."
        )
    else:
        reasoning_parts.append(
            "Suggestions provide foundational types for building a domain-specific ontology."
        )

    avg_confidence = sum(s.confidence for s in suggestions) / len(suggestions)
    reasoning_parts.append(
        f"Average confidence score: {avg_confidence:.2f}. Higher scores indicate better alignment with domain and existing types."
    )

    if suggestions[0].confidence > HIGH_CONFIDENCE_THRESHOLD:
        reasoning_parts.append(
            f"Top suggestion '{suggestions[0].name}' has high confidence based on relevance to domain and quality of description."
        )

    return " ".join(reasoning_parts)
