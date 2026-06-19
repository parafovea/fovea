"""Object detection loader subpackage.

The shared base (registries, install hints, factory) lives in :mod:`.base`;
each concrete pytorch / ultralytics / transformers loader lives in its own
module and registers against the architecture it implements via
``@detection_pytorch_registry.register(...)``. The public aggregator is
:mod:`src.infrastructure.adapters.outbound.models.detection.loader`.
"""
