"""Contract test for :class:`YOLOELoader`."""

from __future__ import annotations

import pytest

pytest.importorskip("torch")  # requires the ML backend; skipped in the torch-free venv

import sys

import pytest

from src.domain.entities.architectures import YOLOE
from src.infrastructure.adapters.outbound.models.detection.loader import (
    DetectionConfig,
    DetectionFramework,
    DetectionModelLoader,
    YOLOELoader,
    create_detection_loader,
)


def _config() -> DetectionConfig:
    return DetectionConfig(
        model_id="yoloe-26.pt",
        framework=DetectionFramework.ULTRALYTICS,
        device="cpu",
    )


def test_yoloe_is_subclass_of_base() -> None:
    """YOLOELoader extends the shared detection base."""
    assert issubclass(YOLOELoader, DetectionModelLoader)


def test_yoloe_load_without_ultralytics_raises_importerror(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Calling load without ultralytics installed raises a clear ImportError."""
    monkeypatch.setitem(sys.modules, "ultralytics", None)
    loader = YOLOELoader(YOLOE(), _config())
    with pytest.raises(ImportError, match="YOLOE"):
        loader.load()


def test_yoloe_registered_in_factory() -> None:
    """Factory resolves the :class:`YOLOE` architecture to its loader."""
    loader = create_detection_loader(YOLOE(), _config())
    assert isinstance(loader, YOLOELoader)
