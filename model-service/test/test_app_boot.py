"""Boot smoke tests for the model-service application module.

These pin that the FastAPI application module imports cleanly and that the
infrastructure modules on its import graph carry no ``SyntaxError`` — a
Python-2 ``except (A, B), e`` tuple or a bare-tuple raise aborts the whole boot
before any request is served, and a bare compile is the cheapest, dependency-free
way to catch it. A separate case imports the observability module at runtime so a
``TYPE_CHECKING``-only name left in a runtime signature (which imports, not
compilation, would surface) also fails the suite.
"""

from __future__ import annotations

import py_compile
from pathlib import Path

import pytest
from fastapi import FastAPI

# ``test/`` sits directly under the model-service package root.
_SRC = Path(__file__).resolve().parents[1] / "src"

# Infrastructure modules that previously aborted the boot with a SyntaxError or a
# runtime NameError; each must compile cleanly for the service to start.
_BOOT_CRITICAL_SOURCES = [
    _SRC / "infrastructure" / "adapters" / "outbound" / "video" / "processor.py",
    _SRC / "infrastructure" / "adapters" / "outbound" / "external_api_router_adapter.py",
    _SRC / "infrastructure" / "observability" / "telemetry.py",
    _SRC / "infrastructure" / "adapters" / "outbound" / "models" / "tracking" / "loader.py",
]


def test_fastapi_app_module_imports() -> None:
    """``src.main`` imports and exposes a FastAPI ``app`` without a boot error."""
    from src.main import app

    assert isinstance(app, FastAPI)
    # A booted app has its routes wired; the health route is always present.
    paths = {getattr(route, "path", None) for route in app.routes}
    assert "/health" in paths


@pytest.mark.parametrize(
    "source",
    _BOOT_CRITICAL_SOURCES,
    ids=[source.stem for source in _BOOT_CRITICAL_SOURCES],
)
def test_boot_critical_module_has_no_syntax_error(source: Path) -> None:
    """Each boot-critical infrastructure module compiles without a SyntaxError."""
    assert source.exists(), source
    # ``doraise`` turns a SyntaxError into a raised PyCompileError instead of a
    # silent non-zero return, failing the test if the module cannot compile.
    py_compile.compile(str(source), doraise=True)


def test_observability_module_imports_at_runtime() -> None:
    """The observability module imports, so its runtime signatures resolve.

    A ``TYPE_CHECKING``-only name used in a runtime signature without deferred
    annotations raises at import time, not compile time; importing the module
    exercises that path.
    """
    pytest.importorskip("opentelemetry")
    from src.infrastructure.observability import telemetry

    assert callable(telemetry.instrument_method)
