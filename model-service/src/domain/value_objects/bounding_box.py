"""Bounding box value objects.

This module defines immutable value objects for bounding boxes in both
normalized (0.0-1.0) and absolute (pixel) coordinate systems.
"""

from dataclasses import dataclass
from typing import Self


@dataclass(frozen=True, slots=True)
class NormalizedBBox:
    """Immutable bounding box with normalized coordinates (0.0 to 1.0).

    Coordinates represent positions relative to image dimensions.

    Parameters
    ----------
    x : float
        Left edge x-coordinate (0.0 to 1.0).
    y : float
        Top edge y-coordinate (0.0 to 1.0).
    width : float
        Box width (0.0 to 1.0).
    height : float
        Box height (0.0 to 1.0).

    Raises
    ------
    ValueError
        If any coordinate is outside valid range.
    """

    x: float
    y: float
    width: float
    height: float

    def __post_init__(self) -> None:
        """Validate all coordinates are within bounds."""
        for name, value in [
            ("x", self.x),
            ("y", self.y),
            ("width", self.width),
            ("height", self.height),
        ]:
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{name} must be between 0.0 and 1.0, got {value}")

        if self.x + self.width > 1.0:
            raise ValueError(
                f"x + width exceeds 1.0: {self.x} + {self.width} = {self.x + self.width}"
            )
        if self.y + self.height > 1.0:
            raise ValueError(
                f"y + height exceeds 1.0: {self.y} + {self.height} = {self.y + self.height}"
            )

    @property
    def x2(self) -> float:
        """Right edge x-coordinate."""
        return self.x + self.width

    @property
    def y2(self) -> float:
        """Bottom edge y-coordinate."""
        return self.y + self.height

    @property
    def center_x(self) -> float:
        """Center x-coordinate."""
        return self.x + self.width / 2

    @property
    def center_y(self) -> float:
        """Center y-coordinate."""
        return self.y + self.height / 2

    @property
    def area(self) -> float:
        """Normalized area of the bounding box."""
        return self.width * self.height

    def to_absolute(self, image_width: int, image_height: int) -> "AbsoluteBBox":
        """Convert to absolute pixel coordinates.

        Parameters
        ----------
        image_width : int
            Image width in pixels.
        image_height : int
            Image height in pixels.

        Returns
        -------
        AbsoluteBBox
            Bounding box in pixel coordinates.
        """
        return AbsoluteBBox(
            x=int(self.x * image_width),
            y=int(self.y * image_height),
            width=int(self.width * image_width),
            height=int(self.height * image_height),
            image_width=image_width,
            image_height=image_height,
        )

    def iou(self, other: Self) -> float:
        """Calculate Intersection over Union with another box.

        Parameters
        ----------
        other : NormalizedBBox
            Other bounding box to compare.

        Returns
        -------
        float
            IoU value between 0.0 and 1.0.
        """
        x1 = max(self.x, other.x)
        y1 = max(self.y, other.y)
        x2 = min(self.x2, other.x2)
        y2 = min(self.y2, other.y2)

        if x2 <= x1 or y2 <= y1:
            return 0.0

        intersection = (x2 - x1) * (y2 - y1)
        union = self.area + other.area - intersection

        return intersection / union if union > 0 else 0.0

    def contains_point(self, px: float, py: float) -> bool:
        """Check if a point is inside the bounding box.

        Parameters
        ----------
        px : float
            Point x-coordinate (normalized).
        py : float
            Point y-coordinate (normalized).

        Returns
        -------
        bool
            True if point is inside the box.
        """
        return self.x <= px <= self.x2 and self.y <= py <= self.y2

    def to_dict(self) -> dict[str, float]:
        """Convert to dictionary representation.

        Returns
        -------
        dict[str, float]
            Dictionary with x, y, width, height keys.
        """
        return {
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
        }

    @classmethod
    def from_xyxy(cls, x1: float, y1: float, x2: float, y2: float) -> Self:
        """Create from corner coordinates.

        Parameters
        ----------
        x1 : float
            Left edge x-coordinate.
        y1 : float
            Top edge y-coordinate.
        x2 : float
            Right edge x-coordinate.
        y2 : float
            Bottom edge y-coordinate.

        Returns
        -------
        NormalizedBBox
            New bounding box instance.
        """
        return cls(x=x1, y=y1, width=x2 - x1, height=y2 - y1)

    @classmethod
    def from_center(cls, center_x: float, center_y: float, width: float, height: float) -> Self:
        """Create from center point and dimensions.

        Parameters
        ----------
        center_x : float
            Center x-coordinate.
        center_y : float
            Center y-coordinate.
        width : float
            Box width.
        height : float
            Box height.

        Returns
        -------
        NormalizedBBox
            New bounding box instance.
        """
        return cls(
            x=center_x - width / 2,
            y=center_y - height / 2,
            width=width,
            height=height,
        )


@dataclass(frozen=True, slots=True)
class AbsoluteBBox:
    """Immutable bounding box with absolute pixel coordinates.

    Parameters
    ----------
    x : int
        Left edge x-coordinate in pixels.
    y : int
        Top edge y-coordinate in pixels.
    width : int
        Box width in pixels.
    height : int
        Box height in pixels.
    image_width : int
        Source image width in pixels.
    image_height : int
        Source image height in pixels.

    Raises
    ------
    ValueError
        If coordinates exceed image bounds.
    """

    x: int
    y: int
    width: int
    height: int
    image_width: int
    image_height: int

    def __post_init__(self) -> None:
        """Validate coordinates are within image bounds."""
        if self.x < 0 or self.y < 0:
            raise ValueError(f"Coordinates must be non-negative: ({self.x}, {self.y})")
        if self.width < 0 or self.height < 0:
            raise ValueError(f"Dimensions must be non-negative: ({self.width}, {self.height})")
        if self.x + self.width > self.image_width:
            raise ValueError(
                f"x + width exceeds image width: {self.x + self.width} > {self.image_width}"
            )
        if self.y + self.height > self.image_height:
            raise ValueError(
                f"y + height exceeds image height: {self.y + self.height} > {self.image_height}"
            )

    @property
    def x2(self) -> int:
        """Right edge x-coordinate."""
        return self.x + self.width

    @property
    def y2(self) -> int:
        """Bottom edge y-coordinate."""
        return self.y + self.height

    @property
    def area(self) -> int:
        """Area of the bounding box in pixels."""
        return self.width * self.height

    def to_normalized(self) -> NormalizedBBox:
        """Convert to normalized coordinates.

        Returns
        -------
        NormalizedBBox
            Bounding box in normalized coordinates.
        """
        return NormalizedBBox(
            x=self.x / self.image_width,
            y=self.y / self.image_height,
            width=self.width / self.image_width,
            height=self.height / self.image_height,
        )

    def to_xyxy(self) -> tuple[int, int, int, int]:
        """Return as (x1, y1, x2, y2) tuple.

        Returns
        -------
        tuple[int, int, int, int]
            Corner coordinates.
        """
        return (self.x, self.y, self.x2, self.y2)
