"""Confidence score value object.

This module defines an immutable value object for confidence scores with
validated bounds between 0.0 and 1.0.
"""

import math
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ConfidenceScore:
    """Immutable confidence score value between 0.0 and 1.0.

    Parameters
    ----------
    value : float
        Confidence value (must be between 0.0 and 1.0).

    Raises
    ------
    ValueError
        If value is outside the valid range.

    Examples
    --------
    >>> score = ConfidenceScore(0.85)
    >>> score.value
    0.85
    >>> score.as_percentage()
    85.0
    """

    value: float

    def __post_init__(self) -> None:
        """Validate that value is within bounds."""
        if not 0.0 <= self.value <= 1.0:
            raise ValueError(f"Confidence score must be between 0.0 and 1.0, got {self.value}")

    def as_percentage(self) -> float:
        """Return confidence as a percentage.

        Returns
        -------
        float
            Confidence as percentage (0-100).
        """
        return self.value * 100.0

    def is_high(self, threshold: float = 0.8) -> bool:
        """Check if confidence exceeds a threshold.

        Parameters
        ----------
        threshold : float, default=0.8
            Threshold for "high" confidence.

        Returns
        -------
        bool
            True if confidence exceeds threshold.
        """
        return self.value >= threshold

    def is_low(self, threshold: float = 0.3) -> bool:
        """Check if confidence is below a threshold.

        Parameters
        ----------
        threshold : float, default=0.3
            Threshold for "low" confidence.

        Returns
        -------
        bool
            True if confidence is below threshold.
        """
        return self.value < threshold

    @classmethod
    def from_logit(cls, logit: float) -> ConfidenceScore:
        """Create confidence score from a logit value.

        Parameters
        ----------
        logit : float
            Logit value (unbounded).

        Returns
        -------
        ConfidenceScore
            Confidence score after sigmoid transformation.
        """
        probability = 1.0 / (1.0 + math.exp(-logit))
        return cls(probability)

    def __float__(self) -> float:
        """Convert to float."""
        return self.value

    def __lt__(self, other: ConfidenceScore) -> bool:
        """Less than comparison."""
        return self.value < other.value

    def __le__(self, other: ConfidenceScore) -> bool:
        """Less than or equal comparison."""
        return self.value <= other.value

    def __gt__(self, other: ConfidenceScore) -> bool:
        """Greater than comparison."""
        return self.value > other.value

    def __ge__(self, other: ConfidenceScore) -> bool:
        """Greater than or equal comparison."""
        return self.value >= other.value
