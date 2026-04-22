"""Tests for Timestamp and TimeRange value objects."""

from __future__ import annotations

import pytest

from src.domain.value_objects.timestamp import TimeRange, Timestamp


class TestTimestampConstruction:
    def test_valid_timestamp(self) -> None:
        ts = Timestamp(90.5)
        assert ts.seconds == 90.5

    def test_zero_is_valid(self) -> None:
        assert Timestamp(0.0).seconds == 0.0

    def test_negative_raises(self) -> None:
        with pytest.raises(ValueError, match="cannot be negative"):
            Timestamp(-0.1)

    def test_immutable(self) -> None:
        ts = Timestamp(1.0)
        with pytest.raises(AttributeError):
            ts.seconds = 2.0  # type: ignore[misc]


class TestTimestampFormatting:
    def test_format_minutes_seconds(self) -> None:
        assert Timestamp(90.5).format() == "01:30.500"

    def test_format_without_ms(self) -> None:
        assert Timestamp(90.5).format(include_ms=False) == "01:30"

    def test_format_with_hours(self) -> None:
        assert Timestamp(3661.0).format(include_ms=False) == "01:01:01"

    def test_format_with_hours_and_ms(self) -> None:
        assert Timestamp(3661.25).format() == "01:01:01.250"

    def test_format_zero(self) -> None:
        assert Timestamp(0.0).format() == "00:00.000"


class TestTimestampConversions:
    def test_to_frame(self) -> None:
        assert Timestamp(2.0).to_frame(fps=30.0) == 60

    def test_from_frame(self) -> None:
        assert Timestamp.from_frame(60, fps=30.0).seconds == pytest.approx(2.0)

    def test_from_milliseconds(self) -> None:
        assert Timestamp.from_milliseconds(1500).seconds == pytest.approx(1.5)

    def test_float_conversion(self) -> None:
        assert float(Timestamp(3.14)) == 3.14


class TestTimestampArithmeticAndOrdering:
    def test_offset_positive(self) -> None:
        assert Timestamp(10.0).offset(5.0).seconds == 15.0

    def test_offset_negative(self) -> None:
        assert Timestamp(10.0).offset(-3.0).seconds == 7.0

    def test_offset_into_negative_raises(self) -> None:
        with pytest.raises(ValueError, match="cannot be negative"):
            Timestamp(1.0).offset(-2.0)

    def test_ordering(self) -> None:
        a, b = Timestamp(1.0), Timestamp(2.0)
        assert a < b
        assert a <= b
        assert b > a
        assert b >= a
        assert a <= Timestamp(1.0)
        assert a >= Timestamp(1.0)

    def test_equality(self) -> None:
        assert Timestamp(1.5) == Timestamp(1.5)
        assert Timestamp(1.5) != Timestamp(1.6)


class TestTimeRangeConstruction:
    def test_valid_range(self) -> None:
        tr = TimeRange(Timestamp(1.0), Timestamp(5.0))
        assert tr.duration == 4.0

    def test_equal_start_end(self) -> None:
        tr = TimeRange(Timestamp(3.0), Timestamp(3.0))
        assert tr.duration == 0.0

    def test_start_after_end_raises(self) -> None:
        with pytest.raises(ValueError, match="must not be after"):
            TimeRange(Timestamp(5.0), Timestamp(3.0))

    def test_midpoint(self) -> None:
        tr = TimeRange(Timestamp(2.0), Timestamp(8.0))
        assert tr.midpoint.seconds == 5.0


class TestTimeRangeContainment:
    def test_contains_inside(self) -> None:
        tr = TimeRange(Timestamp(1.0), Timestamp(10.0))
        assert tr.contains(Timestamp(5.0))

    def test_contains_boundary(self) -> None:
        tr = TimeRange(Timestamp(1.0), Timestamp(10.0))
        assert tr.contains(Timestamp(1.0))
        assert tr.contains(Timestamp(10.0))

    def test_contains_outside(self) -> None:
        tr = TimeRange(Timestamp(1.0), Timestamp(10.0))
        assert not tr.contains(Timestamp(11.0))

    def test_in_operator(self) -> None:
        tr = TimeRange(Timestamp(1.0), Timestamp(10.0))
        assert Timestamp(5.0) in tr
        assert Timestamp(20.0) not in tr


class TestTimeRangeOperations:
    def test_overlaps_true(self) -> None:
        a = TimeRange.from_seconds(1.0, 5.0)
        b = TimeRange.from_seconds(4.0, 10.0)
        assert a.overlaps(b)

    def test_overlaps_false(self) -> None:
        a = TimeRange.from_seconds(1.0, 3.0)
        b = TimeRange.from_seconds(5.0, 7.0)
        assert not a.overlaps(b)

    def test_intersection(self) -> None:
        a = TimeRange.from_seconds(1.0, 5.0)
        b = TimeRange.from_seconds(3.0, 7.0)
        intersection = a.intersection(b)
        assert intersection is not None
        assert intersection.start.seconds == 3.0
        assert intersection.end.seconds == 5.0

    def test_intersection_none(self) -> None:
        a = TimeRange.from_seconds(1.0, 2.0)
        b = TimeRange.from_seconds(5.0, 6.0)
        assert a.intersection(b) is None

    def test_union(self) -> None:
        a = TimeRange.from_seconds(1.0, 5.0)
        b = TimeRange.from_seconds(3.0, 7.0)
        union = a.union(b)
        assert union is not None
        assert union.start.seconds == 1.0
        assert union.end.seconds == 7.0

    def test_union_none(self) -> None:
        a = TimeRange.from_seconds(1.0, 2.0)
        b = TimeRange.from_seconds(5.0, 6.0)
        assert a.union(b) is None

    def test_to_frame_range(self) -> None:
        tr = TimeRange.from_seconds(1.0, 3.0)
        assert tr.to_frame_range(fps=30.0) == (30, 90)

    def test_from_frames(self) -> None:
        tr = TimeRange.from_frames(30, 90, fps=30.0)
        assert tr.start.seconds == pytest.approx(1.0)
        assert tr.end.seconds == pytest.approx(3.0)
