"""Lens between a fovea claim tree and canonical layers annotation records.

A :class:`~src.application.dto.claims.ClaimsResultDTO` carries a recursive tree
of extracted claims over a document plus a set of typed, directed relationships
between claims. This lens projects that result to a
:class:`lairs.integrations.codecs.CorpusFragment` of canonical ``lairs`` records:

- one :class:`lairs.records.expression.Expression` (``kind="document"``) holding
  the source text,
- one tree :class:`lairs.records.annotation.AnnotationLayer`
  (``kind="tree"``, ``subkind="custom"``) that flattens the recursive claim tree
  into ``Annotation`` records linked by ``parentId`` / ``childIds``, each anchored
  by a UTF-8 byte :class:`lairs.records.defs.Span` when the claim carries
  character offsets, with the claim text on ``text``, the claim type on ``label``
  (absent for an untyped claim, distinguishing ``None`` from the literal
  ``"claim"``), the confidence on ``confidence`` (integer ``0..1000`` scale), and
  the sentence index in ``features``, and
- one :class:`lairs.records.graph.GraphEdgeSet` of ``GraphEdgeEntry`` edges, one
  per claim relationship, whose ``edgeType`` is the nearest layers slug and whose
  ``features`` carry the exact relation type, endpoint ids, and notes.

Every claim field is read back from those canonical records rather than a sidecar
— there is no verbatim claim tree in the complement. The reasoning trace is
model-inference telemetry, not annotation structure, so the lens drops it and
lifts only the emitting ``model_id`` to the layer's ``annotationMetadata.agent``.
Confidence is quantized once to the integer ``0..1000`` scale at emission, so the
GetPut law holds on the quantized, trace-free result (the layers vocabulary is
integer-by-design; the sub-0.001 remainder is noise). The complement is empty.
"""

from __future__ import annotations

from datetime import UTC, datetime

import didactic.api as dx
from lairs.author import builders
from lairs.integrations.codecs import CorpusFragment, FragmentRecord
from lairs.records import annotation, defs, expression, graph

from src.application.dto.claims import (
    ClaimRelationshipDTO,
    ClaimsResultDTO,
    ExtractedClaimDTO,
)
from src.infrastructure.adapters.outbound.layers._convert import (
    ANNOTATION_LAYER_NSID,
    EXPRESSION_NSID,
    GRAPH_EDGESET_NSID,
    JsonValue,
    conf_from_int,
    conf_to_int,
    feature_map,
    j_str,
    local_uri,
    object_ref,
    read_feature_map,
)

# The claim tree has no creation timestamp of its own; the view stamps a fixed
# epoch so the projection is deterministic. It is not a DTO field, so it plays no
# part in the round-trip.
_CREATED_AT = datetime(1970, 1, 1, tzinfo=UTC)

# The document expression's stable corpus id and minted local key.
_DOCUMENT_ID = "document"
_EXPRESSION_KEY = "document"

# The tool every emitted annotation layer attributes its work to.
_TOOL = "fovea"

# Annotation / edge feature keys carrying the fields with no dedicated column.
_FK_SENTENCE_INDEX = "sentence_index"
_FK_RELATION_TYPE = "fovea.relationType"
_FK_SOURCE_REF = "fovea.sourceRef"
_FK_TARGET_REF = "fovea.targetRef"
_FK_NOTES = "fovea.notes"

# fovea relationship type -> nearest layers graph edge slug (else "custom"). The
# exact relation type rides in the edge features, so the slug is lossy-but-native.
_EDGE_TYPE_BY_RELATION = {
    "supports": "supports",
    "contradicts": "contradicts",
    "refines": "specializes",
    "generalizes": "related-to",
    "duplicates": "same-as",
}


def _edge_type(relation_type: str) -> str:
    return _EDGE_TYPE_BY_RELATION.get(relation_type, "custom")


def _resolve_endpoint(raw_id: str, claim_uuids: list[str]) -> str:
    """Resolve a relationship endpoint to the minted claim uuid it references.

    A relationship names a claim by its position in the preorder claim list;
    ``claim_uuids[index]`` is that claim's minted ``claim-{index}`` uuid, so a
    resolved edge points at a real claim annotation. An endpoint that is not a
    valid positional index passes through unchanged. The original endpoint id
    rides in the edge features, so the resolution is native and reversible.
    """
    try:
        index = int(raw_id)
    except ValueError:
        return raw_id
    if 0 <= index < len(claim_uuids):
        return claim_uuids[index]
    return raw_id


def _byte_offset(text: str, char_index: int) -> int:
    """Return the UTF-8 byte offset of ``char_index`` into ``text``."""
    return len(text[:char_index].encode("utf-8"))


