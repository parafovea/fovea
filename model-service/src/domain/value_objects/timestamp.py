"""Timestamp and time range value objects.

This module defines immutable value objects for video timestamps and
time ranges with validation and utility methods.
"""

from dataclasses import dataclass
from typing import Self


@dataclass(frozen=True, slots=True)
class Timestamp:
    """Immutable timestamp representing a point in video time.

    Parameters
    ----------
    seconds : float
        Time in seconds from video start (must be non-negative).

    Raises
    ------
    ValueError
        If seconds is negative.

    Examples
    --------
    >>> ts = Timestamp(90.5)
    >>> ts.format()
    '01:30.500'
    >>> ts.to_frame(fps=30.0)
    2715
    """

    seconds: float

    def __post_init__(self) -> None:
        """Validate timestamp is non-negative."""
        if self.seconds < 0:
            raise ValueError(f"Timestamp cannot be negative: {self.seconds}")

    def format(self, include_ms: bool = True) -> str:
        """Format timestamp as human-readable string.

        Parameters
        ----------
        include_ms : bool, default=True
            Include milliseconds in output.

        Returns
        -------
        str
            Formatted timestamp (e.g., "01:30.500" or "01:30").
        """
        total_seconds = int(self.seconds)
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        secs = total_seconds % 60
        ms = int((self.seconds - total_seconds) * 1000)

        if hours > 0:
            if include_ms:
                return f"{hours:02d}:{minutes:02d}:{secs:02d}.{ms:03d}"
            return f"{hours:02d}:{minutes:02d}:{secs:02d}"
        if include_ms:
            return f"{minutes:02d}:{secs:02d}.{ms:03d}"
        return f"{minutes:02d}:{secs:02d}"

    def to_frame(self, fps: float) -> int:
        """Convert timestamp to frame number.

        Parameters
        ----------
        fps : float
            Video frames per second.

        Returns
        -------
        int
            Frame number at this timestamp.
        """
        return int(self.seconds * fps)

    def offset(self, delta_seconds: float) -> Self:
        """Create new timestamp offset by given seconds.

        Parameters
        ----------
        delta_seconds : float
            Seconds to add (can be negative).

        Returns
        -------
        Timestamp
            New timestamp with offset applied.

        Raises
        ------
        ValueError
            If resulting timestamp would be negative.
        """
        return type(self)(self.seconds + delta_seconds)

    @classmethod
    def from_frame(cls, frame_number: int, fps: float) -> Self:
        """Create timestamp from frame number.

        Parameters
        ----------
        frame_number : int
            Video frame number.
        fps : float
            Video frames per second.

        Returns
        -------
        Timestamp
            Timestamp corresponding to frame.
        """
        return cls(frame_number / fps)

    @classmethod
    def from_milliseconds(cls, ms: int) -> Self:
        """Create timestamp from milliseconds.

        Parameters
        ----------
        ms : int
            Time in milliseconds.

        Returns
        -------
        Timestamp
            Timestamp for given milliseconds.
        """
        return cls(ms / 1000.0)

    def __float__(self) -> float:
        """Convert to float seconds."""
        return self.seconds

    def __lt__(self, other: Self) -> bool:
        """Less than comparison."""
        return self.seconds < other.seconds

    def __le__(self, other: Self) -> bool:
        """Less than or equal comparison."""
        return self.seconds <= other.seconds

    def __gt__(self, other: Self) -> bool:
        """Greater than comparison."""
        return self.seconds > other.seconds

    def __ge__(self, other: Self) -> bool:
        """Greater than or equal comparison."""
        return self.seconds >= other.seconds


@dataclass(frozen=True, slots=True)
class TimeRange:
    """Immutable time range with start and end timestamps.

    Parameters
    ----------
    start : Timestamp
        Start of the range.
    end : Timestamp
        End of the range.

    Raises
    ------
    ValueError
        If start is after end.

    Examples
    --------
    >>> tr = TimeRange(Timestamp(10.0), Timestamp(20.0))
    >>> tr.duration
    10.0
    >>> Timestamp(15.0) in tr
    True
    """

    start: Timestamp
    end: Timestamp

    def __post_init__(self) -> None:
        """Validate start is before or equal to end."""
        if self.start > self.end:
            raise ValueError(
                f"Start ({self.start.seconds}s) must not be after end ({self.end.seconds}s)"
            )

    @property
    def duration(self) -> float:
        """Duration of the range in seconds."""
        return self.end.seconds - self.start.seconds

    @property
    def midpoint(self) -> Timestamp:
        """Midpoint timestamp of the range."""
        return Timestamp((self.start.seconds + self.end.seconds) / 2)

    def contains(self, timestamp: Timestamp) -> bool:
        """Check if timestamp falls within this range.

        Parameters
        ----------
        timestamp : Timestamp
            Timestamp to check.

        Returns
        -------
        bool
            True if timestamp is within range (inclusive).
        """
        return self.start <= timestamp <= self.end

    def __contains__(self, timestamp: Timestamp) -> bool:
        """Support 'in' operator for containment check."""
        return self.contains(timestamp)

    def overlaps(self, other: Self) -> bool:
        """Check if this range overlaps with another.

        Parameters
        ----------
        other : TimeRange
            Other range to check.

        Returns
        -------
        bool
            True if ranges overlap.
        """
        return self.start <= other.end and other.start <= self.end

    def intersection(self, other: Self) -> Self | None:
        """Get intersection with another range.

        Parameters
        ----------
        other : TimeRange
            Other range to intersect with.

        Returns
        -------
        TimeRange | None
            Intersection range, or None if no overlap.
        """
        if not self.overlaps(other):
            return None

        start = max(self.start, other.start, key=lambda t: t.seconds)
        end = min(self.end, other.end, key=lambda t: t.seconds)
        return type(self)(start, end)

    def union(self, other: Self) -> Self | None:
        """Get union with another range if they overlap or are adjacent.

        Parameters
        ----------
        other : TimeRange
            Other range to union with.

        Returns
        -------
        TimeRange | None
            Union range, or None if ranges don't connect.
        """
        if not self.overlaps(other):
            return None

        start = min(self.start, other.start, key=lambda t: t.seconds)
        end = max(self.end, other.end, key=lambda t: t.seconds)
        return type(self)(start, end)

    def to_frame_range(self, fps: float) -> tuple[int, int]:
        """Convert to frame number range.

        Parameters
        ----------
        fps : float
            Video frames per second.

        Returns
        -------
        tuple[int, int]
            (start_frame, end_frame) tuple.
        """
        return (self.start.to_frame(fps), self.end.to_frame(fps))

    @classmethod
    def from_seconds(cls, start: float, end: float) -> Self:
        """Create range from raw seconds values.

        Parameters
        ----------
        start : float
            Start time in seconds.
        end : float
            End time in seconds.

        Returns
        -------
        TimeRange
            New time range.
        """
        return cls(Timestamp(start), Timestamp(end))

    @classmethod
    def from_frames(cls, start_frame: int, end_frame: int, fps: float) -> Self:
        """Create range from frame numbers.

        Parameters
        ----------
        start_frame : int
            Starting frame number.
        end_frame : int
            Ending frame number.
        fps : float
            Video frames per second.

        Returns
        -------
        TimeRange
            New time range.
        """
        return cls(
            Timestamp.from_frame(start_frame, fps),
            Timestamp.from_frame(end_frame, fps),
        )
