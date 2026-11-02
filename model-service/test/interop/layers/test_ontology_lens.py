"""GetPut round-trip tests for the ontology layers lens.

The lens projects a list of fovea ontology suggestions (paired with an
:class:`EmitContext`) to canonical ``pub.layers.ontology`` records and back. The
description, examples, parent, and confidence live in the canonical records — no
verbatim type blob rides in the complement — the confidence is quantized once to
the integer ``0..1000`` scale, and the reasoning trace (model-inference
telemetry) is dropped rather than round-tripped. These tests assert the GetPut
law over quantized, trace-free suggestions, check the drop of the trace, and
property-test GetPut over a small hypothesis strategy.
"""

from __future__ import annotations

import pytest

pytest.importorskip("lairs")
pytest.importorskip("panproto")

import didactic.api as dx
from hypothesis import strategies as st
from lairs.records import ontology

from src.application.dto.ontology import OntologyTypeDTO
from src.application.dto.reasoning import ThinkingStep, ThinkingTrace
from src.infrastructure.adapters.outbound.layers._convert import (
    ONTOLOGY_NSID,
    TYPEDEF_NSID,
    read_feature_map,
)
from src.infrastructure.adapters.outbound.layers.lenses.ontology import (
    ONTOLOGY_LAYERS,
    OntologyLayersLens,
)
from test.interop.layers.conftest import make_ctx


def _fixture_types() -> tuple[OntologyTypeDTO, ...]:
    """A deterministic set of suggestions covering parents and examples.

    Confidences are exact multiples of 0.001 so they survive the integer scale,
    and no reasoning trace is attached (the lens drops telemetry).
    """
    return (
        OntologyTypeDTO(
            name="Animal",
            description="A living organism.",
            parent=None,
            confidence=0.912,
            examples=["dog", "cat", "sparrow"],
        ),
        OntologyTypeDTO(
            name="Dog",
            description="A domesticated canine.",
            parent="Animal",
            confidence=0.42,
            examples=["poodle", "beagle"],
        ),
    )


def test_get_put_roundtrip() -> None:
    """``backward(forward(a)) == a`` on the deterministic fixture."""
    source = _fixture_types()
    view, complement = ONTOLOGY_LAYERS.forward(source)
    assert complement is None
    assert ONTOLOGY_LAYERS.backward(view, complement) == source


def test_get_put_empty() -> None:
    """An empty suggestion set round-trips to an empty tuple."""
    source: tuple[OntologyTypeDTO, ...] = ()
    view, complement = ONTOLOGY_LAYERS.forward(source)
    assert ONTOLOGY_LAYERS.backward(view, complement) == source


def test_reasoning_trace_is_dropped() -> None:
    """A suggestion's reasoning trace is telemetry, so it does not round-trip."""
    with_trace = OntologyTypeDTO(
        name="Dog",
        description="A canine.",
        parent=None,
        confidence=0.5,
        examples=[],
        reasoning_trace=ThinkingTrace(
            steps=[ThinkingStep(content="It barks.", tokens_used=7)],
            total_tokens=7,
            model_id="reasoner-x",
        ),
    )
    view, complement = ONTOLOGY_LAYERS.forward((with_trace,))
    restored = ONTOLOGY_LAYERS.backward(view, complement)
    assert restored[0].reasoning_trace is None
    assert restored[0] == OntologyTypeDTO(
        name="Dog", description="A canine.", parent=None, confidence=0.5, examples=[]
    )


def test_complement_is_empty() -> None:
    """The lens returns no complement — the emit context is dropped, not sidecared."""
    view, complement = ONTOLOGY_LAYERS.forward(_fixture_types())
    assert complement is None


def test_lens_uses_supplied_context() -> None:
    """A bound EmitContext stamps the records' authority; it does not round-trip."""
    lens = OntologyLayersLens(make_ctx(authority="pds", persona_ref="at://pds/persona/p"))
    view, complement = lens.forward(_fixture_types())
    assert complement is None
    typedef = next(
        ontology.TypeDef.model_validate_json(r.value_json)
        for r in view.records
        if r.nsid == TYPEDEF_NSID
    )
    assert typedef.ontologyRef.startswith("at://pds/")
    assert lens.backward(view, complement) == _fixture_types()


