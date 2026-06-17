"""Tests for the detection family loader factory.

These tests pin the architecture-keyed dispatch contract for
:func:`create_detection_loader`:

  * every detection architecture registered against the pytorch
    registry resolves to its declared loader class when the framework
    is anything except ONNX
  * every detection architecture registered against the ONNX registry
    resolves to its declared loader class when the framework is ONNX
  * the loader receives the architecture instance as its first
    positional argument and exposes it on the ``arch`` attribute
  * an architecture from a different family (VLM, LLM, Tracking,
    Audio) raises :class:`UnknownArchitectureError` with the right
    family label in the message rather than silently falling through
  * an architecture that is registered for pytorch only (or ONNX only)
    raises :class:`UnknownArchitectureError` when the framework
    selects the wrong registry
  * the discriminated :data:`DetectionArchitecture` union and the
    union of both registries agree on which architectures the family
    supports
  * the two registries are independent: registering the same
    architecture against both does not cause cross-talk

No test in this module may inspect ``model_id`` substrings. The
architecture Pydantic class is the only legitimate dispatch key.
"""

from __future__ import annotations

from typing import get_args

import pytest

from src.domain.entities.architectures import (
    RFDETR,
    YOLOE,
    DetectionArchitecture,
    Florence2Detection,
    GroundingDINO,
    OWLv2,
    QwenLLM,
    YOLOv12,
    YOLOWorld,
)
from src.infrastructure.adapters.outbound.models.detection.loader import (
    DetectionConfig,
    DetectionFramework,
    Florence2Loader,
    GroundingDINOLoader,
    OWLv2Loader,
    RFDETRLoader,
    YOLOELoader,
    YOLOv12Loader,
    YOLOWorldLoader,
    create_detection_loader,
    detection_onnx_registry,
    detection_pytorch_registry,
)
from src.infrastructure.adapters.outbound.models.onnx.florence import Florence2ONNXLoader
from src.infrastructure.adapters.outbound.models.onnx.grounding_dino import (
    GroundingDINOONNXLoader,
)
from src.infrastructure.adapters.outbound.models.onnx.yolo_world import YOLOWorldONNXLoader
from src.infrastructure.adapters.outbound.models.registry import UnknownArchitectureError


def _pytorch_config(model_id: str = "vendor/placeholder") -> DetectionConfig:
    """Build a DetectionConfig for dispatch-only tests on the pytorch path.

    The factory never touches weights at construction time, so a
    placeholder ``model_id`` and a CPU device are sufficient for
    asserting which loader class the registry resolves to.
    """
    return DetectionConfig(
        model_id=model_id,
        framework=DetectionFramework.PYTORCH,
        device="cpu",
    )


def _onnx_config(model_id: str = "vendor/placeholder") -> DetectionConfig:
    """Build a DetectionConfig for dispatch-only tests on the ONNX path."""
    return DetectionConfig(
        model_id=model_id,
        framework=DetectionFramework.ONNX,
        device="cpu",
    )


class TestPytorchRegistryBindings:
    """Each DetectionArchitecture maps to the registered pytorch loader."""

    @pytest.mark.parametrize(
        ("architecture", "loader_cls"),
        [
            (YOLOWorld(), YOLOWorldLoader),
            (YOLOE(), YOLOELoader),
            (YOLOv12(), YOLOv12Loader),
            (RFDETR(), RFDETRLoader),
            (GroundingDINO(), GroundingDINOLoader),
            (OWLv2(), OWLv2Loader),
            (Florence2Detection(), Florence2Loader),
        ],
    )
    def test_create_dispatches_to_registered_pytorch_loader(
        self,
        architecture: object,
        loader_cls: type,
    ) -> None:
        loader = create_detection_loader(architecture, _pytorch_config())  # type: ignore[arg-type]
        assert isinstance(loader, loader_cls)
        assert loader.arch is architecture
        assert loader.config.framework == DetectionFramework.PYTORCH

    @pytest.mark.parametrize(
        "framework",
        [
            DetectionFramework.PYTORCH,
            DetectionFramework.ULTRALYTICS,
            DetectionFramework.TRANSFORMERS,
        ],
    )
    def test_non_onnx_frameworks_all_route_to_pytorch_registry(
        self,
        framework: DetectionFramework,
    ) -> None:
        """PYTORCH, ULTRALYTICS, and TRANSFORMERS all use the pytorch registry."""
        config = DetectionConfig(model_id="vendor/x", framework=framework, device="cpu")
        loader = create_detection_loader(YOLOWorld(), config)
        assert isinstance(loader, YOLOWorldLoader)

    def test_loader_constructor_accepts_architecture_first(self) -> None:
        """The base ``__init__`` contract is (arch, config) positional."""
        arch = YOLOWorld()
        config = _pytorch_config()
        loader = YOLOWorldLoader(arch, config)
        assert loader.arch is arch
        assert loader.config is config
        # ``model`` is the deferred weight handle; load() populates it.
        assert loader.model is None

    def test_pytorch_registry_family_label(self) -> None:
        assert detection_pytorch_registry.family == "detection_pytorch"


