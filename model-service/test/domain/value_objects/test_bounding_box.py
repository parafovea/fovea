"""Tests for bounding box value objects."""

from __future__ import annotations

import pytest

from src.domain.value_objects.bounding_box import AbsoluteBBox, NormalizedBBox


class TestNormalizedBBoxConstruction:
    """Construction and validation of NormalizedBBox."""

    def test_valid_box_constructs(self) -> None:
        box = NormalizedBBox(x=0.1, y=0.2, width=0.3, height=0.4)
        assert box.x == 0.1
        assert box.y == 0.2
        assert box.width == 0.3
        assert box.height == 0.4

    def test_full_frame_box_is_allowed(self) -> None:
        box = NormalizedBBox(x=0.0, y=0.0, width=1.0, height=1.0)
        assert box.area == 1.0

    def test_negative_coordinate_raises(self) -> None:
        with pytest.raises(ValueError, match="must be between"):
            NormalizedBBox(x=-0.1, y=0.0, width=0.5, height=0.5)

    def test_out_of_range_coordinate_raises(self) -> None:
        with pytest.raises(ValueError, match="must be between"):
            NormalizedBBox(x=0.0, y=0.0, width=1.5, height=0.5)

    def test_x_plus_width_exceeds_one_raises(self) -> None:
        with pytest.raises(ValueError, match="x \\+ width"):
            NormalizedBBox(x=0.6, y=0.0, width=0.5, height=0.5)

    def test_y_plus_height_exceeds_one_raises(self) -> None:
        with pytest.raises(ValueError, match="y \\+ height"):
            NormalizedBBox(x=0.0, y=0.6, width=0.5, height=0.5)


class TestNormalizedBBoxProperties:
    """Derived properties and equality of NormalizedBBox."""

    def test_derived_properties(self) -> None:
        box = NormalizedBBox(x=0.1, y=0.2, width=0.4, height=0.4)
        assert box.x2 == pytest.approx(0.5)
        assert box.y2 == pytest.approx(0.6)
        assert box.center_x == pytest.approx(0.3)
        assert box.center_y == pytest.approx(0.4)
        assert box.area == pytest.approx(0.16)

    def test_equality_by_value(self) -> None:
        a = NormalizedBBox(x=0.1, y=0.2, width=0.3, height=0.4)
        b = NormalizedBBox(x=0.1, y=0.2, width=0.3, height=0.4)
        c = NormalizedBBox(x=0.1, y=0.2, width=0.3, height=0.5)
        assert a == b
        assert a != c

    def test_hashable(self) -> None:
        box = NormalizedBBox(x=0.1, y=0.2, width=0.3, height=0.4)
        assert {box} == {box}

    def test_immutable(self) -> None:
        box = NormalizedBBox(x=0.1, y=0.2, width=0.3, height=0.4)
        with pytest.raises(AttributeError):
            box.x = 0.5  # type: ignore[misc]


class TestNormalizedBBoxIoU:
    """IoU computations for NormalizedBBox."""

    def test_iou_identical_boxes(self) -> None:
        a = NormalizedBBox(x=0.1, y=0.1, width=0.3, height=0.3)
        assert a.iou(a) == pytest.approx(1.0)

    def test_iou_no_overlap(self) -> None:
        a = NormalizedBBox(x=0.0, y=0.0, width=0.2, height=0.2)
        b = NormalizedBBox(x=0.5, y=0.5, width=0.2, height=0.2)
        assert a.iou(b) == 0.0

    def test_iou_partial_overlap(self) -> None:
        a = NormalizedBBox(x=0.0, y=0.0, width=0.5, height=0.5)
        b = NormalizedBBox(x=0.25, y=0.25, width=0.5, height=0.5)
        intersection = 0.25 * 0.25
        union = 0.25 + 0.25 - intersection
        assert a.iou(b) == pytest.approx(intersection / union)

    def test_iou_is_symmetric(self) -> None:
        a = NormalizedBBox(x=0.0, y=0.0, width=0.5, height=0.5)
        b = NormalizedBBox(x=0.25, y=0.25, width=0.5, height=0.5)
        assert a.iou(b) == pytest.approx(b.iou(a))


