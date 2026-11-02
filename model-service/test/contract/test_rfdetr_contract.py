"""Contract test for :class:`RFDETRLoader`."""

from __future__ import annotations

import pytest

pytest.importorskip("torch")  # requires the ML backend; skipped in the torch-free venv

import sys

import pytest

from src.domain.entities.architectures import RFDETR
from src.infrastructure.adapters.outbound.models.detection.loader import (
    DetectionConfig,
    DetectionFramework,
    DetectionModelLoader,
    RFDETRLoader,
    create_detection_loader,
)


def _config() -> DetectionConfig:
    return DetectionConfig(
        model_id="rfdetr-base",
        framework=DetectionFramework.PYTORCH,
        device="cpu",
    )


def test_rfdetr_is_subclass_of_base() -> None:
    """RFDETRLoader extends the shared detection base."""
    assert issubclass(RFDETRLoader, DetectionModelLoader)


def test_rfdetr_load_without_package_raises_importerror(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Calling load without rfdetr installed raises a clear ImportError."""
    monkeypatch.setitem(sys.modules, "rfdetr", None)
    loader = RFDETRLoader(RFDETR(), _config())
    with pytest.raises(ImportError, match="rfdetr"):
        loader.load()


def test_rfdetr_registered_in_factory() -> None:
    """Factory resolves the :class:`RFDETR` architecture to its loader."""
    loader = create_detection_loader(RFDETR(), _config())
    assert isinstance(loader, RFDETRLoader)
