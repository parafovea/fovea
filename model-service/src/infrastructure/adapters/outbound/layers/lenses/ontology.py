"""Lens between fovea ontology suggestions and canonical layers records.

An ontology-augmentation run produces a list of
:class:`~src.application.dto.ontology.OntologyTypeDTO` — suggested types, each
with a confidence, a set of examples, an optional parent name, and an optional
chain-of-thought :class:`~src.application.dto.reasoning.ThinkingTrace`. This
lens projects that list to a :class:`lairs.integrations.codecs.CorpusFragment`,
stamping it with the :class:`EmitContext` bound at construction (as the five
sibling lenses do — the context is not part of the source):

- one :class:`lairs.records.ontology.Ontology` named ``fovea`` whose ``createdAt``
  and ``personaRef`` carry the emit context's provenance,
- one :class:`lairs.records.ontology.TypeDef` per suggested type, whose ``gloss``
  is the description (the authoritative home for it), whose ``parentTypeRef``
  resolves the parent name to a local type AT-URI, and whose ``features`` carry
  the examples and the integer-scaled confidence.

The description, examples, parent, and confidence are read back from those
canonical records rather than a sidecar — there is no verbatim type blob and no
complement. Like the five sibling lenses, the emit context is bound at
construction (not carried in the source) and the complement is empty (``None``):
the reasoning trace is model-inference telemetry, so the lens drops it, and the
emit-context provenance with no native home on an ontology record (``video_id``,
``tool``, ``agent_id``) is likewise dropped rather than sidecared, so it does not
round-trip. Confidence is quantized once to the integer ``0..1000`` scale at
emission, so the GetPut law holds on the quantized suggestion (the layers
vocabulary is integer-by-design; the sub-0.001 remainder is noise).
"""

from __future__ import annotations

from datetime import UTC, datetime

import didactic.api as dx
from lairs.integrations.codecs import CorpusFragment, FragmentRecord
from lairs.records import ontology

from src.application.dto.ontology import OntologyTypeDTO
from src.application.ports.outbound.layers_codec import EmitContext
from src.infrastructure.adapters.outbound.layers._convert import (
    ONTOLOGY_NSID,
    TYPEDEF_NSID,
    JsonValue,
    _record,
    conf_from_int,
    conf_to_int,
    feature_map,
    j_float,
    j_list,
    j_str,
    local_uri,
    read_feature_map,
)

# The name every emitted fovea ontology carries, and the key under which its
# AT-URI is minted.
_ONTOLOGY_NAME = "fovea"
_ONTOLOGY_KEY = "fovea"

# The fovea DTO carries no event/situation signal, so every suggested type
# projects to an entity type; the mapping is total and round-trips trivially
# (``OntologyTypeDTO`` has no ``typeKind`` field to reconstruct).
_TYPE_KIND = "entity-type"

# The source of this lens: the suggested types in emission order. The emit
# context is bound at construction (like the sibling lenses), not carried in the
# source, so it never enters a complement.
type OntologySource = tuple[OntologyTypeDTO, ...]

# A fixed context so the singleton is deterministic; the codec constructs the
# lens with the real EmitContext per call. None of these fields round-trip.
_DEFAULT_CTX = EmitContext(
    video_id="",
    created_at=datetime(1970, 1, 1, tzinfo=UTC),
    tool="fovea",
)


def _authority_of(uri: str) -> str:
    """Recover the authority segment of an ``at://{authority}/...`` URI."""
    rest = uri.removeprefix("at://")
    return rest.split("/", 1)[0] if rest else "local"


def _parent_name(parent_ref: str, names: set[str], authority: str) -> str:
    """Recover a parent type name from a child's ``parentTypeRef`` AT-URI.

    Matches the URI against ``local_uri`` for each known type name so a name
    containing a slash still resolves; falls back to the final path segment for a
    parent that names no emitted type.
    """
    for name in names:
        if local_uri(authority, TYPEDEF_NSID, name) == parent_ref:
            return name
    return parent_ref.rsplit("/", 1)[-1]


class OntologyLayersLens(dx.Lens[OntologySource, CorpusFragment, JsonValue]):
    """Lens ``ontology suggestions <-> layers fragment`` with an empty complement."""

    def __init__(self, ctx: EmitContext | None = None) -> None:
        """Bind the provenance context stamped onto the emitted records."""
        self._ctx = ctx if ctx is not None else _DEFAULT_CTX

    def forward(self, source: OntologySource) -> tuple[CorpusFragment, JsonValue]:
        """Project ontology suggestions to a layers fragment (no complement)."""
        types = source
        ctx = self._ctx
        ontology_ref = local_uri(ctx.authority, ONTOLOGY_NSID, _ONTOLOGY_KEY)

        records: list[FragmentRecord] = [
            _record(
                ONTOLOGY_NSID,
                f"ontology:{_ONTOLOGY_KEY}",
                ontology.Ontology(
                    name=_ONTOLOGY_NAME,
                    createdAt=ctx.created_at,
                    personaRef=ctx.persona_ref,
                ),
            )
        ]

        for index, dto in enumerate(types):
            parent_ref = (
                local_uri(ctx.authority, TYPEDEF_NSID, dto.parent)
                if dto.parent is not None
                else None
            )
            records.append(
                _record(
                    TYPEDEF_NSID,
                    f"type:{index}",
                    ontology.TypeDef(
                        name=dto.name,
                        ontologyRef=ontology_ref,
                        typeKind=_TYPE_KIND,
                        gloss=dto.description,
                        parentTypeRef=parent_ref,
                        createdAt=ctx.created_at,
                        features=feature_map(
                            {
                                "examples": list(dto.examples),
                                "confidence": conf_to_int(dto.confidence),
                            }
                        ),
                    ),
                )
            )

        view = CorpusFragment(records=tuple(records), source="fovea")
        # The description/examples/parent/confidence all live in the canonical
        # records; the reasoning trace and the emit-context provenance with no
        # native ontology home are dropped, so the complement is empty.
        return view, None

    def backward(self, view: CorpusFragment, complement: JsonValue) -> OntologySource:
        """Reconstruct the ontology suggestions from the fragment alone."""
        del complement  # every field is recovered from the canonical records

        typedefs = [
            ontology.TypeDef.model_validate_json(record.value_json)
            for record in view.records
            if record.nsid == TYPEDEF_NSID
        ]

        authority = _authority_of(typedefs[0].ontologyRef) if typedefs else "local"
        names = {typedef.name for typedef in typedefs}

        dtos: list[OntologyTypeDTO] = []
        for typedef in typedefs:
            features = read_feature_map(typedef.features)
            parent = (
                _parent_name(typedef.parentTypeRef, names, authority)
                if typedef.parentTypeRef is not None
                else None
            )
            dtos.append(
                OntologyTypeDTO(
                    name=typedef.name,
                    # A ``TypeDef.gloss`` whose value is exactly "null" serializes
                    # to JSON null, so a null gloss read back uniquely denotes the
                    # literal "null" description (every other string, "" included,
                    # round-trips as itself); the DTO description is a required str,
                    # so a genuine None never reaches this path.
                    description="null" if typedef.gloss is None else typedef.gloss,
                    parent=parent,
                    confidence=conf_from_int(int(j_float(features["confidence"]))),
                    examples=[j_str(example) for example in j_list(features["examples"])],
                    reasoning_trace=None,
                )
            )

        return tuple(dtos)


ONTOLOGY_LAYERS = OntologyLayersLens()
