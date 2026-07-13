"""GetPut and view-shape tests for the summary layers lens.

The lens projects a :class:`SummarizeResponseDTO` to a layers fragment plus a
fovea complement; the complement carries every lossy or dropped field, so
``backward(*forward(dto)) == dto`` holds. These tests pin that round-trip with a
hand-built deterministic fixture, exercise it under a small hypothesis strategy,
and assert the emitted view validates as ``lairs`` models with the integer scale
rules (millisecond temporal spans, ``0..1000`` confidence) satisfied.
"""

from __future__ import annotations

import pytest

pytest.importorskip("lairs")
pytest.importorskip("panproto")

import didactic.api as dx
from hypothesis import strategies as st
from lairs.records import annotation, expression

from src.application.dto.reasoning import ThinkingStep, ThinkingTrace
from src.application.dto.summarization import (
    KeyFrameDTO,
    SummarizeResponseDTO,
)
from src.infrastructure.adapters.outbound.layers._convert import (
    ANNOTATION_LAYER_NSID,
    EXPRESSION_NSID,
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
        transcript_json={"segments": [{"start": 0.0, "text": "Come on, boy."}]},
        audio_language="en",
        speaker_count=1,
        audio_model_used="whisper-large-v3",
        visual_model_used="qwen2-vl",
        fusion_strategy="sequential",
        processing_time_audio=3.21,
        processing_time_visual=8.04,
        processing_time_fusion=0.15,
        reasoning_trace=ThinkingTrace(
            steps=[
                ThinkingStep(content="Scene is outdoors.", tokens_used=12),
                ThinkingStep(content="A dog appears.", tokens_used=None),
            ],
            total_tokens=24,
            model_id="qwen2-vl",
        ),
    )


def test_getput_roundtrip() -> None:
    """backward(*forward(dto)) reconstructs the DTO exactly."""
    dto = _make_dto()
    view, comp = SUMMARY_LAYERS.forward(dto)
    assert SUMMARY_LAYERS.backward(view, comp) == dto


def test_getput_minimal_dto() -> None:
    """A near-empty DTO (no keyframes, no trace, no optionals) round-trips."""
    dto = SummarizeResponseDTO(
        id="s0",
        video_id="v0",
        persona_id="p0",
        summary="Short.",
    )
    view, comp = SUMMARY_LAYERS.forward(dto)
    assert SUMMARY_LAYERS.backward(view, comp) == dto


def test_view_validates_as_lairs_models() -> None:
    """Both emitted records validate as their canonical lairs models."""
    dto = _make_dto()
    view, _comp = SUMMARY_LAYERS.forward(dto)
    nsids = {record.nsid for record in view.records}
    assert nsids == {EXPRESSION_NSID, ANNOTATION_LAYER_NSID}

    for record in view.records:
        if record.nsid == EXPRESSION_NSID:
            expr = expression.Expression.model_validate_json(record.value_json)
            assert expr.id == dto.video_id
            assert expr.kind == "multimodal"
            assert expr.text == dto.summary
        else:
            layer = annotation.AnnotationLayer.model_validate_json(record.value_json)
            assert layer.kind == "document-tag"


def test_scale_rules_hold() -> None:
    """Confidence scales to 0..1000 ints and timestamps to millisecond ints."""
    dto = _make_dto()
    view, _comp = SUMMARY_LAYERS.forward(dto)
    (layer_record,) = [r for r in view.records if r.nsid == ANNOTATION_LAYER_NSID]
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


_SMALL_TEXT = st.text(max_size=40)
_SMALL_ID = st.text(min_size=1, max_size=20)


def _keyframe_strategy() -> st.SearchStrategy[KeyFrameDTO]:
    return st.builds(
        KeyFrameDTO,
        frame_number=st.integers(min_value=0, max_value=100_000),
        timestamp=st.floats(min_value=0.0, max_value=100_000.0, allow_nan=False),
        description=_SMALL_TEXT,
        confidence=st.floats(min_value=0.0, max_value=1.0, allow_nan=False),
    )


def _trace_strategy() -> st.SearchStrategy[ThinkingTrace | None]:
    step = st.builds(
        ThinkingStep,
        content=_SMALL_TEXT,
        tokens_used=st.none() | st.integers(min_value=0, max_value=10_000),
    )
    trace = st.builds(
        ThinkingTrace,
        steps=st.lists(step, max_size=3),
        total_tokens=st.none() | st.integers(min_value=0, max_value=100_000),
        model_id=_SMALL_TEXT,
    )
    return st.none() | trace


_OPT_FLOAT = st.none() | st.floats(min_value=0.0, max_value=1e6, allow_nan=False)
_OPT_STR = st.none() | _SMALL_TEXT


def _dto_strategy() -> st.SearchStrategy[SummarizeResponseDTO]:
    return st.builds(
        SummarizeResponseDTO,
        id=_SMALL_ID,
        video_id=_SMALL_TEXT,
        persona_id=_SMALL_TEXT,
        summary=_SMALL_TEXT,
        visual_analysis=_OPT_STR,
        audio_transcript=_OPT_STR,
        key_frames=st.lists(_keyframe_strategy(), max_size=4),
        confidence=st.floats(min_value=0.0, max_value=1.0, allow_nan=False),
        transcript_json=st.none()
        | st.dictionaries(_SMALL_TEXT, st.integers() | _SMALL_TEXT, max_size=3),
        audio_language=_OPT_STR,
        speaker_count=st.none() | st.integers(min_value=0, max_value=32),
        audio_model_used=_OPT_STR,
        visual_model_used=_OPT_STR,
        fusion_strategy=_OPT_STR,
        processing_time_audio=_OPT_FLOAT,
        processing_time_visual=_OPT_FLOAT,
        processing_time_fusion=_OPT_FLOAT,
        reasoning_trace=_trace_strategy(),
    )


def test_lens_laws() -> None:
    """The GetPut law holds across a small generated sample of DTOs."""
    dx.testing.check_lens_laws(
        SummaryLayersLens(), _dto_strategy(), max_examples=50
    )
