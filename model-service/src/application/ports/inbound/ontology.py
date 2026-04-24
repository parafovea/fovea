"""Ontology Service port definition.

This module defines the interface for ontology augmentation services.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class OntologyTypeOutput:
    """Ontology type suggestion in output."""

    name: str
    description: str
    confidence: float
    parent: str | None = None
    examples: list[str] = field(default_factory=list)


@dataclass
class AugmentInput:
    """Input for ontology augmentation.

    Parameters
    ----------
    persona_id : str
        Unique identifier for the persona.
    domain : str
        Domain description for context.
    existing_types : list[str]
        Existing type names.
    target_category : OntologyCategory
        Category to augment.
    max_suggestions : int
        Maximum suggestions to return.
    """

    persona_id: str
    domain: str
    target_category: str
    existing_types: list[str] = field(default_factory=list)
    max_suggestions: int = 10


@dataclass
class AugmentOutput:
    """Output from ontology augmentation.

    Parameters
    ----------
    result_id : str
        Unique identifier for this augmentation.
    persona_id : str
        Persona identifier.
    target_category : str
        Category that was augmented.
    suggestions : list[OntologyTypeOutput]
        Suggested types.
    reasoning : str
        Explanation of suggestions.
    """

    result_id: str
    persona_id: str
    target_category: str
    suggestions: list[OntologyTypeOutput]
    reasoning: str


class IOntologyService(ABC):
    """Interface for ontology augmentation services.

    Implementors provide ontology type suggestions.
    """

    @abstractmethod
    async def augment(self, input: AugmentInput) -> AugmentOutput:
        """Generate ontology type suggestions.

        Parameters
        ----------
        input : AugmentInput
            Augmentation parameters.

        Returns
        -------
        AugmentOutput
            Suggested types with reasoning.

        Raises
        ------
        InferenceError
            If augmentation fails.
        """
        pass
