"""Round-trip law tests for the claim result <-> layers fragment lens.

The lens makes the canonical layers records authoritative — text, confidence,
claim type, sentence index, character offsets, and the relationship fields are
read back from the records, not a verbatim complement (the complement is empty).
Confidence is quantized once to the integer ``0..1000`` scale, and the reasoning
trace (model-inference telemetry) is dropped, with only the emitting ``model_id``
lifted to the layer's ``annotationMetadata.agent``. The laws therefore hold over
quantized, trace-free results.
"""

from __future__ import annotations

import pytest

pytest.importorskip("lairs")
pytest.importorskip("panproto")

import didactic.api as dx
from hypothesis import strategies as st
from lairs.records import annotation, expression, graph

from src.application.dto.claims import (
    ClaimRelationshipDTO,
    ClaimsResultDTO,
    ExtractedClaimDTO,
)
from src.application.dto.reasoning import ThinkingStep, ThinkingTrace
from src.infrastructure.adapters.outbound.layers.lenses.claims import (
    CLAIMS_LAYERS,
    ClaimsLayersLens,
)

LENS = CLAIMS_LAYERS

# ASCII text so character offsets equal UTF-8 byte offsets.
_TEXT = "The sky is blue. Grass is green."


def _nested_dto() -> ClaimsResultDTO:
    return ClaimsResultDTO(
        text=_TEXT,
        claims=[
            ExtractedClaimDTO(
                text="The sky is blue.",
                confidence=0.912,
                sentence_index=0,
                char_start=0,
                char_end=16,
                claim_type="fact",
                subclaims=[
                    ExtractedClaimDTO(
                        text="sky is blue",
                        confidence=0.424,
                        sentence_index=0,
                        char_start=4,
                        char_end=15,
                        claim_type=None,
                    )
                ],
            ),
            ExtractedClaimDTO(
                text="Grass is green.",
                confidence=0.75,
                sentence_index=1,
                char_start=17,
                char_end=32,
                claim_type="opinion",
            ),
        ],
        relationships=[
            ClaimRelationshipDTO(
                source_claim_id="c-0",
                target_claim_id="c-1",
                relation_type="supports",
                confidence=0.8,
                notes="both color claims",
            ),
            ClaimRelationshipDTO(
                source_claim_id="c-1",
                target_claim_id="c-0",
                relation_type="refines",
                confidence=0.33,
            ),
        ],
    )


def _flat_dto() -> ClaimsResultDTO:
    return ClaimsResultDTO(
        text="A lone claim.",
        claims=[ExtractedClaimDTO(text="A lone claim.", confidence=0.5)],
    )


def _empty_dto() -> ClaimsResultDTO:
    return ClaimsResultDTO(text="")


def _records_by_id(view) -> dict[str, str]:
    return {record.local_id: record.value_json for record in view.records}


_ALL = [_nested_dto(), _flat_dto(), _empty_dto()]
_IDS = ["nested", "flat", "empty"]


@pytest.mark.parametrize("dto", _ALL, ids=_IDS)
def test_getput_roundtrip(dto: ClaimsResultDTO) -> None:
    view, complement = LENS.forward(dto)
    assert LENS.backward(view, complement) == dto


@pytest.mark.parametrize("dto", _ALL, ids=_IDS)
def test_putget_stability(dto: ClaimsResultDTO) -> None:
    view, complement = LENS.forward(dto)
    view2, complement2 = LENS.forward(LENS.backward(view, complement))
    assert (view2, complement2) == (view, complement)


def test_complement_is_empty() -> None:
    _, complement = LENS.forward(_nested_dto())
    assert complement is None


def test_view_records_validate_as_lairs_models() -> None:
    view, _ = LENS.forward(_nested_dto())
    by_id = _records_by_id(view)
    expr = expression.Expression.model_validate_json(by_id["expression:document"])
    assert expr.kind == "document"
    assert expr.text == _TEXT
    annotation.AnnotationLayer.model_validate_json(by_id["claims"])
    graph.GraphEdgeSet.model_validate_json(by_id["relationships"])


