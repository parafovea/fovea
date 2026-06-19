"""Vision Language Model loader subpackage.

The shared base (enums, config, ABC, registry, factory) lives in
:mod:`.base`; each concrete loader lives in its own module and registers
against the architecture it implements via ``@vlm_registry.register(...)``.
The public aggregator is :mod:`src.infrastructure.adapters.outbound.models.vlm.loader`.
"""