def test_view_records_validate_and_confidence_scaled() -> None:
    """Emitted records validate as lairs models; confidence stays 0..1000."""
    source = _fixture_types()
    view, _complement = ONTOLOGY_LAYERS.forward(source)

    ontology_records = [r for r in view.records if r.nsid == ONTOLOGY_NSID]
    typedef_records = [r for r in view.records if r.nsid == TYPEDEF_NSID]
    assert len(ontology_records) == 1
    assert len(typedef_records) == 2

    parsed_ontology = ontology.Ontology.model_validate_json(ontology_records[0].value_json)
    assert parsed_ontology.name == "fovea"

    for record in typedef_records:
        typedef = ontology.TypeDef.model_validate_json(record.value_json)
        assert typedef.typeKind == "entity-type"
        assert typedef.ontologyRef.startswith("at://")
        features = read_feature_map(typedef.features)
        confidence = features["confidence"]
        assert isinstance(confidence, int)
        assert 0 <= confidence <= 1000


def test_description_lives_in_the_gloss() -> None:
    """A type's description is the authoritative ``TypeDef.gloss``, not a sidecar."""
    source = _fixture_types()
    view, _complement = ONTOLOGY_LAYERS.forward(source)
    animal = next(
        ontology.TypeDef.model_validate_json(r.value_json)
        for r in view.records
        if r.nsid == TYPEDEF_NSID
        and ontology.TypeDef.model_validate_json(r.value_json).name == "Animal"
    )
    assert animal.gloss == "A living organism."


def test_parent_resolves_to_typedef_uri() -> None:
    """A child's ``parentTypeRef`` resolves the parent name to a type AT-URI."""
    source = _fixture_types()
    view, _complement = ONTOLOGY_LAYERS.forward(source)
    dog = next(
        ontology.TypeDef.model_validate_json(r.value_json)
        for r in view.records
        if r.nsid == TYPEDEF_NSID
        and ontology.TypeDef.model_validate_json(r.value_json).name == "Dog"
    )
    assert dog.parentTypeRef is not None
    assert dog.parentTypeRef.endswith("/Animal")


def test_literal_null_description_survives_the_round_trip() -> None:
    """A type whose description is the literal string ``"null"`` round-trips.

    A ``TypeDef.gloss`` whose value is exactly ``"null"`` serializes to JSON null,
    so a null gloss uniquely denotes that description on the way back — every
    other string (``""`` included) survives as itself. The DTO description is a
    required str, so a genuine None never collides with the literal ``"null"``.
    """
    source = (
        OntologyTypeDTO(
            name="Thing",
            description="null",
            parent=None,
            confidence=0.5,
            examples=[],
        ),
    )
    view, complement = ONTOLOGY_LAYERS.forward(source)
    restored = ONTOLOGY_LAYERS.backward(view, complement)
    assert restored == source
    assert restored[0].description == "null"


# --- property-based GetPut ---------------------------------------------------

# Names and parents exclude '/' so a parent AT-URI resolves back unambiguously.
_name = st.text(
    alphabet=st.characters(min_codepoint=32, max_codepoint=126).filter(lambda c: c != "/"),
    max_size=24,
)
_text = st.text(alphabet=st.characters(min_codepoint=32, max_codepoint=126), max_size=24)

# Confidence is drawn from the quantized 0..1000 grid, so scaling is exact.
_confidence = st.integers(min_value=0, max_value=1000).map(lambda i: i / 1000.0)

_dtos = st.builds(
    OntologyTypeDTO,
    name=_name,
    description=_text,
    parent=st.one_of(st.none(), _name),
    confidence=_confidence,
    examples=st.lists(_text, max_size=4),
    reasoning_trace=st.none(),
)

_sources = st.lists(_dtos, max_size=4).map(tuple)


def test_lens_laws() -> None:
    """Property-test GetPut over a small strategy of suggestion sets."""
    dx.testing.check_lens_laws(ONTOLOGY_LAYERS, _sources, max_examples=50)
