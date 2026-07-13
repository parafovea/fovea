"""Tests for the tracking family loader factory.

These tests pin the architecture-keyed dispatch contract for
:func:`create_tracking_loader`:

  * every tracking architecture registered in :mod:`tracking.loader`
    resolves to the loader class declared by
    ``@tracking_registry.register(...)``
  * the loader receives the architecture instance as its first
    positional argument and exposes it on the ``arch`` attribute
  * an architecture from a different family (VLM, LLM, Detection,
    Audio) raises :class:`UnknownArchitectureError` with the tracking
    family in the message rather than silently falling through to a
    default loader
  * the discriminated :data:`TrackingArchitecture` union and the
    registry agree on which architectures the family supports

No test in this module may inspect ``model_id`` substrings. The
architecture Pydantic class is the only legitimate dispatch key.
"""

from __future__ import annotations

import pytest

pytest.importorskip("torch")  # requires the ML backend; skipped in the torch-free venv

from typing import get_args

import pytest

from src.domain.entities.architectures import (
    SAM2,
    SAMURAI,
    QwenLLM,
    SAM2Long,
    SAM3Tracking,
    TrackingArchitecture,
    YOLO11Seg,
)
from src.infrastructure.adapters.outbound.models.registry import UnknownArchitectureError
from src.infrastructure.adapters.outbound.models.tracking.loader import (
    SAM2Loader,
    SAM2LongLoader,
    SAMURAILoader,
    TrackingConfig,
    TrackingFramework,
    YOLO11SegLoader,
    create_tracking_loader,
    tracking_registry,
)


def _config(model_id: str = "vendor/placeholder") -> TrackingConfig:
    """Build a TrackingConfig suitable for dispatch-only tests.

    The factory never touches weights at construction time, so a
    placeholder ``model_id`` and a CPU device are sufficient for
    asserting which loader class the registry resolves to.
    """
    return TrackingConfig(
        model_id=model_id,
        framework=TrackingFramework.PYTORCH,
        device="cpu",
    )


class TestRegistryBindings:
    """Each TrackingArchitecture subclass binds to exactly the loader it should."""

    @pytest.mark.parametrize(
        ("architecture", "loader_cls"),
        [
            (SAMURAI(), SAMURAILoader),
            (SAM2Long(), SAM2LongLoader),
            (SAM2(), SAM2Loader),
            (YOLO11Seg(), YOLO11SegLoader),
        ],
    )
    def test_create_dispatches_to_registered_loader(
        self,
        architecture: object,
        loader_cls: type,
    ) -> None:
        loader = create_tracking_loader(architecture, _config())  # type: ignore[arg-type]
        assert isinstance(loader, loader_cls)
        assert loader.arch is architecture
        assert loader.config.framework == TrackingFramework.PYTORCH

    def test_loader_constructor_accepts_architecture_first(self) -> None:
        """The base ``__init__`` contract is (arch, config) positional."""
        arch = SAMURAI()
        config = _config()
        loader = SAMURAILoader(arch, config)
        assert loader.arch is arch
        assert loader.config is config
        # ``model`` is the deferred weight handle; load() populates it.
        assert loader.model is None

    def test_registry_covers_local_tracking_architectures(self) -> None:
        """Every TrackingArchitecture except the externally-loaded SAM3 is registered.

        SAM3 is loaded through the ``sam3`` framework pre-dispatch in the
        task factory and lives in its own adapter module, so no class in
        this module registers for :class:`SAM3Tracking`. Every other
        TrackingArchitecture subclass must have a loader bound in the
        registry, or a YAML config naming it would fail at runtime with
        :class:`UnknownArchitectureError`.
        """
        # TrackingArchitecture is Annotated[Union[...], Field(...)]; unwrap.
        union_type = get_args(TrackingArchitecture)[0]
        members = set(get_args(union_type))
        registered = set(tracking_registry.registered_architectures)
        missing_from_registry = (members - {SAM3Tracking}) - registered
        assert not missing_from_registry, (
            "TrackingArchitecture subclasses (excluding SAM3Tracking) without "
            f"a registered loader: {sorted(c.__name__ for c in missing_from_registry)}"
        )
        # The registry must not advertise architectures that aren't in the
        # discriminated union; that would mean a loader is reachable that the
        # YAML schema can never legitimately produce.
        unknown_in_registry = registered - members
        assert not unknown_in_registry, (
            "tracking_registry has loaders registered for architectures outside "
            f"TrackingArchitecture: {sorted(c.__name__ for c in unknown_in_registry)}"
        )

    def test_registry_family_label(self) -> None:
        """The registry exposes the ``tracking`` family label used in errors."""
        assert tracking_registry.family == "tracking"


class TestUnknownArchitecture:
    """An architecture from a different family must fail loudly."""

    def test_llm_architecture_raises_unknown_architecture_error(self) -> None:
        with pytest.raises(UnknownArchitectureError) as exc_info:
            create_tracking_loader(QwenLLM(), _config())  # type: ignore[arg-type]

        err = exc_info.value
        assert err.family == "tracking"
        assert err.architecture is QwenLLM
        # The error must enumerate the registered tracking architectures so a
        # misconfigured YAML produces an actionable message.
        assert "SAMURAI" in err.registered
        assert "SAM2" in err.registered
        assert "SAM2Long" in err.registered
        assert "YOLO11Seg" in err.registered

    def test_sam3_tracking_raises_unknown_architecture_error(self) -> None:
        """SAM3 routes through the framework pre-dispatch, NOT the registry.

        If a config ever reaches ``create_tracking_loader`` with a
        :class:`SAM3Tracking` architecture, that means the framework
        pre-dispatch was bypassed (a routing bug). The registry must fail
        loudly with :class:`UnknownArchitectureError` rather than silently
        instantiating one of the SAM2 loaders.
        """
        with pytest.raises(UnknownArchitectureError) as exc_info:
            create_tracking_loader(SAM3Tracking(), _config())  # type: ignore[arg-type]

        assert exc_info.value.family == "tracking"
        assert exc_info.value.architecture is SAM3Tracking
