"""Layers interchange routes.

Two thin surfaces over the normalized ``pub.layers.*`` record shape:

- ``POST /api/layers/import`` validates posted records against the canonical
  ``local_id`` / ``nsid`` / ``value_json`` shape and returns them as a fragment
  the server persists, and
- ``POST /api/layers/export`` serializes posted records as newline-delimited JSON
  (JSONL), the flat layers-fragment interchange form.

``value_json`` is a JSON-encoded string on the wire in both directions: the server
serializes each record's value before an export and parses it after an import.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

import didactic.api as dx
from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from src.application.ports.outbound.layers_codec import NormalizedRecordDTO
from src.infrastructure.adapters.inbound.fastapi.dx_bodies import (
    as_request,
    as_response,
    dump,
)

router = APIRouter(prefix="/layers", tags=["layers"])


class LayersRecord(dx.Model):
    """A single normalized layers record on the wire."""

    local_id: str = dx.field(description="Fragment-local record identifier.")
    nsid: str = dx.field(description="Canonical pub.layers.* namespace id.")
    value_json: str = dx.field(description="Record model serialized as JSON.")


class ImportRequest(dx.Model):
    """Request body for normalizing posted layers records."""

    records: tuple[LayersRecord, ...] = dx.field(default_factory=tuple)
    source: str | None = dx.field(default=None, description="Source/provenance label.")


class ImportResponse(dx.Model):
    """The normalized layers fragment."""

    records: tuple[LayersRecord, ...] = dx.field(default_factory=tuple)
    source: str | None = None


class ExportRequest(dx.Model):
    """Request body for exporting layers records as JSONL."""

    records: tuple[LayersRecord, ...] = dx.field(default_factory=tuple)
    corpus_name: str = dx.field(default="fovea", description="Corpus label.")


if TYPE_CHECKING:
    # Handlers type-check against the source wire models; at runtime the body is
    # the Pydantic mirror FastAPI validates against (the ``else`` branch).
    _ImportRequestBody = ImportRequest
    _ExportRequestBody = ExportRequest
else:
    _ImportRequestBody = as_request(ImportRequest)
    _ExportRequestBody = as_request(ExportRequest)


@router.post(
    "/import",
    response_model=as_response(ImportResponse),
    summary="Normalize posted layers records into a fragment.",
)
async def import_layers(request: _ImportRequestBody) -> dict[str, object]:
    """Normalize posted layers records into the canonical fragment shape.

    Each posted record is validated against the canonical
    ``local_id`` / ``nsid`` / ``value_json`` shape (``value_json`` is a
    JSON-encoded string) and returned as a fragment the server persists.
    """
    return dump(
        ImportResponse(
            records=tuple(
                LayersRecord(
                    local_id=record.local_id,
                    nsid=record.nsid,
                    value_json=record.value_json,
                )
                for record in request.records
            ),
            source=request.source,
        )
    )


@router.post(
    "/export",
    response_class=PlainTextResponse,
    summary="Export layers records as JSONL.",
)
async def export_layers(request: _ExportRequestBody) -> PlainTextResponse:
    """Serialize posted layers records as newline-delimited JSON (JSONL)."""
    records = [
        NormalizedRecordDTO(
            local_id=record.local_id, nsid=record.nsid, value_json=record.value_json
        )
        for record in request.records
    ]
    lines = "\n".join(
        json.dumps({"local_id": r.local_id, "nsid": r.nsid, "value_json": r.value_json})
        for r in records
    )
    return PlainTextResponse(content=lines, media_type="application/x-ndjson")