class TestNormalizedBBoxMethods:
    """Point containment, conversion, serialization, factories."""

    def test_contains_point_inside(self) -> None:
        box = NormalizedBBox(x=0.1, y=0.1, width=0.4, height=0.4)
        assert box.contains_point(0.2, 0.3)

    def test_contains_point_outside(self) -> None:
        box = NormalizedBBox(x=0.1, y=0.1, width=0.4, height=0.4)
        assert not box.contains_point(0.6, 0.6)

    def test_contains_point_on_edge(self) -> None:
        box = NormalizedBBox(x=0.1, y=0.1, width=0.4, height=0.4)
        assert box.contains_point(0.1, 0.1)
        assert box.contains_point(0.5, 0.5)

    def test_to_absolute_conversion(self) -> None:
        box = NormalizedBBox(x=0.1, y=0.2, width=0.3, height=0.4)
        absolute = box.to_absolute(100, 200)
        assert absolute.x == 10
        assert absolute.y == 40
        assert absolute.width == 30
        assert absolute.height == 80

    def test_to_dict(self) -> None:
        box = NormalizedBBox(x=0.1, y=0.2, width=0.3, height=0.4)
        assert box.to_dict() == {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.4}

    def test_from_xyxy(self) -> None:
        box = NormalizedBBox.from_xyxy(0.1, 0.2, 0.5, 0.6)
        assert box.x == pytest.approx(0.1)
        assert box.y == pytest.approx(0.2)
        assert box.width == pytest.approx(0.4)
        assert box.height == pytest.approx(0.4)

    def test_from_center(self) -> None:
        box = NormalizedBBox.from_center(0.5, 0.5, 0.2, 0.2)
        assert box.x == pytest.approx(0.4)
        assert box.y == pytest.approx(0.4)
        assert box.width == pytest.approx(0.2)
        assert box.height == pytest.approx(0.2)


class TestAbsoluteBBox:
    """Construction, validation, and conversions for AbsoluteBBox."""

    def test_valid_construction(self) -> None:
        box = AbsoluteBBox(x=10, y=20, width=30, height=40, image_width=100, image_height=100)
        assert box.x == 10
        assert box.x2 == 40
        assert box.y2 == 60
        assert box.area == 1200

    def test_negative_coordinates_raise(self) -> None:
        with pytest.raises(ValueError, match="non-negative"):
            AbsoluteBBox(x=-1, y=0, width=10, height=10, image_width=100, image_height=100)

    def test_negative_dimensions_raise(self) -> None:
        with pytest.raises(ValueError, match="non-negative"):
            AbsoluteBBox(x=0, y=0, width=-1, height=10, image_width=100, image_height=100)

    def test_exceeds_image_width_raises(self) -> None:
        with pytest.raises(ValueError, match="exceeds image width"):
            AbsoluteBBox(x=50, y=0, width=60, height=10, image_width=100, image_height=100)

    def test_exceeds_image_height_raises(self) -> None:
        with pytest.raises(ValueError, match="exceeds image height"):
            AbsoluteBBox(x=0, y=50, width=10, height=60, image_width=100, image_height=100)

    def test_to_normalized_roundtrip(self) -> None:
        box = AbsoluteBBox(x=10, y=20, width=30, height=40, image_width=100, image_height=200)
        n = box.to_normalized()
        assert n.x == pytest.approx(0.1)
        assert n.y == pytest.approx(0.1)
        assert n.width == pytest.approx(0.3)
        assert n.height == pytest.approx(0.2)

    def test_to_xyxy(self) -> None:
        box = AbsoluteBBox(x=10, y=20, width=30, height=40, image_width=100, image_height=100)
        assert box.to_xyxy() == (10, 20, 40, 60)
