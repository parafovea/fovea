"""Ontology domain entities.

This module defines entities for representing ontology types and
augmentation results.
"""

from dataclasses import dataclass, field
from typing import Any

from src.domain.value_objects import ConfidenceScore


@dataclass
class OntologyType:
    """A suggested ontology type from augmentation.

    Parameters
    ----------
    name : str
        Type name.
    description : str
        Type description.
    confidence : ConfidenceScore
        Confidence in the suggestion.
    parent : str | None
        Parent type name in hierarchy.
    examples : list[str]
        Example instances of this type.
    """

    name: str
    description: str
    confidence: ConfidenceScore
    parent: str | None = None
    examples: list[str] = field(default_factory=list)

    @property
    def has_parent(self) -> bool:
        """Check if type has a parent."""
        return self.parent is not None

    @property
    def example_count(self) -> int:
        """Number of examples provided."""
        return len(self.examples)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation.

        Returns
        -------
        dict[str, Any]
            Dictionary representation.
        """
        return {
            "name": self.name,
            "description": self.description,
            "confidence": self.confidence.value,
            "parent": self.parent,
            "examples": self.examples,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "OntologyType":
        """Create from dictionary representation.

        Parameters
        ----------
        data : dict[str, Any]
            Dictionary with ontology type data.

        Returns
        -------
        OntologyType
            New ontology type instance.
        """
        return cls(
            name=data["name"],
            description=data["description"],
            confidence=ConfidenceScore(data.get("confidence", 0.0)),
            parent=data.get("parent"),
            examples=data.get("examples", []),
        )


@dataclass
class AugmentationResult:
    """Result of ontology augmentation.

    Parameters
    ----------
    result_id : str
        Unique result identifier.
    persona_id : str
        Persona used for augmentation.
    target_category : str
        Category that was augmented.
    suggestions : list[OntologyType]
        Suggested ontology types.
    reasoning : str
        Explanation of suggestions.
    model_used : str
        Model used for augmentation.
    processing_time : float
        Processing time in seconds.
    """

    result_id: str
    persona_id: str
    target_category: str
    suggestions: list[OntologyType]
    reasoning: str
    model_used: str
    processing_time: float

    @property
    def suggestion_count(self) -> int:
        """Number of suggestions."""
        return len(self.suggestions)

    def filter_by_confidence(
        self, min_confidence: float = 0.5
    ) -> list[OntologyType]:
        """Get suggestions above confidence threshold.

        Parameters
        ----------
        min_confidence : float, default=0.5
            Minimum confidence threshold.

        Returns
        -------
        list[OntologyType]
            Suggestions above threshold.
        """
        return [
            s for s in self.suggestions if s.confidence.value >= min_confidence
        ]

    def get_top_suggestions(self, n: int = 5) -> list[OntologyType]:
        """Get top N suggestions by confidence.

        Parameters
        ----------
        n : int, default=5
            Number of suggestions to return.

        Returns
        -------
        list[OntologyType]
            Top N suggestions sorted by confidence.
        """
        sorted_suggestions = sorted(
            self.suggestions, key=lambda s: s.confidence.value, reverse=True
        )
        return sorted_suggestions[:n]