class TestONNXRegistryBindings:
    """Each ONNX-supported DetectionArchitecture maps to the ONNX loader."""

    @pytest.mark.parametrize(
        ("architecture", "loader_cls"),
        [
            (YOLOWorld(), YOLOWorldONNXLoader),
            (GroundingDINO(), GroundingDINOONNXLoader),
            (Florence2Detection(), Florence2ONNXLoader),
        ],
    )
    def test_create_dispatches_to_registered_onnx_loader(
        self,
        architecture: object,
        loader_cls: type,
    ) -> None:
        loader = create_detection_loader(architecture, _onnx_config())  # type: ignore[arg-type]
        assert isinstance(loader, loader_cls)
        assert loader.arch is architecture
        assert loader.config.framework == DetectionFramework.ONNX

    def test_onnx_loader_constructor_accepts_architecture_first(self) -> None:
        """ONNX subloaders override __init__ but still take (arch, config)."""
        arch = YOLOWorld()
        config = _onnx_config()
        loader = YOLOWorldONNXLoader(arch, config)
        assert loader.arch is arch
        assert loader.config is config

    def test_onnx_registry_family_label(self) -> None:
        assert detection_onnx_registry.family == "detection_onnx"


class TestRegistryCoverage:
    """The two registries together cover the DetectionArchitecture union."""

    def test_pytorch_registry_covers_every_local_detection_architecture(self) -> None:
        """Every LOCAL member of the DetectionArchitecture union has a pytorch loader.

        ONNX support is partial (only YOLOWorld, GroundingDINO, and
        Florence2Detection have ONNX loaders today). The pytorch registry,
        on the other hand, is the canonical backend and must cover every
        local architecture in the discriminated union; a YAML config
        naming any of them with a non-ONNX framework would otherwise
        fail at runtime with :class:`UnknownArchitectureError`.

        SAM3Detection is intentionally NOT registered: its YAML entries
        are routed through a framework-level pre-dispatch
        (``framework: sam3``) in the task factory before
        ``create_detection_loader`` is reached. Asking either detection
        registry to resolve it raises :class:`UnknownArchitectureError`,
        the desired loud-fail behaviour for routing bugs. The
        exhaustiveness check filters it out by name.
        """
        union_type = get_args(DetectionArchitecture)[0]
        members = set(get_args(union_type))
        framework_pre_dispatched = {cls for cls in members if cls.__name__.startswith("SAM3")}
        local_members = members - framework_pre_dispatched
        registered = set(detection_pytorch_registry.registered_architectures)

        missing = local_members - registered
        assert not missing, (
            "Local DetectionArchitecture subclasses without a registered pytorch loader: "
            f"{sorted(c.__name__ for c in missing)}"
        )

        accidentally_registered = framework_pre_dispatched & registered
        assert not accidentally_registered, (
            "Framework-pre-dispatched DetectionArchitecture subclasses must not be "
            "registered in detection_pytorch_registry (they route through framework: sam3 "
            f"in the task factory); accidentally registered: "
            f"{sorted(c.__name__ for c in accidentally_registered)}"
        )

    def test_no_registry_advertises_unknown_architectures(self) -> None:
        """Neither registry may expose loaders for architectures outside the union."""
        union_type = get_args(DetectionArchitecture)[0]
        members = set(get_args(union_type))

        pytorch_unknown = set(detection_pytorch_registry.registered_architectures) - members
        assert not pytorch_unknown, (
            "detection_pytorch_registry has loaders for non-DetectionArchitecture: "
            f"{sorted(c.__name__ for c in pytorch_unknown)}"
        )

        onnx_unknown = set(detection_onnx_registry.registered_architectures) - members
        assert not onnx_unknown, (
            "detection_onnx_registry has loaders for non-DetectionArchitecture: "
            f"{sorted(c.__name__ for c in onnx_unknown)}"
        )

    def test_onnx_registry_is_a_strict_subset_of_pytorch_registry(self) -> None:
        """Every ONNX-supported architecture also has a pytorch loader.

        The reverse is not true (ONNX support is opt-in per architecture),
        but it would be incoherent for an architecture to have only an
        ONNX path. The pytorch registry is the canonical detection
        backend.
        """
        pytorch = set(detection_pytorch_registry.registered_architectures)
        onnx = set(detection_onnx_registry.registered_architectures)
        assert onnx.issubset(pytorch), (
            "ONNX registry has architectures not present in pytorch registry: "
            f"{sorted(c.__name__ for c in (onnx - pytorch))}"
        )


