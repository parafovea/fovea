"""GetPut round-trip tests for the ontology layers lens.

The lens projects a list of fovea ontology suggestions (paired with an
:class:`EmitContext`) to canonical ``pub.layers.ontology`` records and back.
These tests assert the GetPut law by hand on a deterministic fixture, check that
the emitted records validate as ``lairs`` models with the confidence held to the
integer ``0..1000`` scale, and property-test GetPut over a small hypothesis
strategy.
"""

from __future__ import annotations

import pytest

pytest.importorskip("lairs")
pytest.importorskip("panproto")

import didactic.api as dx  # noqa: E402
from hypothesis import strategies as st  # noqa: E402
from lairs.records import ontology  # noqa: E402

from src.application.dto.ontology import OntologyTypeDTO  # noqa: E402
from src.application.dto.reasoning import ThinkingStep, ThinkingTrace  # noqa: E402
from src.infrastructure.adapters.outbound.layers._convert import (  # noqa: E402
    ONTOLOGY_NSID,
    TYPEDEF_NSID,
    read_feature_map,
)
from src.infrastructure.adapters.outbound.layers.lenses.ontology import (  # noqa: E402
    ONTOLOGY_LAYERS,
)

from test.interop.layers.conftest import make_ctx  # noqa: E402


def _fixture_types() -> tuple[OntologyTypeDTO, ...]:
    """A deterministic set of suggestions covering parents, examples, traces."""
    return (
        OntologyTypeDTO(
            name="Animal",
            description="A living organism.",
            parent=None,
            confidence=0.9125,
            examples=["dog", "cat", "sparrow"],
        ),
        OntologyTypeDTO(
            name="Dog",
            description="A domesticated canine.",
            parent="Animal",
            confidence=0.42,
            examples=["poodle", "beagle"],
            reasoning_trace=ThinkingTrace(
                steps=[
                    ThinkingStep(content="It has four legs.", tokens_used=7),
                    ThinkingStep(content="It barks.", tokens_used=None),
                ],
                total_tokens=13,
                model_id="reasoner-x",
            ),
        ),
    )


def test_get_put_roundtrip() -> None:
    """``backward(*forward(a)) == a`` on the deterministic fixture."""
    source = (_fixture_types(), make_ctx(persona_ref="at://local/persona/p"))
    view, complement = ONTOLOGY_LAYERS.forward(source)
    assert ONTOLOGY_LAYERS.backward(view, complement) == source


def test_get_put_empty() -> None:
    """An empty suggestion set round-trips to an empty tuple."""
    source: tuple[tuple[OntologyTypeDTO, ...], object] = ((), make_ctx())
    view, complement = ONTOLOGY_LAYERS.forward(source)
    assert ONTOLOGY_LAYERS.backward(view, complement) == source


def test_view_records_validate_and_confidence_scaled() -> None:
    """Emitted records validate as lairs models; confidence stays 0..1000."""
    source = (_fixture_types(), make_ctx())
    view, _complement = ONTOLOGY_LAYERS.forward(source)

    ontology_records = [r for r in view.records if r.nsid == ONTOLOGY_NSID]
    typedef_records = [r for r in view.records if r.nsid == TYPEDEF_NSID]
    assert len(ontology_records) == 1
    assert len(typedef_records) == 2

    parsed_ontology = ontology.Ontology.model_validate_json(
        ontology_records[0].value_json
    )
    assert parsed_ontology.name == "fovea"

    for record in typedef_records:
        typedef = ontology.TypeDef.model_validate_json(record.value_json)
        assert typedef.typeKind == "entity-type"
        assert typedef.ontologyRef.startswith("at://")
        features = read_feature_map(typedef.features)
        confidence = features["confidence"]
        assert isinstance(confidence, int)
        assert 0 <= confidence <= 1000


def test_parent_resolves_to_typedef_uri() -> None:
    """A child's ``parentTypeRef`` resolves the parent name to a type AT-URI."""
    source = (_fixture_types(), make_ctx())
    view, _complement = ONTOLOGY_LAYERS.forward(source)
    dog = next(
        ontology.TypeDef.model_validate_json(r.value_json)
        for r in view.records
        if r.nsid == TYPEDEF_NSID
        and ontology.TypeDef.model_validate_json(r.value_json).name == "Dog"
    )
    assert dog.parentTypeRef is not None
    assert dog.parentTypeRef.endswith("/Animal")


# --- property-based GetPut ---------------------------------------------------

_text = st.text(
    alphabet=st.characters(min_codepoint=32, max_codepoint=126), max_size=24
)

_traces = st.one_of(
    st.none(),
    st.builds(
        ThinkingTrace,
        steps=st.lists(
            st.builds(
                ThinkingStep,
                content=_text,
                tokens_used=st.one_of(st.none(), st.integers(0, 10_000)),
            ),
            max_size=3,
        ),
        total_tokens=st.one_of(st.none(), st.integers(0, 100_000)),
        model_id=_text,
    ),
)

_dtos = st.builds(
    OntologyTypeDTO,
    name=_text,
    description=_text,
    parent=st.one_of(st.none(), _text),
    confidence=st.floats(min_value=0.0, max_value=1.0),
    examples=st.lists(_text, max_size=4),
    reasoning_trace=_traces,
)

_sources = st.tuples(
    st.lists(_dtos, max_size=4).map(tuple),
    st.builds(
        make_ctx,
        video_id=_text,
        tool=_text,
        agent_id=st.one_of(st.none(), _text),
        persona_ref=st.one_of(st.none(), _text),
    ),
)


def test_lens_laws() -> None:
    """Property-test GetPut over a small strategy of suggestion sets."""
    dx.testing.check_lens_laws(ONTOLOGY_LAYERS, _sources, max_examples=50)
