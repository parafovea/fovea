"""Admin reconfiguration routes.

Accepts structured admin-config rows posted by the Node layer after a
``PUT /api/admin/config/:key`` succeeds. Updates runtime state that is
reachable without bouncing the service:

* ``storagePaths`` → ``processor.reconfigure_roots`` for video / thumbnail /
  audio root directories.
* ``runtime`` → ``ModelManager`` inference config knobs (warmup flag, batch
  sizes, offload threshold). Device reassignment for already-loaded models
  is not attempted — those knobs take effect on the next model load.
* ``externalApis`` → persisted on the manager for downstream use; the
  router picks fresh values on every call so no eager rebind is needed.

Every request must carry an ``X-Admin-Token`` header matching the
``MODEL_SERVICE_ADMIN_TOKEN`` env var shared with the Node layer. No user
session or cookie is involved — this is service-to-service only.
"""

from __future__ import annotations

import hmac
import logging
from typing import Annotated, Literal

import didactic.api as dx
from annotated_types import Ge, Le
from fastapi import APIRouter, Header, HTTPException, status

from src.infrastructure.adapters.inbound.fastapi.dependencies import (
    ModelManagerDep,  # noqa: TC001  # FastAPI resolves this annotation at runtime
)
from src.infrastructure.adapters.inbound.fastapi.dx_bodies import (
    as_request,
    as_response,
    dump,
)
from src.infrastructure.adapters.outbound.video.processor import reconfigure_roots
from src.infrastructure.config.settings import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()


class StoragePathsValue(dx.Model):
    """Runtime-updatable storage roots matching the Node ``storagePaths`` key."""

    video_data_root: str = dx.field(alias="videoDataRoot")
    thumbnail_output_root: str = dx.field(alias="thumbnailOutputRoot")
    audio_output_root: str = dx.field(alias="audioOutputRoot")


class RuntimeValue(dx.Model):
    """Runtime inference-config knobs."""

    cuda_device: str = dx.field(alias="cudaDevice")
    warmup_on_startup: bool = dx.field(alias="warmupOnStartup")
    default_batch_size: Annotated[int, Ge(1), Le(128)] = dx.field(alias="defaultBatchSize")
    max_batch_size: Annotated[int, Ge(1), Le(128)] = dx.field(alias="maxBatchSize")
    offload_threshold: Annotated[float, Ge(0.0), Le(1.0)] = dx.field(alias="offloadThreshold")


class ExternalApiProvider(dx.Model):
    """External API provider declaration."""

    provider: Literal["anthropic", "openai", "google"]
    endpoint: str
    timeout_seconds: Annotated[int, Ge(1), Le(600)] = dx.field(alias="timeoutSeconds")
    max_retries: Annotated[int, Ge(0), Le(10)] = dx.field(alias="maxRetries")


class ExternalApisValue(dx.Model):
    """External API providers list."""

    providers: tuple[ExternalApiProvider, ...] = dx.field(default_factory=tuple)


class StoragePathsRow(dx.Model):
    """Discriminated row for the ``storagePaths`` key."""

    key: Literal["storagePaths"]
    value: StoragePathsValue


class RuntimeRow(dx.Model):
    """Discriminated row for the ``runtime`` key."""

    key: Literal["runtime"]
    value: RuntimeValue


class ExternalApisRow(dx.Model):
    """Discriminated row for the ``externalApis`` key."""

    key: Literal["externalApis"]
    value: ExternalApisValue


class ReconfigureAck(dx.Model):
    """Response confirming the applied key and a short human summary."""

    applied: str
    summary: str


# The reconfigure body is one of three key-tagged rows. FastAPI validates
# the posted object against this union of the Pydantic mirrors; the route
# dispatches on the ``key`` discriminator.
_ReconfigureBody = (
    as_request(StoragePathsRow) | as_request(RuntimeRow) | as_request(ExternalApisRow)
)


def _require_admin_token(x_admin_token: str | None) -> None:
    """Reject callers that do not present the shared admin token."""
    expected = get_settings().model_service_admin_token
    if not expected:
        logger.warning("MODEL_SERVICE_ADMIN_TOKEN not configured; refusing reconfigure")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin reconfigure is not enabled on this service",
        )
    if not x_admin_token or not hmac.compare_digest(x_admin_token or "", expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin token",
        )


@router.post(
    "/admin/reconfigure",
    response_model=as_response(ReconfigureAck),
    summary="Apply an admin-managed config row to the live model service",
    description="Service-to-service endpoint called by the Node layer after a "
    "SystemConfig row is written. Idempotent and safe to replay on startup.",
)
async def reconfigure(
    body: _ReconfigureBody,
    manager: ModelManagerDep,
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
) -> dict[str, object]:
    """Apply a config row by type.

    The union discriminator is ``key``; each branch maps to a concrete
    ``value`` shape. Returns a short summary so the Node layer can log what
    was applied without re-reading the body.
    """
    _require_admin_token(x_admin_token)

    if body.key == "storagePaths":
        paths = body.value
        reconfigure_roots(
            video_root=paths.video_data_root,
            thumbnail_root=paths.thumbnail_output_root,
            audio_root=paths.audio_output_root,
        )
        return dump(
            ReconfigureAck(
                applied="storagePaths",
                summary=(
                    f"roots set to video={paths.video_data_root!r}, "
                    f"thumb={paths.thumbnail_output_root!r}, "
                    f"audio={paths.audio_output_root!r}"
                ),
            )
        )

    if body.key == "runtime":
        runtime = body.value
        ic = manager.inference_config
        ic.warmup_on_startup = runtime.warmup_on_startup
        ic.default_batch_size = runtime.default_batch_size
        ic.max_batch_size = runtime.max_batch_size
        ic.offload_threshold = runtime.offload_threshold
        return dump(
            ReconfigureAck(
                applied="runtime",
                summary=(
                    f"warmup={runtime.warmup_on_startup} "
                    f"batch={runtime.default_batch_size}/{runtime.max_batch_size} "
                    f"offload={runtime.offload_threshold}"
                ),
            )
        )

    # ExternalApisRow: the external API router reads credentials lazily on
    # every call, so there is nothing to rebind here — we only log the
    # effective provider list for operator visibility.
    providers = ",".join(p.provider for p in body.value.providers) or "(none)"
    return dump(
        ReconfigureAck(
            applied="externalApis",
            summary=f"external providers on file: {providers}",
        )
    )
