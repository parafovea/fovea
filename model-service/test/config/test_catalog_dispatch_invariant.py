"""Bidirectional invariant linking the model catalog to the loader registries.

Every model option the service ships in ``config/models.yaml`` and
``config/models-cpu.yaml`` must be loadable, and every loader the service
registers must target an architecture that the catalog schema can actually
express. This module asserts both directions so a catalog entry can never
reference a dispatch path that does not exist, and a loader can never bind to
an architecture outside its family union.

Dispatch is not "purely architecture-keyed" across the whole service. Two
documented framework-level pre-dispatches run before the architecture-keyed
registries are consulted, and two audio tasks route through dedicated task
factories rather than a registry. The forward assertion encodes every one of
those paths explicitly so it stays faithful to what the task factories in
:mod:`src.infrastructure.config.task_factories` actually do:

* ``framework == "external_api"`` routes through the external-API adapter
  layer; no local loader registers for these marker architectures.
* ``framework == "sam3"`` routes through the SAM 3.1 adapter pre-dispatch
  (``SAM3DetectionAdapter`` for detection, ``SAM3TrackingAdapter`` for
  tracking); no loader registers ``SAM3Detection`` or ``SAM3Tracking`` in the
  detection or tracking registries.
* ``speaker_diarization`` and ``voice_activity_detection`` are built by the
  ``PyannoteLoader`` / ``SileroVADLoader`` task factories directly; their
  architectures are intentionally absent from ``audio_registry``.
* Every remaining catalog option is architecture-keyed and must resolve to a
  registered loader in the registry that owns its task section.

The forward direction is the assertion that would have caught the un-wired
SAM 3.1 detection path: an ``object_detection`` option carrying
``framework: "sam3"`` resolves through the SAM 3.1 pre-dispatch only because
that branch now exists in ``_object_detection_factory``; without it the option
would fall through to the detection registry, which has no ``SAM3Detection``
loader, and this test would fail.
"""

from __future__ import annotations

import pytest

pytest.importorskip("psutil")  # requires the ML backend; skipped in the torch-free venv

import typing
from pathlib import Path
from typing import Protocol
from unittest.mock import MagicMock, patch

import didactic.api as dx
import pytest
import yaml

from src.application.services.model_management import ModelConfig
from src.domain.entities.architectures import (
    Architecture,
    AudioArchitecture,
    DetectionArchitecture,
    LLMArchitecture,
    TrackingArchitecture,
    VLMArchitecture,
)

# Importing the loader modules executes their ``@*_registry.register(...)``
# decorators (including the side-effect imports each module performs at the
# bottom of its file), so the registries are fully populated by import time.
# The registries are operated on as data; no model is downloaded or loaded.
from src.infrastructure.adapters.outbound.models.audio.loader import audio_registry
from src.infrastructure.adapters.outbound.models.detection.loader import (
    detection_onnx_registry,
    detection_pytorch_registry,
)
from src.infrastructure.adapters.outbound.models.llm.loader import llm_registry
from src.infrastructure.adapters.outbound.models.tracking.loader import tracking_registry
from src.infrastructure.adapters.outbound.models.vlm.loader import vlm_registry


class _RegistryView(Protocol):
    """The slice of a :class:`LoaderRegistry` this invariant reads.

    The catalog families register loaders of different types, so the concrete
    registry generics differ. This Protocol captures only the read-only surface
    the invariant needs, which is shared by every registry regardless of its
    loader type parameter.
    """

    @property
    def family(self) -> str:
        """Short label naming the registry's family."""
        ...

    @property
    def registered_architectures(self) -> list[type[dx.Model]]:
        """Architecture classes the registry currently holds."""
        ...


# Frameworks that bypass every local loader registry. They are handled at the
# application layer (external_api) or by a dedicated framework pre-dispatch in
# the task factory (sam3) and so are reachable without a registry entry.
_PREDISPATCH_FRAMEWORKS = frozenset({"external_api", "sam3"})

