"""Round-trip law tests for the transcription result <-> layers fragment lens."""

from __future__ import annotations

import pytest

pytest.importorskip("lairs")
pytest.importorskip("panproto")

import didactic.api as dx
from hypothesis import strategies as st
from lairs.records import (
    annotation,
    expression,
    media,
    segmentation,
)

from src.application.ports.outbound.transcriber import (
    TranscriptionResultDTO,
    TranscriptSegmentDTO,
)
from src.infrastructure.adapters.outbound.layers.lenses.transcript import (
    TRANSCRIPT_LAYERS,
    TranscriptLayersLens,
)

from .conftest import make_ctx

LENS = TRANSCRIPT_LAYERS


def _diarized_dto() -> TranscriptionResultDTO:
    return TranscriptionResultDTO(
        text="Hello there. General Kenobi.",
        segments=[
            TranscriptSegmentDTO(
                start=0.0,
                end=1.25,
                text="Hello there.",
                confidence=0.9,
                speaker="A",
            ),
            TranscriptSegmentDTO(
                start=1.25,
                end=2.5,
                text="General Kenobi.",
                confidence=0.8,
                speaker="B",
            ),
            TranscriptSegmentDTO(
                start=2.5,
                end=3.0,
                text="Hello again.",
                confidence=0.7,
                speaker="A",
            ),
        ],
        language="en",
        speaker_count=2,
        processing_time=0.4321,
    )


def _plain_dto() -> TranscriptionResultDTO:
    return TranscriptionResultDTO(
        text="One two three.",
        segments=[
            TranscriptSegmentDTO(start=0.0, end=0.5, text="One", confidence=0.5),
            TranscriptSegmentDTO(start=0.5, end=1.0, text="two three.", confidence=0.6),
        ],
        language="en",
        speaker_count=None,
        processing_time=0.1,
    )


def _empty_dto() -> TranscriptionResultDTO:
    return TranscriptionResultDTO(text="")


def _records_by_id(view) -> dict[str, str]:
    return {record.local_id: record.value_json for record in view.records}


@pytest.mark.parametrize(
    "dto", [_diarized_dto(), _plain_dto(), _empty_dto()], ids=["diarized", "plain", "empty"]
)
def test_getput_roundtrip(dto: TranscriptionResultDTO) -> None:
    view, complement = LENS.forward(dto)
    assert LENS.backward(view, complement) == dto


@pytest.mark.parametrize(
    "dto", [_diarized_dto(), _plain_dto(), _empty_dto()], ids=["diarized", "plain", "empty"]
)
def test_putget_stability(dto: TranscriptionResultDTO) -> None:
    view, complement = LENS.forward(dto)
    view2, complement2 = LENS.forward(LENS.backward(view, complement))
    assert (view2, complement2) == (view, complement)


def test_view_records_validate_as_lairs_models() -> None:
    view, _ = LENS.forward(_diarized_dto())
    by_id = _records_by_id(view)
    expression.Expression.model_validate_json(by_id["expression"])
    segmentation.Segmentation.model_validate_json(by_id["segmentation"])
    annotation.AnnotationLayer.model_validate_json(by_id["speakers"])
    annotation.ClusterSet.model_validate_json(by_id["clusters"])
    media.Media.model_validate_json(by_id["media"])


def test_expression_and_media_shape() -> None:
    view, _ = LENS.forward(_diarized_dto())
    by_id = _records_by_id(view)
    expr = expression.Expression.model_validate_json(by_id["expression"])
    assert expr.kind == "transcript"
    assert expr.text == "Hello there. General Kenobi."
    audio = media.Media.model_validate_json(by_id["media"]).audio
    assert audio is not None
    assert audio.speakerCount == 2
    assert audio.transcriptRef is not None
    assert audio.segmentationRef is not None


def test_segment_temporal_spans_are_integer_ms() -> None:
    view, _ = LENS.forward(_diarized_dto())
    by_id = _records_by_id(view)
    seg = segmentation.Segmentation.model_validate_json(by_id["segmentation"])
    tokens = seg.tokenizations[0].tokens
    assert len(tokens) == 3
    span = tokens[0].temporalSpan
    assert span is not None
    assert (span.start, span.ending) == (0, 1250)
    for token in tokens:
        assert token.temporalSpan is not None
        assert isinstance(token.temporalSpan.start, int)
        assert isinstance(token.temporalSpan.ending, int)
        assert token.temporalSpan.start >= 0
        assert token.temporalSpan.ending >= 0


def test_speaker_annotations_confidence_in_range_and_clustered() -> None:
    view, _ = LENS.forward(_diarized_dto())
    by_id = _records_by_id(view)
    layer = annotation.AnnotationLayer.model_validate_json(by_id["speakers"])
    assert layer.kind == "tier"
    assert layer.subkind == "speaker"
    assert len(layer.annotations) == 3
    for ann in layer.annotations:
        assert ann.confidence is not None
        assert 0 <= ann.confidence <= 1000
        assert ann.anchor is not None
        assert ann.anchor.temporalSpan is not None
    assert layer.annotations[0].confidence == 900

    cluster_set = annotation.ClusterSet.model_validate_json(by_id["clusters"])
    assert cluster_set.kind == "clustering"
    labels = {cluster.canonicalLabel for cluster in cluster_set.clusters}
    assert labels == {"A", "B"}
    members_of_a = next(
        cluster for cluster in cluster_set.clusters if cluster.canonicalLabel == "A"
    ).members
    assert len(members_of_a) == 2


def test_plain_dto_omits_speaker_records() -> None:
    view, _ = LENS.forward(_plain_dto())
    by_id = _records_by_id(view)
    assert "speakers" not in by_id
    assert "clusters" not in by_id
    assert "expression" in by_id
    assert "segmentation" in by_id
    assert "media" in by_id


def test_lens_uses_supplied_context() -> None:
    ctx = make_ctx(video_id="clip-42", authority="pds")
    lens = TranscriptLayersLens(ctx)
    view, complement = lens.forward(_plain_dto())
    by_id = _records_by_id(view)
    expr = expression.Expression.model_validate_json(by_id["expression"])
    assert expr.id == "clip-42"
    audio = media.Media.model_validate_json(by_id["media"]).audio
    assert audio is not None
    assert audio.transcriptRef == "at://pds/pub.layers.expression.expression/clip-42"
    # The context never leaks into the complement, so the DTO round-trips.
    assert lens.backward(view, complement) == _plain_dto()


_segments = st.lists(
    st.builds(
        TranscriptSegmentDTO,
        start=st.floats(min_value=0.0, max_value=1000.0, allow_nan=False),
        end=st.floats(min_value=0.0, max_value=1000.0, allow_nan=False),
        text=st.text(max_size=32),
        confidence=st.floats(min_value=0.0, max_value=1.0, allow_nan=False),
        speaker=st.one_of(st.none(), st.sampled_from(["A", "B", "C"])),
    ),
    max_size=5,
)

_dtos = st.builds(
    TranscriptionResultDTO,
    text=st.text(max_size=64),
    segments=_segments,
    language=st.one_of(st.none(), st.sampled_from(["en", "fr", "de"])),
    speaker_count=st.one_of(st.none(), st.integers(min_value=0, max_value=8)),
    processing_time=st.floats(min_value=0.0, max_value=1000.0, allow_nan=False),
)


def test_lens_laws_hypothesis() -> None:
    dx.testing.check_lens_laws(LENS, _dtos, max_examples=100)
