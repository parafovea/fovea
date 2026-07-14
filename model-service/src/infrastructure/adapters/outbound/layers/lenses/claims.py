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
  character offsets, and
- one :class:`lairs.records.graph.GraphEdgeSet` of ``GraphEdgeEntry`` edges, one
  per claim relationship.

The layers view puts only integers on the wire (confidence scales to ``0..1000``)
and cannot represent a claim's exact source confidence, its ``sentence_index``,
the ``None``-vs-``"claim"`` distinction in ``claim_type``, a relationship's notes,
or a claim's reasoning trace. The round-trip is therefore a ``dx.Lens``: the view
captures the faithful integer projection while the complement carries the fovea
remainder verbatim, so the GetPut law holds for every result.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import cast

import didactic.api as dx
from lairs.author import builders
from lairs.integrations.codecs import CorpusFragment, FragmentRecord
from lairs.records import annotation, defs, expression, graph

from src.application.dto.claims import (
    ClaimRelationshipDTO,
    ClaimsResultDTO,
    ExtractedClaimDTO,
)
from src.application.dto.reasoning import ThinkingStep, ThinkingTrace
from src.infrastructure.adapters.outbound.layers._convert import (
    ANNOTATION_LAYER_NSID,
    EXPRESSION_NSID,
    GRAPH_EDGESET_NSID,
    JsonValue,
    conf_to_int,
    j_float,
    j_list,
    j_obj,
    j_str,
    local_uri,
    object_ref,
)

# The claim tree has no creation timestamp of its own; the view stamps a fixed
# epoch so the projection is deterministic. It is not a DTO field, so it plays no
# part in the round-trip.
_CREATED_AT = datetime(1970, 1, 1, tzinfo=UTC)

# The document expression's stable corpus id and minted local key.
_DOCUMENT_ID = "document"
_EXPRESSION_KEY = "document"

# fovea relationship type -> nearest layers graph edge slug (else "custom").
_EDGE_TYPE_BY_RELATION = {
    "supports": "supports",
    "contradicts": "contradicts",
    "refines": "specializes",
    "generalizes": "related-to",
    "duplicates": "same-as",
}


def _edge_type(relation_type: str) -> str:
    return _EDGE_TYPE_BY_RELATION.get(relation_type, "custom")


def _byte_offset(text: str, char_index: int) -> int:
    """Return the UTF-8 byte offset of ``char_index`` into ``text``."""
    return len(text[:char_index].encode("utf-8"))


# --- reasoning-trace (de)serialization for the complement -------------------


def _dump_trace(trace: ThinkingTrace | None) -> JsonValue:
    if trace is None:
        return None
    return {
        "steps": [
            {"content": step.content, "tokens_used": step.tokens_used} for step in trace.steps
        ],
        "total_tokens": trace.total_tokens,
        "model_id": trace.model_id,
    }


def _opt_int(value: JsonValue) -> int | None:
    return None if value is None else int(j_float(value))


def _opt_str(value: JsonValue) -> str | None:
    return None if value is None else j_str(value)


def _load_trace(value: JsonValue) -> ThinkingTrace | None:
    if value is None:
        return None
    obj = j_obj(value)
    return ThinkingTrace(
        steps=[
            ThinkingStep(
                content=j_str(j_obj(step)["content"]),
                tokens_used=_opt_int(j_obj(step)["tokens_used"]),
            )
            for step in j_list(obj["steps"])
        ],
        total_tokens=_opt_int(obj["total_tokens"]),
        model_id=j_str(obj["model_id"]),
    )


# --- claim tree (de)serialization for the complement ------------------------


def _dump_claim(claim: ExtractedClaimDTO) -> JsonValue:
    return {
        "text": claim.text,
        "confidence": claim.confidence,
        "sentence_index": claim.sentence_index,
        "char_start": claim.char_start,
        "char_end": claim.char_end,
        "claim_type": claim.claim_type,
        "reasoning_trace": _dump_trace(claim.reasoning_trace),
        "subclaims": [_dump_claim(sub) for sub in claim.subclaims],
    }


