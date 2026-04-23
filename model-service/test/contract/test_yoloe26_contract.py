"""Contract test for :class:`YOLOE26Loader`."""

from __future__ import annotations

import sys

import pytest

from src.infrastructure.adapters.outbound.models.detection.loader import (
    DetectionConfig,
    DetectionFramework,
    DetectionModelLoader,
    YOLOE26Loader,
    create_detection_loader,
)


def _config() -> DetectionConfig:
    return DetectionConfig(
        model_id="yoloe-26.pt",
        framework=DetectionFramework.ULTRALYTICS,
        device="cpu",
    )


def test_yoloe26_is_subclass_of_base() -> None:
    """YOLOE26Loader extends the shared detection base."""
    assert issubclass(YOLOE26Loader, DetectionModelLoader)


def test_yoloe26_load_without_ultralytics_raises_importerror(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Calling load without ultralytics installed raises a clear ImportError."""
    monkeypatch.setitem(sys.modules, "ultralytics", None)
    loader = YOLOE26Loader(_config())
    with pytest.raises(ImportError, match="YOLOE"):
        loader.load()


def test_yoloe26_registered_in_factory() -> None:
    """Factory resolves ``yoloe-26`` model names to the new loader."""
    loader = create_detection_loader("yoloe-26", _config())
    assert isinstance(loader, YOLOE26Loader)