def _first_model_id(claims: list[ExtractedClaimDTO]) -> str | None:
    """Return the first non-empty reasoning-trace ``model_id`` in preorder, or None."""
    for claim in claims:
        trace = claim.reasoning_trace
        if trace is not None and trace.model_id:
            return trace.model_id
        found = _first_model_id(claim.subclaims)
        if found is not None:
            return found
    return None


class ClaimsLayersLens(dx.Lens[ClaimsResultDTO, CorpusFragment, JsonValue]):
    """Lens ``ClaimsResultDTO <-> layers fragment`` with an empty complement."""

    def forward(self, dto: ClaimsResultDTO) -> tuple[CorpusFragment, JsonValue]:
        """Project a claim result to a layers fragment (no fovea complement)."""
        expr_uri = local_uri("local", EXPRESSION_NSID, _EXPRESSION_KEY)

        records: list[FragmentRecord] = [
            _record(
                EXPRESSION_NSID,
                f"expression:{_EXPRESSION_KEY}",
                expression.Expression(
                    id=_DOCUMENT_ID,
                    kind="document",
                    createdAt=_CREATED_AT,
                    text=dto.text,
                ),
            )
        ]

        annotations, claim_uuids = _build_annotations(dto.text, dto.claims)
        model_id = _first_model_id(dto.claims)
        metadata = (
            defs.AnnotationMetadata(agent=defs.AgentRef(id=model_id), tool=_TOOL)
            if model_id is not None
            else None
        )
        records.append(
            _record(
                ANNOTATION_LAYER_NSID,
                "claims",
                annotation.AnnotationLayer(
                    annotations=tuple(annotations),
                    createdAt=_CREATED_AT,
                    expression=expr_uri,
                    kind="tree",
                    subkind="custom",
                    sourceMethod="automatic",
                    metadata=metadata,
                ),
            )
        )

        if dto.relationships:
            records.append(
                _record(
                    GRAPH_EDGESET_NSID,
                    "relationships",
                    graph.GraphEdgeSet(
                        createdAt=_CREATED_AT,
                        expression=expr_uri,
                        edges=tuple(
                            graph.GraphEdgeEntry(
                                uuid=defs.Uuid(value=f"edge-{index}"),
                                source=object_ref(
                                    _resolve_endpoint(rel.source_claim_id, claim_uuids)
                                ),
                                target=object_ref(
                                    _resolve_endpoint(rel.target_claim_id, claim_uuids)
                                ),
                                edgeType=_edge_type(rel.relation_type),
                                confidence=conf_to_int(rel.confidence),
                                features=_relation_features(rel),
                            )
                            for index, rel in enumerate(dto.relationships)
                        ),
                    ),
                )
            )

        view = CorpusFragment(records=tuple(records), source="fovea")
        return view, None

    def backward(self, view: CorpusFragment, complement: JsonValue) -> ClaimsResultDTO:
        """Reconstruct a claim result from its layers fragment alone."""
        del complement  # every field is recovered from the canonical records

        document = next(
            expression.Expression.model_validate_json(record.value_json)
            for record in view.records
            if record.nsid == EXPRESSION_NSID
        )
        layer = next(
            annotation.AnnotationLayer.model_validate_json(record.value_json)
            for record in view.records
            if record.nsid == ANNOTATION_LAYER_NSID
        )
        edge_sets = [
            graph.GraphEdgeSet.model_validate_json(record.value_json)
            for record in view.records
            if record.nsid == GRAPH_EDGESET_NSID
        ]

        claims = _annotations_to_claims(layer.annotations)
        relationships = [
            _edge_to_relationship(edge) for edge_set in edge_sets for edge in edge_set.edges
        ]
        return ClaimsResultDTO(
            text=_text_of(document.text),
            claims=claims,
            relationships=relationships,
        )


def _relation_features(rel: ClaimRelationshipDTO) -> defs.FeatureMap | None:
    """Build the feature map carrying a relationship's exact, non-native fields."""
    features: dict[str, JsonValue] = {
        _FK_RELATION_TYPE: rel.relation_type,
        _FK_SOURCE_REF: rel.source_claim_id,
        _FK_TARGET_REF: rel.target_claim_id,
    }
    if rel.notes is not None:
        features[_FK_NOTES] = rel.notes
    return feature_map(features)


