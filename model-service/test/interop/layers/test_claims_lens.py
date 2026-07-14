"""Round-trip law tests for the claim result <-> layers fragment lens."""

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
                confidence=0.9123,
                sentence_index=0,
                char_start=0,
                char_end=16,
                claim_type="fact",
                subclaims=[
                    ExtractedClaimDTO(
                        text="sky is blue",
                        confidence=0.4242,
                        sentence_index=0,
                        char_start=4,
                        char_end=15,
                        claim_type=None,
                        reasoning_trace=ThinkingTrace(
                            steps=[ThinkingStep(content="color", tokens_used=3)],
                            total_tokens=3,
                            model_id="m-1",
                        ),
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
    # claim_type=None projects to the default "claim" label.
    assert sub.label == "claim"
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


_claim_leaf = st.builds(
    ExtractedClaimDTO,
    text=st.text(max_size=16),
    confidence=st.floats(min_value=0.0, max_value=1.0, allow_nan=False),
    sentence_index=st.one_of(st.none(), st.integers(min_value=0, max_value=10)),
    char_start=st.none(),
    char_end=st.none(),
    subclaims=st.just([]),
    claim_type=st.one_of(st.none(), st.sampled_from(["fact", "opinion"])),
)

_claim = st.recursive(
    _claim_leaf,
    lambda children: st.builds(
        ExtractedClaimDTO,
        text=st.text(max_size=16),
        confidence=st.floats(min_value=0.0, max_value=1.0, allow_nan=False),
        sentence_index=st.one_of(st.none(), st.integers(min_value=0, max_value=10)),
        char_start=st.none(),
        char_end=st.none(),
        subclaims=st.lists(children, max_size=2),
        claim_type=st.one_of(st.none(), st.sampled_from(["fact", "opinion"])),
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
    confidence=st.floats(min_value=0.0, max_value=1.0, allow_nan=False),
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
