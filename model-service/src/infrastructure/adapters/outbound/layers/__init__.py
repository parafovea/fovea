"""Layers codec adapter package.

Binds the lairs-free ``ILayersCodec`` port to the canonical ``pub.layers.*``
record models. Because ``lairs`` / ``didactic`` are optional at runtime (they
live only in the codec virtualenv), every lairs-dependent import is guarded:
:data:`HAS_LAIRS` reports whether the stack is importable, and the ``_convert``
helpers are re-exported only when it is.
"""

from __future__ import annotations

try:
    from src.infrastructure.adapters.outbound.layers import _convert

    HAS_LAIRS = True
except ImportError:  # pragma: no cover - exercised only without the codec venv
    _convert = None  # type: ignore[assignment]
    HAS_LAIRS = False

__all__ = ["HAS_LAIRS", "_convert"]