def test_annotation_tree_shape_and_scale() -> None:
    view, _ = LENS.forward(_nested_dto())
    layer = annotation.AnnotationLayer.model_validate_json(_records_by_id(view)["claims"])
    assert layer.kind == "tree"
    assert layer.subkind == "custom"
    # Three claims flattened: root, its subclaim, and the second root.
    assert len(layer.annotations) == 3
    by_uuid = {ann.uuid.value: ann for ann in layer.annotations}

    root = by_uuid["claim-0"]
    assert root.label == "fact"
    assert root.text == "The sky is blue."
    assert root.parentId is None
    assert tuple(child.value for child in root.childIds) == ("claim-1",)
    assert root.anchor is not None
    assert root.anchor.textSpan is not None
    assert (root.anchor.textSpan.byteStart, root.anchor.textSpan.byteEnd) == (0, 16)

    sub = by_uuid["claim-1"]
    # claim_type=None carries NO label, so it round-trips distinctly from "claim".
    assert sub.label is None
    assert sub.parentId is not None
    assert sub.parentId.value == "claim-0"
    assert sub.childIds == ()

    for ann in layer.annotations:
        assert ann.confidence is not None
        assert 0 <= ann.confidence <= 1000
    assert root.confidence == 912


def test_relationship_edge_set_shape_and_scale() -> None:
    view, _ = LENS.forward(_nested_dto())
    edge_set = graph.GraphEdgeSet.model_validate_json(_records_by_id(view)["relationships"])
    assert len(edge_set.edges) == 2
    supports, refines = edge_set.edges
    assert supports.edgeType == "supports"
    assert supports.source.localId is not None
    assert supports.source.localId.value == "c-0"
    assert supports.target.localId.value == "c-1"
    # "refines" has no exact known slug; it maps to "specializes".
    assert refines.edgeType == "specializes"
    for edge in edge_set.edges:
        assert edge.confidence is not None
        assert 0 <= edge.confidence <= 1000
    assert supports.confidence == 800


def test_reasoning_trace_is_dropped_and_model_id_lifted() -> None:
    """A claim's reasoning trace drops; its model_id rides on the layer metadata.

    The trace is model-inference telemetry, not annotation structure, so the lens
    drops it (a round-tripped claim carries ``reasoning_trace=None``) while the
    emitting model id survives natively on the layer's ``annotationMetadata.agent``.
    """
    dto = ClaimsResultDTO(
        text="A claim.",
        claims=[
            ExtractedClaimDTO(
                text="A claim.",
                confidence=0.5,
                reasoning_trace=ThinkingTrace(
                    steps=[ThinkingStep(content="chain of thought", tokens_used=7)],
                    total_tokens=7,
                    model_id="reasoner-1",
                ),
            )
        ],
    )
    view, complement = LENS.forward(dto)

    layer = annotation.AnnotationLayer.model_validate_json(_records_by_id(view)["claims"])
    assert layer.metadata is not None
    assert layer.metadata.agent is not None
    assert layer.metadata.agent.id == "reasoner-1"

    restored = LENS.backward(view, complement)
    assert restored.claims[0].reasoning_trace is None


def _index_endpoint_dto() -> ClaimsResultDTO:
    """Two flat claims joined by a relationship that names them by position."""
    return ClaimsResultDTO(
        text=_TEXT,
        claims=[
            ExtractedClaimDTO(text="The sky is blue.", confidence=0.9),
            ExtractedClaimDTO(text="Grass is green.", confidence=0.8),
        ],
        relationships=[
            ClaimRelationshipDTO(
                source_claim_id="0",
                target_claim_id="1",
                relation_type="supports",
                confidence=0.7,
            )
        ],
    )


