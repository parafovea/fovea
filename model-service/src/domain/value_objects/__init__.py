"""Domain value objects.

This package contains immutable value objects that represent domain concepts
with validated constraints. Value objects are compared by value, not identity.
"""

from src.domain.value_objects.bounding_box import AbsoluteBBox, NormalizedBBox
from src.domain.value_objects.confidence_score import ConfidenceScore
from src.domain.value_objects.timestamp import TimeRange, Timestamp

__all__ = [
    "AbsoluteBBox",
    "ConfidenceScore",
    "NormalizedBBox",
    "TimeRange",
    "Timestamp",
]
