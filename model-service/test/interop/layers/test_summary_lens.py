"""GetPut and view-shape tests for the summary layers lens.

The lens is records-authoritative with an empty complement: the summary rides on
an ``Expression.text``, the visual analysis on a child ``Expression``, the
keyframes on a document-tag layer, and the audio on a composed transcript
sub-fragment. Confidence is quantized to the integer 0..1000 grid and timestamps
to integer milliseconds (both canonical), and the reasoning trace and processing
times are dropped as telemetry, so ``backward(*forward(dto)) == dto`` holds for a
quantized, telemetry-free result. The fixtures and strategies draw confidence off
the 0..1000 grid, timestamps off the millisecond grid, pin the telemetry fields,
and keep the structured transcript in its canonical shape.
"""

from __future__ import annotations

import pytest

pytest.importorskip("lairs")
pytest.importorskip("panproto")

import didactic.api as dx
from hypothesis import strategies as st
from lairs.records import annotation, expression

from src.application.dto.summarization import (
    KeyFrameDTO,
    SummarizeResponseDTO,
)
from src.infrastructure.adapters.outbound.layers._convert import (
    ANNOTATION_LAYER_NSID,
    conf_to_int,
    sec_to_ms,
)
from src.infrastructure.adapters.outbound.layers.lenses.summary import (
    SUMMARY_LAYERS,
    SummaryLayersLens,
)


def _make_dto() -> SummarizeResponseDTO:
    """A fully-populated, deterministic summary DTO (no now()/random)."""
    return SummarizeResponseDTO(
        id="summary-7",
        video_id="video-42",
        persona_id="persona-3",
        summary="A person walks a dog through a park at dusk.",
        visual_analysis="Wide establishing shot, warm low-angle light.",
        audio_transcript="Come on, boy. Almost home.",
        key_frames=[
            KeyFrameDTO(
                frame_number=0,
                timestamp=0.0,
                description="Empty path.",
                confidence=0.91,
            ),
            KeyFrameDTO(
                frame_number=48,
                timestamp=1.602,
                description="Dog enters frame.",
                confidence=0.734,
            ),
        ],
        confidence=0.876,
        transcript_json={
            "segments": [
                {
                    "start": 0.0,
                    "end": 1.5,
                    "text": "Come on, boy.",
                    "speaker": "A",
                    "confidence": 0.9,
                },
                {
                    "start": 1.5,
                    "end": 2.5,
                    "text": "Almost home.",
                    "speaker": "A",
                    "confidence": 0.8,
                    "sentiment": "positive",
                },
            ]
        },
        audio_language="en",
        speaker_count=1,
        audio_model_used="whisper-large-v3",
        visual_model_used="qwen2-vl",
        fusion_strategy="sequential",
        processing_time_audio=None,
        processing_time_visual=None,
        processing_time_fusion=None,
        reasoning_trace=None,
    )


def test_getput_roundtrip() -> None:
    """backward(*forward(dto)) reconstructs the DTO exactly."""
    dto = _make_dto()
    view, comp = SUMMARY_LAYERS.forward(dto)
    assert comp is None
    assert SUMMARY_LAYERS.backward(view, comp) == dto


def test_getput_minimal_dto() -> None:
    """A near-empty DTO (no keyframes, no audio, no optionals) round-trips."""
    dto = SummarizeResponseDTO(
        id="s0",
        video_id="v0",
        persona_id="p0",
        summary="Short.",
    )
    view, comp = SUMMARY_LAYERS.forward(dto)
    assert SUMMARY_LAYERS.backward(view, comp) == dto


def test_view_validates_as_lairs_models() -> None:
    """The emitted records validate as their canonical lairs models."""
    dto = _make_dto()
    view, _comp = SUMMARY_LAYERS.forward(dto)
    by_id = {record.local_id: record for record in view.records}

    summary_expr = expression.Expression.model_validate_json(by_id["summary:expression"].value_json)
    assert summary_expr.id == dto.id
    assert summary_expr.kind == "multimodal"
    assert summary_expr.text == dto.summary

    visual_expr = expression.Expression.model_validate_json(by_id["summary:visual"].value_json)
    assert visual_expr.kind == "section"
    assert visual_expr.text == dto.visual_analysis
    assert visual_expr.parentRef is not None

    layer = annotation.AnnotationLayer.model_validate_json(by_id["summary:layer"].value_json)
    assert layer.kind == "document-tag"
    # The composed transcript sub-fragment carries its own transcript expression.
    transcript_expr = expression.Expression.model_validate_json(
        by_id["transcript:expression"].value_json
    )
    assert transcript_expr.kind == "transcript"
    assert transcript_expr.text == dto.audio_transcript


def test_no_redundant_summary_annotation() -> None:
    """The summary text lives only on the expression, not on a doc-tag annotation."""
    dto = _make_dto()
    view, _comp = SUMMARY_LAYERS.forward(dto)
    layer_record = next(r for r in view.records if r.local_id == "summary:layer")
    layer = annotation.AnnotationLayer.model_validate_json(layer_record.value_json)
    # Only keyframe annotations remain; none carries the whole summary as text/value.
    assert len(layer.annotations) == len(dto.key_frames)
    assert all(ann.value is None for ann in layer.annotations)


