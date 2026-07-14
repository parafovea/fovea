"""A ``lairs`` codec that round-trips fovea model-service outputs.

:class:`FoveaCodec` binds the :class:`lairs.integrations.ports.Codec` port so a
downstream user can reach it through ``lairs.codec("fovea")`` once both packages
are installed (the codec is registered via the ``lairs.codecs`` entry point in
the model-service project metadata).

The codec's external format is a small JSON envelope ``{"kind": ..., "source":
...}`` where ``kind`` names one of the six fovea output shapes (transcription,
detection, tracking, summary, claims, ontology) and ``source`` is that shape's
DTO serialized by a generic, type-tagged dataclass encoder. :meth:`decode` runs
the source through the matching lens's :meth:`forward` and appends the resulting
lens complement as a private record under :data:`~src.infrastructure.adapters.\
outbound.layers._convert.COMPLEMENT_NSID` (a layers consumer ignores unknown
NSIDs). Because the complement rides along, :meth:`encode` can run the lens's
:meth:`backward` and reconstruct the exact source, so ``encode(decode(x)) == x``
holds losslessly for every envelope while a single canonical mapping — the lens —
drives both directions.
"""

from __future__ import annotations

import dataclasses
import json
from datetime import datetime
from typing import TYPE_CHECKING, Any, cast

from lairs.integrations.codecs import CorpusFragment, FragmentRecord

from src.application.dto.claims import (
    ClaimRelationshipDTO,
    ClaimsResultDTO,
    ExtractedClaimDTO,
)
from src.application.dto.detection import (
    BoundingBoxDTO,
    DetectionDTO,
    DetectObjectsResponseDTO,
    FrameDetectionsDTO,
)
from src.application.dto.ontology import OntologyTypeDTO
from src.application.dto.reasoning import ThinkingStep, ThinkingTrace
from src.application.dto.summarization import KeyFrameDTO, SummarizeResponseDTO
from src.application.dto.tracking import (
    TrackingFrameDTO,
    TrackingMaskDTO,
    TrackObjectsResponseDTO,
)
from src.application.ports.outbound.layers_codec import EmitContext
from src.application.ports.outbound.transcriber import (
    TranscriptionResultDTO,
    TranscriptSegmentDTO,
)
from src.infrastructure.adapters.outbound.layers._convert import COMPLEMENT_NSID
from src.infrastructure.adapters.outbound.layers.lenses import (
    CLAIMS_LAYERS,
    DETECTION_LAYERS,
    ONTOLOGY_LAYERS,
    SUMMARY_LAYERS,
    TRACKING_LAYERS,
    TRANSCRIPT_LAYERS,
)

if TYPE_CHECKING:
    from collections.abc import Iterable

    import didactic.api as dx

    from src.infrastructure.adapters.outbound.layers._convert import JsonValue

# Every lens shares the ``(CorpusFragment, JsonValue)`` view/complement pair and
# differs only in its forward source DTO. That source slot is invariant and the
# codec dispatches over it by string ``kind``, so it is erased to ``Any`` here;
# the two concrete slots stay typed.
type _KindLens = dx.Lens[Any, CorpusFragment, JsonValue]

# The fragment-local id under which the codec stashes the lens complement.
_COMPLEMENT_LOCAL_ID = "complement"

# The kind slugs the envelope discriminates on, one per fovea output shape.
_KIND_TRANSCRIPTION = "transcription"
_KIND_DETECTION = "detection"
_KIND_TRACKING = "tracking"
_KIND_SUMMARY = "summary"
_KIND_CLAIMS = "claims"
_KIND_ONTOLOGY = "ontology"

# Each non-ontology kind maps to the lens whose source is the named DTO. Ontology
# is handled apart because its lens source is a ``(types, ctx)`` pair, not a DTO.
_LENS_BY_KIND: dict[str, _KindLens] = {
    _KIND_TRANSCRIPTION: TRANSCRIPT_LAYERS,
    _KIND_DETECTION: DETECTION_LAYERS,
    _KIND_TRACKING: TRACKING_LAYERS,
    _KIND_SUMMARY: SUMMARY_LAYERS,
    _KIND_CLAIMS: CLAIMS_LAYERS,
}


# --- generic, type-tagged dataclass JSON codec ------------------------------
# The source DTOs are plain (frozen or mutable) dataclasses with no first-party
# JSON support, so the envelope serializes them by tagging each dataclass with
# its class name and reconstructing through a registry. This keeps the codec
# independent of every DTO's field list and round-trips exactly (dump then load
# is the identity), which is what makes ``dump(backward(forward(dto))) == source``
# — and therefore ``encode(decode(x)) == x`` — hold.

_TYPE_KEY = "__type__"
_DATETIME_TYPE = "datetime"