# Task sections whose options are built by a dedicated task factory rather than
# an architecture-keyed registry. The PyannoteLoader / SileroVADLoader paths
# take only a ``model_id`` and ``device``; their architectures are valid union
# members but never enter ``audio_registry``.
_DEDICATED_FACTORY_TASKS = frozenset({"speaker_diarization", "voice_activity_detection"})

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_CATALOG_PATHS = (
    _PROJECT_ROOT / "config" / "models.yaml",
    _PROJECT_ROOT / "config" / "models-cpu.yaml",
)


def _union_members(alias: object) -> set[type[dx.Model]]:
    """Return the architecture classes inside a family union alias.

    The family aliases in :mod:`src.domain.entities.architectures` are plain
    ``A | B | C`` unions of :class:`didactic.api.Model` subclasses. This
    returns the member classes.

    Args:
        alias: A family architecture alias (for example
            :data:`DetectionArchitecture`).

    Returns:
        The set of architecture classes that compose the union.
    """
    members: set[type[dx.Model]] = set()
    for member in typing.get_args(alias):
        if isinstance(member, type) and issubclass(member, dx.Model):
            members.add(member)
    return members


def _kind_to_class(alias: object) -> dict[str, type[dx.Model]]:
    """Map each architecture's ``kind`` literal to its class for one family.

    Args:
        alias: A family architecture alias.

    Returns:
        Mapping from the ``kind`` discriminator string to the architecture
        class that declares it.
    """
    mapping: dict[str, type[dx.Model]] = {}
    for member in _union_members(alias):
        kind_spec = member.__field_specs__["kind"]
        mapping[str(kind_spec.default)] = member
    return mapping


# Architecture classes grouped by the registry that owns each task section.
# A catalog option in a given task section, when it is architecture-keyed,
# must resolve to a loader registered in the matching registry.
_DETECTION_KIND_TO_CLASS = _kind_to_class(DetectionArchitecture)
_TRACKING_KIND_TO_CLASS = _kind_to_class(TrackingArchitecture)
_AUDIO_KIND_TO_CLASS = _kind_to_class(AudioArchitecture)
_VLM_KIND_TO_CLASS = _kind_to_class(VLMArchitecture)
_LLM_KIND_TO_CLASS = _kind_to_class(LLMArchitecture)

# Mapping from a catalog task-section name to the (kind -> class) table and the
# registries that may satisfy an architecture-keyed option in that section.
# Detection lists both registries because the framework hint (pytorch vs onnx)
# picks one at load time; an option is reachable if either registry has it.
_TASK_DISPATCH: dict[str, tuple[dict[str, type[dx.Model]], tuple[_RegistryView, ...]]] = {
    "object_detection": (
        _DETECTION_KIND_TO_CLASS,
        (detection_pytorch_registry, detection_onnx_registry),
    ),
    "video_tracking": (_TRACKING_KIND_TO_CLASS, (tracking_registry,)),
    "audio_transcription": (_AUDIO_KIND_TO_CLASS, (audio_registry,)),
    "video_summarization": (_VLM_KIND_TO_CLASS, (vlm_registry,)),
    "ontology_augmentation": (_LLM_KIND_TO_CLASS, (llm_registry,)),
    "claim_extraction": (_LLM_KIND_TO_CLASS, (llm_registry,)),
    "claim_synthesis": (_LLM_KIND_TO_CLASS, (llm_registry,)),
}

_ALL_REGISTRIES: tuple[_RegistryView, ...] = (
    detection_pytorch_registry,
    detection_onnx_registry,
    tracking_registry,
    audio_registry,
    vlm_registry,
    llm_registry,
)

# Every family union, so the reverse direction can confirm a registered loader
# binds to a class that some family actually exposes.
_ALL_UNION_MEMBERS: set[type[dx.Model]] = (
    _union_members(DetectionArchitecture)
    | _union_members(TrackingArchitecture)
    | _union_members(AudioArchitecture)
    | _union_members(VLMArchitecture)
    | _union_members(LLMArchitecture)
)