def test_scale_rules_hold() -> None:
    """Confidence scales to 0..1000 ints and timestamps to millisecond ints."""
    dto = _make_dto()
    view, _comp = SUMMARY_LAYERS.forward(dto)
    layer_record = next(r for r in view.records if r.nsid == ANNOTATION_LAYER_NSID)
    layer = annotation.AnnotationLayer.model_validate_json(layer_record.value_json)

    assert layer.metadata is not None
    assert layer.metadata.confidence == conf_to_int(dto.confidence)
    assert 0 <= layer.metadata.confidence <= 1000

    keyframe_anns = [ann for ann in layer.annotations if ann.anchor is not None]
    assert len(keyframe_anns) == len(dto.key_frames)
    for ann, kf in zip(keyframe_anns, dto.key_frames, strict=True):
        assert ann.confidence is not None
        assert 0 <= ann.confidence <= 1000
        assert ann.confidence == conf_to_int(kf.confidence)
        assert ann.anchor is not None
        span = ann.anchor.temporalSpan
        assert span is not None
        expected_ms = sec_to_ms(kf.timestamp)
        assert span.start == expected_ms
        assert span.ending == expected_ms
        assert isinstance(span.start, int)


def test_literal_null_free_text_survives_the_round_trip() -> None:
    """A summary/visual-analysis of the literal string ``"null"`` round-trips.

    Both fields flow through a text column whose literal ``"null"`` serializes to
    JSON null; the required summary is recovered via its always-set text guard and
    the optional visual analysis via the presence of its child expression record.
    """
    dto = SummarizeResponseDTO(
        id="s-null",
        video_id="v-null",
        persona_id="p-null",
        summary="null",
        visual_analysis="null",
    )
    view, comp = SUMMARY_LAYERS.forward(dto)
    restored = SUMMARY_LAYERS.backward(view, comp)
    assert restored == dto
    assert restored.summary == "null"
    assert restored.visual_analysis == "null"


_SMALL_TEXT = st.text(max_size=40)
_SMALL_ID = st.text(min_size=1, max_size=20)
# Optional provenance scalars ride nullable native columns whose literal "null"
# collides with SQL NULL; excluding it keeps them free of the degenerate case.
_OPT_MODEL = st.none() | _SMALL_TEXT.filter(lambda s: s != "null")
# The video id is recovered from an AT-URI's last path segment, so it must not
# embed the separator.
_ID_TEXT = st.text(st.characters(blacklist_characters="/"), max_size=20)
_conf = st.integers(min_value=0, max_value=1000).map(lambda i: i / 1000.0)
_secs = st.integers(min_value=0, max_value=1_000_000).map(lambda ms: ms / 1000.0)


def _keyframe_strategy() -> st.SearchStrategy[KeyFrameDTO]:
    return st.builds(
        KeyFrameDTO,
        frame_number=st.integers(min_value=0, max_value=100_000),
        timestamp=_secs,
        description=_SMALL_TEXT,
        confidence=_conf,
    )


@st.composite
def _segment_dict(draw: st.DrawFn) -> dict[str, object]:
    entry: dict[str, object] = {
        "start": draw(_secs),
        "end": draw(_secs),
        "text": draw(_SMALL_TEXT),
        "speaker": draw(st.none() | st.sampled_from(["A", "B", "C"])),
        "confidence": draw(_conf),
    }
    sentiment = draw(st.none() | st.sampled_from(["positive", "neutral", "negative"]))
    if sentiment is not None:
        entry["sentiment"] = sentiment
    return entry


@st.composite
def _dto_strategy(draw: st.DrawFn) -> SummarizeResponseDTO:
    if draw(st.booleans()):
        has_json = draw(st.booleans())
        transcript_json: dict[str, object] | None = (
            {"segments": draw(st.lists(_segment_dict(), max_size=4))} if has_json else None
        )
        audio_transcript = draw(_OPT_MODEL)
        audio_language = draw(st.none() | st.sampled_from(["en", "fr", "de"]))
        speaker_count = draw(st.none() | st.integers(min_value=0, max_value=8))
        audio_model_used = draw(_OPT_MODEL)
    else:
        transcript_json = None
        audio_transcript = None
        audio_language = None
        speaker_count = None
        audio_model_used = None

    return SummarizeResponseDTO(
        id=draw(_SMALL_ID),
        video_id=draw(_ID_TEXT),
        persona_id=draw(_SMALL_TEXT),
        summary=draw(_SMALL_TEXT),
        visual_analysis=draw(st.none() | _SMALL_TEXT),
        audio_transcript=audio_transcript,
        key_frames=draw(st.lists(_keyframe_strategy(), max_size=4)),
        confidence=draw(_conf),
        transcript_json=transcript_json,
        audio_language=audio_language,
        speaker_count=speaker_count,
        audio_model_used=audio_model_used,
        visual_model_used=draw(_OPT_MODEL),
        fusion_strategy=draw(st.none() | _SMALL_TEXT),
        processing_time_audio=None,
        processing_time_visual=None,
        processing_time_fusion=None,
        reasoning_trace=None,
    )


def test_lens_laws() -> None:
    """The GetPut law holds across a small generated sample of DTOs."""
    dx.testing.check_lens_laws(SummaryLayersLens(), _dto_strategy(), max_examples=100)
