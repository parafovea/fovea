"""Contract test for :class:`YOLOv12Loader`."""

from __future__ import annotations

import sys

import pytest
from PIL import Image

from src.domain.entities.architectures import YOLOv12
from src.infrastructure.adapters.outbound.models.detection.loader import (
    DetectionConfig,
    DetectionFramework,
    DetectionModelLoader,
    YOLOv12Loader,
    create_detection_loader,
)


def _config() -> DetectionConfig:
    return DetectionConfig(
        model_id="yolov12l.pt",
        framework=DetectionFramework.ULTRALYTICS,
        device="cpu",
    )


def test_yolov12_is_subclass_of_base() -> None:
    """YOLOv12Loader extends the shared detection base."""
    assert issubclass(YOLOv12Loader, DetectionModelLoader)


def test_yolov12_load_without_ultralytics_raises_importerror(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Calling load without ultralytics installed raises a clear ImportError."""
    monkeypatch.setitem(sys.modules, "ultralytics", None)
    loader = YOLOv12Loader(YOLOv12(), _config())
    with pytest.raises(ImportError, match="ultralytics"):
        loader.load()


def test_yolov12_detect_without_ultralytics_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Detect surfaces a clear error when called before a successful load."""
    monkeypatch.setitem(sys.modules, "ultralytics", None)
    loader = YOLOv12Loader(YOLOv12(), _config())
    with pytest.raises(RuntimeError):
        loader.detect(Image.new("RGB", (8, 8)), "person")


def test_yolov12_registered_in_factory() -> None:
    """Factory resolves the :class:`YOLOv12` architecture to its loader."""
    loader = create_detection_loader(YOLOv12(), _config())
    assert isinstance(loader, YOLOv12Loader)