def _load_claim(value: JsonValue) -> ExtractedClaimDTO:
    obj = j_obj(value)
    return ExtractedClaimDTO(
        text=j_str(obj["text"]),
        confidence=j_float(obj["confidence"]),
        sentence_index=_opt_int(obj["sentence_index"]),
        char_start=_opt_int(obj["char_start"]),
        char_end=_opt_int(obj["char_end"]),
        subclaims=[_load_claim(sub) for sub in j_list(obj["subclaims"])],
        claim_type=_opt_str(obj["claim_type"]),
        reasoning_trace=_load_trace(obj["reasoning_trace"]),
    )


class ClaimsLayersLens(dx.Lens[ClaimsResultDTO, CorpusFragment, JsonValue]):
    """Lossless lens ``ClaimsResultDTO <-> (layers fragment, fovea complement)``."""

    def forward(self, dto: ClaimsResultDTO) -> tuple[CorpusFragment, JsonValue]:
        """Project a claim result to a layers fragment and fovea complement."""
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
                                source=object_ref(rel.source_claim_id),
                                target=object_ref(rel.target_claim_id),
                                edgeType=_edge_type(rel.relation_type),
                                confidence=conf_to_int(rel.confidence),
                            )
                            for index, rel in enumerate(dto.relationships)
                        ),
                    ),
                )
            )

        view = CorpusFragment(records=tuple(records), source="fovea")
        # Widen the minted uuid strings to JsonValue across list invariance.
        uuid_values = cast("list[JsonValue]", claim_uuids)
        complement: JsonValue = {
            "claims": [_dump_claim(claim) for claim in dto.claims],
            "claim_uuids": uuid_values,
            "relationships": [
                {
                    "source_claim_id": rel.source_claim_id,
                    "target_claim_id": rel.target_claim_id,
                    "relation_type": rel.relation_type,
                    "confidence": rel.confidence,
                    "notes": rel.notes,
                }
                for rel in dto.relationships
            ],
        }
        return view, complement

    def backward(self, view: CorpusFragment, complement: JsonValue) -> ClaimsResultDTO:
        """Reconstruct a claim result from its layers fragment and complement."""
        comp = j_obj(complement)
        text = ""
        for record in view.records:
            if record.nsid == EXPRESSION_NSID:
                expr = expression.Expression.model_validate_json(record.value_json)
                text = expr.text if expr.text is not None else ""
                break

        claims = [_load_claim(claim) for claim in j_list(comp["claims"])]
        relationships = [_load_relationship(rel) for rel in j_list(comp["relationships"])]
        return ClaimsResultDTO(text=text, claims=claims, relationships=relationships)


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
    return annotation.Annotation(
        uuid=defs.Uuid(value=my_uuid),
        anchor=anchor,
        text=claim.text,
        label=claim.claim_type or "claim",
        confidence=conf_to_int(claim.confidence),
        parentId=defs.Uuid(value=parent_uuid) if parent_uuid is not None else None,
        childIds=tuple(defs.Uuid(value=child) for child in child_uuids),
    )


def _load_relationship(value: JsonValue) -> ClaimRelationshipDTO:
    obj = j_obj(value)
    return ClaimRelationshipDTO(
        source_claim_id=j_str(obj["source_claim_id"]),
        target_claim_id=j_str(obj["target_claim_id"]),
        relation_type=j_str(obj["relation_type"]),
        confidence=j_float(obj["confidence"]),
        notes=_opt_str(obj["notes"]),
    )


def _record(nsid: str, local_id: str, model: dx.Model) -> FragmentRecord:
    return FragmentRecord(local_id=local_id, nsid=nsid, value_json=model.model_dump_json())


CLAIMS_LAYERS = ClaimsLayersLens()
