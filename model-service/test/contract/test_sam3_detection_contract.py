"""Contract test for :class:`SAM3DetectionAdapter`."""

from __future__ import annotations

import inspect
import sys

import numpy as np
import pytest

from src.application.ports.outbound.detection_model import IDetectionModel
from src.infrastructure.adapters.outbound.models.sam3 import (
    SAM3DetectionAdapter,
    SAM3Loader,
)


def test_sam3_detection_adapter_is_subclass_of_port() -> None:
    """SAM3DetectionAdapter must satisfy the detection port."""
    assert issubclass(SAM3DetectionAdapter, IDetectionModel)


def test_sam3_detection_adapter_signatures_match_port() -> None:
    """Required methods must share signatures with the abstract port."""
    for name in ("detect", "detect_batch", "set_classes", "load", "unload"):
        port_sig = inspect.signature(getattr(IDetectionModel, name))
        impl_sig = inspect.signature(getattr(SAM3DetectionAdapter, name))
        assert list(port_sig.parameters) == list(impl_sig.parameters), name


def test_sam3_detect_without_package_raises_importerror(monkeypatch: pytest.MonkeyPatch) -> None:
    """Calling detect without sam3 installed raises a clear ImportError."""
    monkeypatch.setitem(sys.modules, "sam3", None)
    adapter = SAM3DetectionAdapter(SAM3Loader(model_id="facebook/sam3", device="cpu"))
    image = np.zeros((8, 8, 3), dtype=np.uint8)
    with pytest.raises(ImportError, match="sam3"):
        adapter.detect(image, "person")