_DATACLASS_REGISTRY: dict[str, type] = {
    cls.__name__: cls
    for cls in (
        TranscriptionResultDTO,
        TranscriptSegmentDTO,
        DetectObjectsResponseDTO,
        FrameDetectionsDTO,
        DetectionDTO,
        BoundingBoxDTO,
        TrackObjectsResponseDTO,
        TrackingFrameDTO,
        TrackingMaskDTO,
        SummarizeResponseDTO,
        KeyFrameDTO,
        ClaimsResultDTO,
        ExtractedClaimDTO,
        ClaimRelationshipDTO,
        OntologyTypeDTO,
        ThinkingTrace,
        ThinkingStep,
        EmitContext,
    )
}


def _dump(obj: object) -> object:
    """Serialize a dataclass tree to a JSON-able, type-tagged structure."""
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        tagged: dict[str, object] = {_TYPE_KEY: type(obj).__name__}
        for f in dataclasses.fields(obj):
            tagged[f.name] = _dump(getattr(obj, f.name))
        return tagged
    if isinstance(obj, datetime):
        return {_TYPE_KEY: _DATETIME_TYPE, "value": obj.isoformat()}
    if isinstance(obj, (list, tuple)):
        return [_dump(item) for item in obj]
    if isinstance(obj, dict):
        return {key: _dump(value) for key, value in obj.items()}
    return obj


def _load(value: object) -> object:
    """Reconstruct a dataclass tree from :func:`_dump` output."""
    if isinstance(value, dict):
        tag = value.get(_TYPE_KEY)
        if tag == _DATETIME_TYPE:
            return datetime.fromisoformat(str(value["value"]))
        if isinstance(tag, str):
            cls = _DATACLASS_REGISTRY[tag]
            fields = {key: _load(item) for key, item in value.items() if key != _TYPE_KEY}
            return cls(**fields)
        return {key: _load(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_load(item) for item in value]
    return value


def _as_text(src: str | bytes) -> str:
    return src.decode("utf-8") if isinstance(src, bytes) else src


class FoveaCodec:
    """Bidirectional codec ``fovea output envelope <-> layers corpus fragment``."""

    name = "fovea"

    def decode(self, src: str | bytes, *, into: CorpusFragment | None = None) -> CorpusFragment:
        """Decode a fovea output envelope into a layers fragment.

        The envelope's ``source`` is reconstructed to a lens source, run through
        the matching lens's ``forward``, and the resulting view records are
        emitted alongside a private complement record carrying the ``kind`` and
        the lens complement, so :meth:`encode` can invert the projection exactly.
        """
        envelope = json.loads(_as_text(src))
        kind = str(envelope["kind"])
        lens_input = _lens_input(kind, _load(envelope["source"]))
        view, complement = _lens_for(kind).forward(lens_input)

        records: list[FragmentRecord] = list(into.records) if into is not None else []
        records.extend(view.records)
        records.append(
            FragmentRecord(
                local_id=_COMPLEMENT_LOCAL_ID,
                nsid=COMPLEMENT_NSID,
                value_json=json.dumps({"kind": kind, "complement": complement}),
            )
        )
        return CorpusFragment(records=tuple(records), source="fovea")

    def encode(self, records: Iterable[FragmentRecord]) -> str:
        """Encode layers fragment records back into a fovea output envelope."""
        record_list = list(records)
        kind = ""
        complement: JsonValue = None
        view_records: list[FragmentRecord] = []
        for record in record_list:
            if record.nsid == COMPLEMENT_NSID:
                meta = json.loads(record.value_json)
                kind = str(meta["kind"])
                complement = meta["complement"]
            else:
                view_records.append(record)

        view = CorpusFragment(records=tuple(view_records), source="fovea")
        lens_output = _lens_for(kind).backward(view, complement)
        return json.dumps({"kind": kind, "source": _dump(_lens_source(kind, lens_output))})


def _lens_for(kind: str) -> _KindLens:
    """Return the lens bound to ``kind`` (ontology shares the ontology lens)."""
    if kind == _KIND_ONTOLOGY:
        return ONTOLOGY_LAYERS
    return _LENS_BY_KIND[kind]


def _lens_input(kind: str, source: object) -> object:
    """Turn a loaded envelope source into the lens's forward input.

    Every kind but ontology feeds its DTO directly; ontology's lens takes a
    ``(types, ctx)`` pair, which the envelope carries as a small dict.
    """
    if kind == _KIND_ONTOLOGY:
        assert isinstance(source, dict)
        return tuple(source["types"]), source["ctx"]
    return source


def _lens_source(kind: str, lens_output: object) -> object:
    """Turn a lens's backward output into the dumpable envelope source."""
    if kind == _KIND_ONTOLOGY:
        types, ctx = cast("tuple[Iterable[object], object]", lens_output)
        return {"types": list(types), "ctx": ctx}
    return lens_output