class TestUnknownArchitecture:
    """An architecture from a different family must fail loudly on both paths."""

    def test_llm_architecture_on_pytorch_path_raises(self) -> None:
        with pytest.raises(UnknownArchitectureError) as exc_info:
            create_detection_loader(QwenLLM(), _pytorch_config())  # type: ignore[arg-type]

        err = exc_info.value
        assert err.family == "detection_pytorch"
        assert err.architecture is QwenLLM
        # The error must enumerate every registered detection architecture so
        # a misconfigured YAML produces an actionable message.
        for expected in ("YOLOWorld", "YOLOE", "YOLOv12", "RFDETR", "GroundingDINO", "OWLv2"):
            assert expected in err.registered

    def test_llm_architecture_on_onnx_path_raises(self) -> None:
        with pytest.raises(UnknownArchitectureError) as exc_info:
            create_detection_loader(QwenLLM(), _onnx_config())  # type: ignore[arg-type]

        err = exc_info.value
        assert err.family == "detection_onnx"
        assert err.architecture is QwenLLM

    @pytest.mark.parametrize(
        "architecture",
        [
            YOLOE(),
            YOLOv12(),
            RFDETR(),
            OWLv2(),
        ],
    )
    def test_pytorch_only_architecture_on_onnx_path_raises(
        self,
        architecture: object,
    ) -> None:
        """An architecture without an ONNX loader must fail on the ONNX path.

        ONNX support is partial. Asking for an architecture that has no
        ONNX loader registered with framework=ONNX must raise; silently
        falling back to the pytorch loader would defeat the purpose of
        the framework field.
        """
        with pytest.raises(UnknownArchitectureError) as exc_info:
            create_detection_loader(architecture, _onnx_config())  # type: ignore[arg-type]

        err = exc_info.value
        assert err.family == "detection_onnx"
        assert err.architecture is type(architecture)


class TestRegistryIndependence:
    """The pytorch and ONNX registries are independent dispatch tables.

    The same architecture (YOLOWorld, GroundingDINO, Florence2Detection)
    is registered against both registries with distinct loader classes;
    dispatch picks the right one based on framework. This test pins
    that the registries do not share state.
    """

    def test_same_architecture_resolves_to_different_loaders_per_framework(self) -> None:
        arch = YOLOWorld()
        pytorch_loader = create_detection_loader(arch, _pytorch_config())
        onnx_loader = create_detection_loader(arch, _onnx_config())

        assert isinstance(pytorch_loader, YOLOWorldLoader)
        assert isinstance(onnx_loader, YOLOWorldONNXLoader)
        assert type(pytorch_loader) is not type(onnx_loader)

    def test_pytorch_registry_does_not_see_onnx_only_registrations(self) -> None:
        """Removing an architecture from pytorch must not affect ONNX, and vice versa.

        We assert structural independence via the registered_architectures
        property rather than mutating the global registries (which would
        bleed across tests). The fact that both registries report the
        same architecture pointing at *different* loader classes is the
        load-bearing observation here.
        """
        assert YOLOWorld in detection_pytorch_registry.registered_architectures
        assert YOLOWorld in detection_onnx_registry.registered_architectures
        assert detection_pytorch_registry.lookup(YOLOWorld) is not detection_onnx_registry.lookup(
            YOLOWorld
        )
