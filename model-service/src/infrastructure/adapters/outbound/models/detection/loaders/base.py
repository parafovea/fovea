"""Shared base for open-vocabulary object detection loaders.

This module owns the architecture-keyed registries and the factory that
every concrete detection loader builds on:

* :data:`detection_pytorch_registry` — loaders that drive a PyTorch /
  Ultralytics / Transformers backend.
* :data:`detection_onnx_registry` — loaders that drive an ONNX Runtime
  session for CPU inference (defined in the ONNX subpackage and
  re-exported here).

A loader class registers itself against the architecture Pydantic
subclass it implements via the appropriate registry's ``@register``
decorator. The :func:`create_detection_loader` factory inspects the
framework on the :class:`DetectionConfig`, picks the matching registry,
and instantiates the loader through it. No code in this module matches
on model-id substrings, weights filenames, or free-text labels; the
architecture Pydantic class is the only legitimate dispatch key.

The two-registry design reflects the fact that the same architecture
(for example :class:`YOLOWorld`) is driven by two distinct loader
classes depending on the backend: a pytorch / ultralytics
:class:`YOLOWorldLoader` and an ONNX :class:`YOLOWorldONNXLoader` with a
different inheritance chain. Collapsing both into one registry would
either force a synthetic ``(framework, architecture)`` lookup key or
overwrite one entry with the other; keeping the registries separate
matches the natural fiber of the loader hierarchy.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from src.infrastructure.adapters.outbound.models.detection.base import (
    DetectionConfig,
    DetectionFramework,
    DetectionModelLoader,
)
from src.infrastructure.adapters.outbound.models.onnx.registry import detection_onnx_registry
from src.infrastructure.adapters.outbound.models.registry import LoaderRegistry

if TYPE_CHECKING:
    from src.domain.entities.architectures import DetectionArchitecture

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Registries.
#
# Two independent registries because the same architecture maps to two
# distinct loader classes depending on the backend (pytorch / ultralytics
# / transformers vs. ONNX Runtime). The registries do not share state.
# ---------------------------------------------------------------------------

detection_pytorch_registry: LoaderRegistry[DetectionArchitecture, DetectionModelLoader] = (
    LoaderRegistry(family="detection_pytorch")
)
"""Loaders for PyTorch, Ultralytics, and Transformers detection backends."""


# ---------------------------------------------------------------------------
# Install hints for optional backend dependencies.
# ---------------------------------------------------------------------------

YOLOE_INSTALL_HINT = "YOLOE (open-vocab YOLO) required; install with: pip install ultralytics"
RFDETR_INSTALL_HINT = "rfdetr package required; install with: pip install rfdetr"


def create_detection_loader(
    architecture: DetectionArchitecture,
    config: DetectionConfig,
) -> DetectionModelLoader:
    """Instantiate the detection loader registered for an architecture.

    The framework on the :class:`DetectionConfig` selects the
    pytorch-backed registry or the ONNX-backed registry; the architecture
    instance then selects the concrete loader class within that registry.
    No model-id, weights filename, or free-text label is inspected on
    this path.

    Parameters
    ----------
    architecture : DetectionArchitecture
        Parsed architecture model (a member of the discriminated union
        defined in :mod:`src.domain.entities.architectures`).
    config : DetectionConfig
        Framework-level configuration including the model id, device,
        and confidence threshold.

    Returns
    -------
    DetectionModelLoader
        A fresh loader instance bound to the supplied architecture and
        config. The loader is NOT loaded; the caller must invoke
        ``load()`` before ``detect()``.

    Raises
    ------
    src.infrastructure.adapters.outbound.models.registry.UnknownArchitectureError
        When no loader has registered against ``type(architecture)`` in
        the selected registry. The error message lists every registered
        architecture so a misconfigured YAML fails loudly.
    """
    registry = (
        detection_onnx_registry
        if config.framework == DetectionFramework.ONNX
        else detection_pytorch_registry
    )
    return registry.create(architecture, config)