def test_positional_endpoint_ids_resolve_to_claim_annotation_uuids() -> None:
    """A relationship that names claims by preorder index resolves to real uuids.

    An endpoint id that is a decimal index into the preorder claim list is
    rewritten to that claim's minted ``claim-{index}`` uuid on the edge, so the
    edge points at an annotation the layer actually contains rather than a
    dangling id; the original index rides in the edge features and is recovered
    on the round trip.
    """
    dto = _index_endpoint_dto()
    view, complement = LENS.forward(dto)
    by_id = _records_by_id(view)

    layer = annotation.AnnotationLayer.model_validate_json(by_id["claims"])
    claim_uuids = {ann.uuid.value for ann in layer.annotations}
    assert claim_uuids == {"claim-0", "claim-1"}

    edge_set = graph.GraphEdgeSet.model_validate_json(by_id["relationships"])
    (edge,) = edge_set.edges
    assert edge.source.localId is not None
    assert edge.target.localId is not None
    assert edge.source.localId.value == "claim-0"
    assert edge.target.localId.value == "claim-1"
    # Both resolved endpoints name annotations the claims layer contains.
    assert edge.source.localId.value in claim_uuids
    assert edge.target.localId.value in claim_uuids
    # The original positional ids round-trip through the edge features.
    assert LENS.backward(view, complement) == dto


def test_literal_null_text_survives_the_round_trip() -> None:
    """A document/claim whose text is the literal string ``"null"`` round-trips."""
    dto = ClaimsResultDTO(
        text="null",
        claims=[ExtractedClaimDTO(text="null", confidence=0.5)],
    )
    view, complement = LENS.forward(dto)
    restored = LENS.backward(view, complement)
    assert restored == dto
    assert restored.text == "null"
    assert restored.claims[0].text == "null"


def test_flat_dto_omits_relationship_record() -> None:
    view, _ = LENS.forward(_flat_dto())
    by_id = _records_by_id(view)
    assert "relationships" not in by_id
    assert "expression:document" in by_id
    assert "claims" in by_id


def test_empty_dto_has_no_annotations() -> None:
    view, _ = LENS.forward(_empty_dto())
    layer = annotation.AnnotationLayer.model_validate_json(_records_by_id(view)["claims"])
    assert layer.annotations == ()


# Confidence is drawn from the quantized 0..1000 grid, so scaling is exact.
_confidence = st.integers(min_value=0, max_value=1000).map(lambda i: i / 1000.0)

_claim_leaf = st.builds(
    ExtractedClaimDTO,
    text=st.text(max_size=16),
    confidence=_confidence,
    sentence_index=st.one_of(st.none(), st.integers(min_value=0, max_value=10)),
    char_start=st.none(),
    char_end=st.none(),
    subclaims=st.just([]),
    claim_type=st.one_of(st.none(), st.sampled_from(["fact", "opinion"])),
    reasoning_trace=st.none(),
)

_claim = st.recursive(
    _claim_leaf,
    lambda children: st.builds(
        ExtractedClaimDTO,
        text=st.text(max_size=16),
        confidence=_confidence,
        sentence_index=st.one_of(st.none(), st.integers(min_value=0, max_value=10)),
        char_start=st.none(),
        char_end=st.none(),
        subclaims=st.lists(children, max_size=2),
        claim_type=st.one_of(st.none(), st.sampled_from(["fact", "opinion"])),
        reasoning_trace=st.none(),
    ),
    max_leaves=4,
)

_relationship = st.builds(
    ClaimRelationshipDTO,
    source_claim_id=st.text(min_size=1, max_size=8),
    target_claim_id=st.text(min_size=1, max_size=8),
    relation_type=st.sampled_from(
        ["supports", "contradicts", "refines", "generalizes", "duplicates", "other"]
    ),
    confidence=_confidence,
    notes=st.one_of(st.none(), st.text(max_size=16)),
)

_results = st.builds(
    ClaimsResultDTO,
    text=st.text(max_size=64),
    claims=st.lists(_claim, max_size=3),
    relationships=st.lists(_relationship, max_size=3),
)


def test_lens_laws_hypothesis() -> None:
    dx.testing.check_lens_laws(LENS, _results, max_examples=100)


def test_singleton_is_lens_instance() -> None:
    assert isinstance(CLAIMS_LAYERS, ClaimsLayersLens)
