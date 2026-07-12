"""Shared fixtures for the layers codec tests.

Every test module here must guard its ``lairs`` / ``panproto`` imports with
``pytest.importorskip`` so the suite is a no-op outside the codec virtualenv.
The :class:`EmitContext` used by :func:`make_ctx` is lairs-free, so this
``conftest`` imports cleanly in any environment.
"""

from __future__ import annotations

from datetime import datetime, timezone

from src.application.ports.outbound.layers_codec import EmitContext

# A fixed instant so emitted records (and their round-trips) are deterministic.
# Never use ``datetime.now()`` in tests: it makes fragments non-reproducible.
FIXED_CREATED_AT = datetime(2026, 1, 1, tzinfo=timezone.utc)


def make_ctx(
    *,
    video_id: str = "video-0",
    tool: str = "test-tool",
    agent_id: str | None = None,
    persona_ref: str | None = None,
    authority: str = "local",
) -> EmitContext:
    """Build an :class:`EmitContext` with a fixed ``created_at`` for tests."""
    return EmitContext(
        video_id=video_id,
        created_at=FIXED_CREATED_AT,
        tool=tool,
        agent_id=agent_id,
        persona_ref=persona_ref,
        authority=authority,
    )
