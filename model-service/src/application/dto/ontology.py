"""DTOs for ontology augmentation use cases.

These are framework-neutral data transfer objects used by application-layer
use cases. They intentionally avoid any dependency on FastAPI, Pydantic
web schemas, or infrastructure types.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class OntologyTypeDTO:
    """Suggested ontology type produced by augmentation.

    Parameters
    ----------
    name : str
        Type name.
    description : str
        Type description.
    parent : str | None
        Parent type name.
    confidence : float
        Confidence score in [0.0, 1.0].
    examples : list[str]
        Example instances.
    """

    name: str
    description: str
    parent: str | None = None
    confidence: float = 0.0
    examples: list[str] = field(default_factory=list)
