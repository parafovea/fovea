"""Layers interchange routes.

Two thin surfaces over the :class:`ILayersCodec` port:

- ``POST /api/layers/import`` decodes a serialized fovea envelope (``format`` +
  ``payload``) into normalized ``pub.layers.*`` records, and
- ``POST /api/layers/export`` serializes posted records as newline-delimited JSON
  (JSONL), the flat layers-fragment interchange form.

When the codec stack is unavailable (the ``lairs`` extras are not installed), the
bound codec is the null codec, whose methods raise :class:`RuntimeError`; the
import handler maps that to ``501 Not Implemented`` rather than a 500.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from src.application.ports.outbound.layers_codec import NormalizedRecordDTO
from src.infrastructure.adapters.inbound.fastapi.dependencies import (  # noqa: TC001
    LayersCodecDep,
)

router = APIRouter(prefix="/layers", tags=["layers"])


class LayersRecord(BaseModel):
    """A single normalized layers record on the wire."""

    local_id: str = Field(..., description="Fragment-local record identifier.")
    nsid: str = Field(..., description="Canonical pub.layers.* namespace id.")
    value_json: str = Field(..., description="Record model serialized as JSON.")


class ImportRequest(BaseModel):
    """Request body for decoding a serialized fovea envelope."""

    format: str = Field(default="fovea", description="Source format (e.g. 'fovea').")
    payload: str = Field(..., description="The serialized document to decode.")


class ImportResponse(BaseModel):
    """The decoded layers fragment."""

    records: list[LayersRecord]
    source: str | None = None


class ExportRequest(BaseModel):
    """Request body for exporting layers records as JSONL."""

    records: list[LayersRecord]
    corpus_name: str = Field(default="fovea", description="Corpus label.")


@router.post("/import", response_model=ImportResponse, summary="Decode a fovea envelope to layers records.")
async def import_layers(request: ImportRequest, codec: LayersCodecDep) -> ImportResponse:
    """Decode a serialized fovea envelope into normalized layers records."""
    try:
        fragment = codec.decode(request.payload, request.format)
    except RuntimeError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=f"Could not decode payload: {exc}") from exc

    return ImportResponse(
        records=[
            LayersRecord(
                local_id=record.local_id,
                nsid=record.nsid,
                value_json=record.value_json,
            )
            for record in fragment.records
        ],
        source=fragment.source,
    )


@router.post("/export", response_class=PlainTextResponse, summary="Export layers records as JSONL.")
async def export_layers(request: ExportRequest, codec: LayersCodecDep) -> PlainTextResponse:
    """Serialize posted layers records as newline-delimited JSON (JSONL)."""
    records = [
        NormalizedRecordDTO(
            local_id=record.local_id, nsid=record.nsid, value_json=record.value_json
        )
        for record in request.records
    ]
    lines = "\n".join(
        json.dumps(
            {"local_id": r.local_id, "nsid": r.nsid, "value_json": r.value_json}
        )
        for r in records
    )
    return PlainTextResponse(content=lines, media_type="application/x-ndjson")
