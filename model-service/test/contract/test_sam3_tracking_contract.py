"""Contract test for :class:`SAM3TrackingAdapter`."""

from __future__ import annotations

import inspect
import sys

import numpy as np
import pytest

from src.application.ports.outbound.tracking_model import ITrackingModel
from src.infrastructure.adapters.outbound.models.sam3 import (
    SAM3Loader,
    SAM3TrackingAdapter,
)


def test_sam3_tracking_adapter_is_subclass_of_port() -> None:
    """SAM3TrackingAdapter must satisfy the tracking port."""
    assert issubclass(SAM3TrackingAdapter, ITrackingModel)


def test_sam3_tracking_adapter_signatures_match_port() -> None:
    """Required methods must share signatures with the abstract port."""
    for name in ("initialize", "track", "track_batch", "reset", "load", "unload"):
        port_sig = inspect.signature(getattr(ITrackingModel, name))
        impl_sig = inspect.signature(getattr(SAM3TrackingAdapter, name))
        assert list(port_sig.parameters) == list(impl_sig.parameters), name


def test_sam3_track_without_package_raises_importerror(monkeypatch: pytest.MonkeyPatch) -> None:
    """Calling track without sam3 installed raises a clear ImportError."""
    monkeypatch.setitem(sys.modules, "sam3", None)
    adapter = SAM3TrackingAdapter(SAM3Loader(model_id="facebook/sam3", device="cpu"))
    frame = np.zeros((8, 8, 3), dtype=np.uint8)
    adapter.set_prompt("person")
    # Initialize touches loader.load, which should raise without sam3.
    with pytest.raises(ImportError, match="sam3"):
        adapter.initialize(frame, [np.zeros((8, 8), dtype=np.bool_)], [1])