def _build_annotations(
    text: str, claims: list[ExtractedClaimDTO]
) -> tuple[list[annotation.Annotation], list[str]]:
    """Flatten the claim tree into ``Annotation`` records in preorder.

    Returns the annotations (ordered by minted claim index) and the preorder
    list of minted claim UUIDs (the claim->uuid map).
    """
    ordered: list[tuple[int, annotation.Annotation]] = []
    uuids: list[str] = []

    def visit(claim: ExtractedClaimDTO, parent_uuid: str | None) -> str:
        index = len(uuids)
        my_uuid = f"claim-{index}"
        uuids.append(my_uuid)
        child_uuids = [visit(sub, my_uuid) for sub in claim.subclaims]
        ordered.append((index, _claim_annotation(text, claim, my_uuid, parent_uuid, child_uuids)))
        return my_uuid

    for claim in claims:
        visit(claim, None)

    ordered.sort(key=lambda item: item[0])
    return [anno for _index, anno in ordered], uuids


def _claim_annotation(
    text: str,
    claim: ExtractedClaimDTO,
    my_uuid: str,
    parent_uuid: str | None,
    child_uuids: list[str],
) -> annotation.Annotation:
    anchor = None
    if claim.char_start is not None and claim.char_end is not None:
        anchor = builders.span(
            _byte_offset(text, claim.char_start),
            _byte_offset(text, claim.char_end),
            char_start=claim.char_start,
            char_end=claim.char_end,
        )
    features: dict[str, JsonValue] = {}
    if claim.sentence_index is not None:
        features[_FK_SENTENCE_INDEX] = claim.sentence_index
    return annotation.Annotation(
        uuid=defs.Uuid(value=my_uuid),
        anchor=anchor,
        text=claim.text,
        # The claim type is the annotation label as-is: an untyped claim carries
        # no label, so None round-trips distinctly from the literal "claim".
        label=claim.claim_type,
        confidence=conf_to_int(claim.confidence),
        parentId=defs.Uuid(value=parent_uuid) if parent_uuid is not None else None,
        childIds=tuple(defs.Uuid(value=child) for child in child_uuids),
        features=feature_map(features),
    )


def _annotations_to_claims(
    annotations: tuple[annotation.Annotation, ...],
) -> list[ExtractedClaimDTO]:
    """Rebuild the claim tree from its flattened parent/child annotation links."""
    by_uuid = {ann.uuid.value: ann for ann in annotations}

    def build(ann: annotation.Annotation) -> ExtractedClaimDTO:
        char_start, char_end = _char_offsets(ann)
        features = read_feature_map(ann.features)
        sentence_index = features.get(_FK_SENTENCE_INDEX)
        return ExtractedClaimDTO(
            text=_text_of(ann.text),
            confidence=conf_from_int(ann.confidence or 0),
            sentence_index=None if sentence_index is None else int(_as_float(sentence_index)),
            char_start=char_start,
            char_end=char_end,
            subclaims=[build(by_uuid[child.value]) for child in (ann.childIds or ())],
            claim_type=ann.label,
            reasoning_trace=None,
        )

    return [build(ann) for ann in annotations if ann.parentId is None]


def _text_of(value: str | None) -> str:
    """Recover a text field the lens always sets.

    A ``str`` field whose value is exactly ``"null"`` serializes to JSON null, so
    a ``None`` read back uniquely denotes the literal ``"null"`` (the lens always
    supplies the field, so an absent value never otherwise occurs); every other
    string, ``""`` included, round-trips as itself.
    """
    return "null" if value is None else value


def _char_offsets(ann: annotation.Annotation) -> tuple[int | None, int | None]:
    """Read a claim annotation's character offsets from its text-span anchor."""
    anchor = ann.anchor
    if anchor is None or anchor.textSpan is None:
        return None, None
    return anchor.textSpan.charStart, anchor.textSpan.charEnd


def _edge_to_relationship(edge: graph.GraphEdgeEntry) -> ClaimRelationshipDTO:
    """Reconstruct a claim relationship from its graph edge and features."""
    features = read_feature_map(edge.features)
    notes = features.get(_FK_NOTES)
    return ClaimRelationshipDTO(
        source_claim_id=j_str(features[_FK_SOURCE_REF]),
        target_claim_id=j_str(features[_FK_TARGET_REF]),
        relation_type=j_str(features[_FK_RELATION_TYPE]),
        confidence=conf_from_int(edge.confidence or 0),
        notes=None if notes is None else j_str(notes),
    )


def _as_float(value: JsonValue) -> float:
    """Narrow a stored numeric feature to a float, raising otherwise."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"expected number, got {type(value).__name__}")
    return float(value)


def _record(nsid: str, local_id: str, model: dx.Model) -> FragmentRecord:
    return FragmentRecord(local_id=local_id, nsid=nsid, value_json=model.model_dump_json())


CLAIMS_LAYERS = ClaimsLayersLens()
