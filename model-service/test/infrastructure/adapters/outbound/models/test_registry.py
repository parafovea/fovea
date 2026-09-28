"""Tests for the architecture-keyed loader registry.

The registry is the only legitimate dispatch surface for picking a
loader from a model config. These tests lock the contract:

  * registering and looking up a loader for a known architecture works
  * looking up an unregistered architecture raises a typed error that
    names the family and the registered architectures
  * registering two distinct classes for the same architecture raises
  * registering the same class for the same architecture twice is a
    no-op (idempotent under double-import)
  * the create() helper passes the architecture model and any extras
    through to the loader constructor unchanged
  * the registry rejects non-didactic-Model architecture arguments at
    runtime even when a caller bypasses static typing
"""

from __future__ import annotations

from typing import Literal

import didactic.api as dx
import pytest

from src.infrastructure.adapters.outbound.models.registry import (
    DuplicateArchitectureError,
    LoaderRegistry,
    UnknownArchitectureError,
)


class _ArchA(dx.Model):
    kind: Literal["arch-a"] = "arch-a"


class _ArchB(dx.Model):
    kind: Literal["arch-b"] = "arch-b"


class _ArchUnknown(dx.Model):
    kind: Literal["arch-unknown"] = "arch-unknown"


class _LoaderProtocol:
    """Minimal loader stub: accepts the architecture model + extras and stashes them."""

    def __init__(self, arch: dx.Model, *args: object, **kwargs: object) -> None:
        self.arch = arch
        self.args = args
        self.kwargs = kwargs


class _LoaderA(_LoaderProtocol):
    pass


class _LoaderB(_LoaderProtocol):
    pass


class _LoaderA_Alt(_LoaderProtocol):
    pass


class TestLoaderRegistry:
    def test_register_then_lookup_returns_loader_class(self) -> None:
        reg: LoaderRegistry[_ArchA, _LoaderA] = LoaderRegistry(family="test")

        @reg.register(_ArchA)
        class _MyLoader(_LoaderProtocol):
            pass

        assert reg.lookup(_ArchA) is _MyLoader

    def test_lookup_unknown_architecture_raises_with_family_and_registered(self) -> None:
        reg: LoaderRegistry[_ArchA, _LoaderA] = LoaderRegistry(family="vlm")
        reg.register(_ArchA)(_LoaderA)

        with pytest.raises(UnknownArchitectureError) as exc_info:
            reg.lookup(_ArchUnknown)

        err = exc_info.value
        assert err.family == "vlm"
        assert err.architecture is _ArchUnknown
        assert "_ArchA" in err.registered
        assert "vlm" in str(err)

    def test_duplicate_registration_with_different_class_raises(self) -> None:
        reg: LoaderRegistry[_ArchA, _LoaderA] = LoaderRegistry(family="test")
        reg.register(_ArchA)(_LoaderA)

        with pytest.raises(DuplicateArchitectureError) as exc_info:
            reg.register(_ArchA)(_LoaderA_Alt)

        err = exc_info.value
        assert err.existing is _LoaderA
        assert err.attempted is _LoaderA_Alt
        assert err.architecture is _ArchA

    def test_duplicate_registration_with_same_class_is_idempotent(self) -> None:
        """Module double-import (pytest collection, hot-reload, etc.) must not crash."""
        reg: LoaderRegistry[_ArchA, _LoaderA] = LoaderRegistry(family="test")
        reg.register(_ArchA)(_LoaderA)
        reg.register(_ArchA)(_LoaderA)  # same class registered twice; allowed
        assert reg.lookup(_ArchA) is _LoaderA

    def test_create_passes_architecture_and_extras_through(self) -> None:
        reg: LoaderRegistry[_ArchA, _LoaderProtocol] = LoaderRegistry(family="test")
        reg.register(_ArchA)(_LoaderProtocol)

        arch = _ArchA()
        instance = reg.create(arch, "extra-positional", named="extra-named")

        assert isinstance(instance, _LoaderProtocol)
        assert instance.arch is arch
        assert instance.args == ("extra-positional",)
        assert instance.kwargs == {"named": "extra-named"}

    def test_register_rejects_non_model_architecture(self) -> None:
        reg: LoaderRegistry[dx.Model, _LoaderProtocol] = LoaderRegistry(family="test")

        with pytest.raises(TypeError, match="didactic Model class"):
            reg.register("not-a-class")  # type: ignore[arg-type]

        with pytest.raises(TypeError, match="didactic Model class"):
            reg.register(_LoaderProtocol)  # type: ignore[arg-type]

    def test_register_rejects_model_instance_instead_of_class(self) -> None:
        reg: LoaderRegistry[_ArchA, _LoaderProtocol] = LoaderRegistry(family="test")

        with pytest.raises(TypeError, match="didactic Model class"):
            reg.register(_ArchA())  # type: ignore[arg-type]

    def test_family_is_required_and_non_empty(self) -> None:
        with pytest.raises(TypeError, match="non-empty string"):
            LoaderRegistry(family="")

        with pytest.raises(TypeError, match="non-empty string"):
            LoaderRegistry(family=None)  # type: ignore[arg-type]

    def test_registered_architectures_preserves_insertion_order(self) -> None:
        reg: LoaderRegistry[dx.Model, _LoaderProtocol] = LoaderRegistry(family="test")
        reg.register(_ArchA)(_LoaderA)
        reg.register(_ArchB)(_LoaderB)

        assert reg.registered_architectures == [_ArchA, _ArchB]

    def test_two_different_registries_do_not_share_state(self) -> None:
        a: LoaderRegistry[_ArchA, _LoaderProtocol] = LoaderRegistry(family="alpha")
        b: LoaderRegistry[_ArchA, _LoaderProtocol] = LoaderRegistry(family="beta")
        a.register(_ArchA)(_LoaderA)

        with pytest.raises(UnknownArchitectureError):
            b.lookup(_ArchA)

    def test_decorator_returns_loader_class_unchanged(self) -> None:
        """The @register decorator must be transparent on the decorated class."""
        reg: LoaderRegistry[_ArchA, _LoaderProtocol] = LoaderRegistry(family="test")
        before = _LoaderProtocol
        after = reg.register(_ArchA)(before)
        assert after is before

    def test_unknown_architecture_error_lists_registered_alphabetically(self) -> None:
        reg: LoaderRegistry[dx.Model, _LoaderProtocol] = LoaderRegistry(family="test")
        reg.register(_ArchB)(_LoaderB)
        reg.register(_ArchA)(_LoaderA)

        with pytest.raises(UnknownArchitectureError) as exc_info:
            reg.lookup(_ArchUnknown)

        # Sorted output keeps error messages stable and grep-friendly.
        assert exc_info.value.registered == ["_ArchA", "_ArchB"]
