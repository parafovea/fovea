"""Test fixtures for model loader tests.

The tracking loader lazily imports ``sam2.build_sam`` inside its
``load`` methods. That SDK is optional and not installed in CI, so
``unittest.mock.patch("sam2.build_sam.build_sam2_video_predictor")``
cannot resolve the dotted path. This module pre-registers a lightweight
stub in ``sys.modules`` so ``patch`` can install a spec onto the
``build_sam2_video_predictor`` attribute without the real SDK.
"""

from __future__ import annotations

import sys
from unittest.mock import MagicMock

if "sam2" not in sys.modules:
    sam2 = MagicMock()
    sam2.__name__ = "sam2"
    sys.modules["sam2"] = sam2

if "sam2.build_sam" not in sys.modules:
    build_sam = MagicMock()
    build_sam.__name__ = "sam2.build_sam"
    build_sam.build_sam2_video_predictor = MagicMock()
    sys.modules["sam2.build_sam"] = build_sam
