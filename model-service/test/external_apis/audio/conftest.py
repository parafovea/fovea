"""Test fixtures for the external audio API clients.

The audio client package eagerly imports every vendor client in its
``__init__``. The vendor SDKs (``assemblyai``, ``boto3``, ``deepgram``,
``azure.cognitiveservices.speech``, ``google.cloud.speech_v2``) live in
the optional ``[audio]`` extra and may not be installed in CI. This
module installs lightweight ``MagicMock`` stubs into ``sys.modules`` so
the package can be imported for testing without real SDKs.
"""

from __future__ import annotations

import sys
from typing import TYPE_CHECKING
from unittest.mock import MagicMock

if TYPE_CHECKING:
    from types import ModuleType


def _stub(name: str) -> ModuleType:
    mod = MagicMock()
    mod.__name__ = name
    sys.modules.setdefault(name, mod)
    return sys.modules[name]


_stub("assemblyai")
_stub("boto3")
_stub("deepgram")

_stub("azure")
_stub("azure.cognitiveservices")
_stub("azure.cognitiveservices.speech")

_stub("google")
_stub("google.cloud")
_stub("google.cloud.speech_v2")