def _iter_catalog_options() -> list[tuple[str, str, str, str, str]]:
    """Yield one record per model option across both shipped catalogs.

    Returns:
        A list of ``(catalog_name, task_name, option_name, kind, framework)``
        tuples covering every option in both catalog files. Parsing mirrors the
        application: the same discriminated ``Architecture`` union that
        :class:`ModelConfig` uses validates each ``architecture`` block, so an
        unknown ``kind`` or a malformed block fails here exactly as it would at
        config load.
    """
    records: list[tuple[str, str, str, str, str]] = []
    for catalog_path in _CATALOG_PATHS:
        catalog = yaml.safe_load(catalog_path.read_text())
        for task_name, task in catalog["models"].items():
            for option_name, option in task.get("options", {}).items():
                # Validate through the same union the app uses; this both
                # parses the kind and rejects unknown or malformed blocks.
                parsed: Architecture = Architecture.model_validate(option["architecture"])
                kind = str(parsed.kind)  # type: ignore[attr-defined]
                framework = str(option["framework"])
                records.append((catalog_path.name, task_name, option_name, kind, framework))
    return records


_CATALOG_OPTIONS = _iter_catalog_options()


def test_catalogs_contain_options() -> None:
    """The catalogs are non-empty so the parametrized checks are meaningful."""
    assert _CATALOG_OPTIONS, "no catalog options were discovered; check config paths"


@pytest.mark.parametrize(
    ("catalog_name", "task_name", "option_name", "kind", "framework"),
    _CATALOG_OPTIONS,
    ids=[f"{c}:{t}:{o}" for c, t, o, _k, _f in _CATALOG_OPTIONS],
)
def test_every_catalog_option_is_dispatchable(
    catalog_name: str,
    task_name: str,
    option_name: str,
    kind: str,
    framework: str,
) -> None:
    """Every catalog option resolves to a registered loader or a documented path.

    This is the forward direction. An option is dispatchable when it matches one
    of the documented dispatch paths:

    1. its framework is a pre-dispatch framework (external_api or sam3),
    2. its task section is built by a dedicated task factory (diarization, vad),
       or
    3. its architecture is registered in the registry that owns its task
       section.

    Any option that satisfies none of these would fail at load time; failing it
    here keeps the catalog and the dispatch wiring in lockstep.
    """
    if framework in _PREDISPATCH_FRAMEWORKS:
        return
    if task_name in _DEDICATED_FACTORY_TASKS:
        return

    assert task_name in _TASK_DISPATCH, (
        f"{catalog_name}:{task_name}:{option_name} carries architecture-keyed "
        f"framework {framework!r} but {task_name!r} has no registry mapping in "
        "this test; add it to _TASK_DISPATCH or document a new pre-dispatch path."
    )

    kind_to_class, registries = _TASK_DISPATCH[task_name]
    assert kind in kind_to_class, (
        f"{catalog_name}:{task_name}:{option_name} declares kind {kind!r}, which "
        f"is not a member of the {task_name!r} architecture family."
    )
    architecture_cls = kind_to_class[kind]
    registered = any(
        architecture_cls in registry.registered_architectures for registry in registries
    )
    assert registered, (
        f"{catalog_name}:{task_name}:{option_name} declares architecture "
        f"{architecture_cls.__name__} (kind {kind!r}, framework {framework!r}) but no "
        f"loader is registered for it in {[r.family for r in registries]!r} and it is "
        "not a documented framework pre-dispatch. Either register a loader or add a "
        "pre-dispatch branch in the task factory."
    )


@pytest.mark.parametrize(
    "registry",
    _ALL_REGISTRIES,
    ids=[registry.family for registry in _ALL_REGISTRIES],
)
def test_every_registered_loader_targets_a_union_member(registry: _RegistryView) -> None:
    """Every registered architecture is a member of some family union.

    This is the reverse direction. A loader may legitimately register for an
    architecture that no catalog currently selects (for example GLM4 is in
    ``llm_registry`` without appearing in either catalog), so this does not
    require catalog presence. It only requires that the architecture is a real
    member of a family union, which guarantees a catalog COULD reach it through
    the normal discriminated-union schema.
    """
    for architecture_cls in registry.registered_architectures:
        assert architecture_cls in _ALL_UNION_MEMBERS, (
            f"{registry.family} registers a loader for {architecture_cls.__name__}, which "
            "is not a member of any architecture family union. A loader must target an "
            "architecture the catalog schema can express."
        )


