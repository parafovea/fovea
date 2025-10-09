"""Ontology augmentation using language models.

This module provides functionality to suggest new ontology types (EntityType,
EventType, RoleType) based on existing types and domain descriptions using
language models. It includes prompt templates, LLM integration, response parsing,
and confidence scoring.
"""

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .llm_loader import GenerationConfig, LLMConfig, LLMLoader
from .models import OntologyType

logger = logging.getLogger(__name__)


@dataclass
class AugmentationContext:
    """Context for ontology augmentation.

    Parameters
    ----------
    domain : str
        Domain description (e.g., "Wildlife research tracking marine mammals").
    existing_types : list[str]
        List of existing type names in the ontology.
    target_category : str
        Category to augment ("entity", "event", "role", or "relation").
    persona_role : str | None, default=None
        Role of the persona (e.g., "Marine Biologist").
    information_need : str | None, default=None
        Specific information needs of the persona.
    """

    domain: str
    existing_types: list[str]
    target_category: str
    persona_role: str | None = None
    information_need: str | None = None


MIN_DESCRIPTION_LENGTH = 20
MIN_EXAMPLES_COUNT = 2
HIGH_CONFIDENCE_THRESHOLD = 0.8


def create_augmentation_prompt(context: AugmentationContext, max_suggestions: int = 10) -> str:
    """Create a prompt for ontology type augmentation.

    Parameters
    ----------
    context : AugmentationContext
        Context containing domain, existing types, and target category.
    max_suggestions : int, default=10
        Maximum number of suggestions to request.

    Returns
    -------
    str
        Formatted prompt for the language model.
    """
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

    prompt = f"""You are an expert in ontology design for video annotation systems. Your task is to suggest new {context.target_category} types for a domain-specific ontology.

Domain: {context.domain}{persona_context}

Existing {context.target_category} types: {existing_types_str}

Definition:
{instructions['definition']}

Example from a different domain:
{instructions['examples']}

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

    return prompt  # noqa: RET504


def parse_llm_response(response_text: str) -> list[dict[str, Any]]:
    """Parse LLM response text into structured type suggestions.

    Parameters
    ----------
    response_text : str
        Raw text response from the language model.

    Returns
    -------
    list[dict[str, Any]]
        List of parsed type dictionaries with name, description, parent, examples.

    Raises
    ------
    ValueError
        If the response cannot be parsed or is invalid.
    """
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

    validated_types = []
    for item in parsed:
        if not isinstance(item, dict):
            logger.warning(f"Skipping non-dict item: {item}")
            continue

        if "name" not in item or "description" not in item:
            logger.warning(f"Skipping item missing required fields: {item}")
            continue

        validated_item = {
            "name": str(item["name"]).strip(),
            "description": str(item["description"]).strip(),
            "parent": str(item["parent"]).strip() if item.get("parent") else None,
            "examples": (
                [str(ex).strip() for ex in item["examples"]] if "examples" in item else []
            ),
        }

        validated_types.append(validated_item)

    return validated_types


def calculate_confidence(suggestion: dict[str, Any], context: AugmentationContext) -> float:
    """Calculate confidence score for a type suggestion.

    Parameters
    ----------
    suggestion : dict[str, Any]
        Parsed type suggestion with name, description, parent, examples.
    context : AugmentationContext
        Original augmentation context.

    Returns
    -------
    float
        Confidence score between 0.0 and 1.0.
    """
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


async def augment_ontology_with_llm(
    context: AugmentationContext,
    llm_config: LLMConfig,
    max_suggestions: int = 10,
    cache_dir: Path | None = None,
) -> list[OntologyType]:
    """Suggest new ontology types using a language model.

    Parameters
    ----------
    context : AugmentationContext
        Context containing domain, existing types, and target category.
    llm_config : LLMConfig
        Configuration for the language model to use.
    max_suggestions : int, default=10
        Maximum number of type suggestions to generate.
    cache_dir : Path | None, default=None
        Directory for caching model weights.

    Returns
    -------
    list[OntologyType]
        List of suggested ontology types with confidence scores.

    Raises
    ------
    RuntimeError
        If LLM loading or generation fails.
    ValueError
        If LLM response cannot be parsed.
    """
    loader = LLMLoader(llm_config, cache_dir)

    try:
        await loader.load()

        prompt = create_augmentation_prompt(context, max_suggestions)

        generation_config = GenerationConfig(
            max_tokens=2048,
            temperature=0.7,
            top_p=0.9,
            stop_sequences=None,
        )

        result = await loader.generate(prompt, generation_config)

        parsed_suggestions = parse_llm_response(result.text)

        suggestions = []
        for suggestion_dict in parsed_suggestions:
            confidence = calculate_confidence(suggestion_dict, context)

            suggestion = OntologyType(
                name=suggestion_dict["name"],
                description=suggestion_dict["description"],
                parent=suggestion_dict.get("parent"),
                confidence=confidence,
                examples=suggestion_dict.get("examples", []),
            )
            suggestions.append(suggestion)

        suggestions.sort(key=lambda x: x.confidence, reverse=True)

        return suggestions[:max_suggestions]

    finally:
        await loader.unload()


def generate_augmentation_reasoning(
    suggestions: list[OntologyType], context: AugmentationContext
) -> str:
    """Generate explanation for why types were suggested.

    Parameters
    ----------
    suggestions : list[OntologyType]
        List of suggested types.
    context : AugmentationContext
        Original augmentation context.

    Returns
    -------
    str
        Human-readable explanation of the suggestions.
    """
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