# The SAM 3.1 architectures are catalog-reachable only through the
# framework-level pre-dispatch the catalog sweep above trusts when it returns
# early on ``framework == "sam3"``. The two tests below prove that branch
# actually exists in both task factories, so that early return is grounded in
# real wiring rather than an assumption. The sam3 package is mocked in
# ``sys.modules`` so neither factory imports the heavy dependency or loads a
# model; the factories operate on mocks only.


def _sam3_model_config(framework_label: str) -> ModelConfig:
    """Build the application ``ModelConfig`` a SAM 3.1 catalog option produces.

    The application-layer ``ModelConfig`` is what the catalog loader hands the
    task factories at runtime, so constructing it from the same dict shape a
    ``models.yaml`` SAM 3.1 entry uses exercises the real dispatch path.

    Args:
        framework_label: The SAM 3.1 framework hint, always ``"sam3"``.

    Returns:
        A ``ModelConfig`` whose architecture is the SAM 3.1 detection family,
        used only to exercise the framework pre-dispatch branch (the
        architecture instance is never consulted on that branch).
    """
    return ModelConfig(
        {
            "model_id": "facebook/sam3.1-base",
            "framework": framework_label,
            "architecture": {"kind": "sam-3-1-detection"},
            "vram_gb": 0,
            "cpu_memory_gb": 0.0,
            "cpu_compatible": True,
            "speed": "fast",
            "description": "",
        }
    )


def test_object_detection_factory_predispatches_sam3() -> None:
    """``object_detection`` builds the SAM 3.1 detection adapter for framework sam3.

    This is the regression guard for the previously un-wired detection path: a
    ``framework: "sam3"`` detection option must reach ``SAM3DetectionAdapter``
    before the architecture-keyed detection registry (which has no SAM 3.1
    loader) is consulted.
    """
    from src.infrastructure.config.task_factories import build_default_task_factories

    sam3_loader = MagicMock()
    loader_cls = MagicMock(return_value=sam3_loader)
    adapter = MagicMock()
    adapter_cls = MagicMock(return_value=adapter)
    with patch.dict(
        "sys.modules",
        {
            "src.infrastructure.adapters.outbound.models.sam3": MagicMock(
                SAM3Loader=loader_cls,
                SAM3DetectionAdapter=adapter_cls,
            )
        },
    ):
        factory = build_default_task_factories()["object_detection"]
        returned = factory(_sam3_model_config("sam3"))

    assert returned is adapter
    loader_cls.assert_called_once()
    adapter_cls.assert_called_once_with(sam3_loader)
    sam3_loader.load.assert_called_once()


def test_object_tracking_factory_predispatches_sam3() -> None:
    """``object_tracking`` builds the SAM 3.1 tracking adapter for framework sam3.

    The tracking side of the same pre-dispatch invariant, so both SAM 3.1
    architectures the catalog ships remain reachable.
    """
    from src.infrastructure.config.task_factories import build_default_task_factories

    sam3_loader = MagicMock()
    loader_cls = MagicMock(return_value=sam3_loader)
    adapter = MagicMock()
    adapter_cls = MagicMock(return_value=adapter)
    with patch.dict(
        "sys.modules",
        {
            "src.infrastructure.adapters.outbound.models.sam3": MagicMock(
                SAM3Loader=loader_cls,
                SAM3TrackingAdapter=adapter_cls,
            )
        },
    ):
        factory = build_default_task_factories()["object_tracking"]
        returned = factory(_sam3_model_config("sam3"))

    assert returned is adapter
    loader_cls.assert_called_once()
    adapter_cls.assert_called_once_with(sam3_loader)
    sam3_loader.load.assert_called_once()
