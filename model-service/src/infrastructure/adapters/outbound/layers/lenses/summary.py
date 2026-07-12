"""Lens between a fovea summary result and canonical layers records.

A :class:`~src.application.dto.summarization.SummarizeResponseDTO` carries a
video-level multimodal summary: a free-text summary, an optional visual
analysis, per-keyframe descriptions with timestamps and confidences, and a pile
of audio/fusion provenance the layers annotation schema has no slot for. This
lens projects that DTO to a :class:`lairs.integrations.codecs.CorpusFragment` of
two canonical ``lairs`` records:

- one :class:`lairs.records.expression.Expression` (``kind="multimodal"``) whose
  ``text`` is the summary, and
- one ``document-tag`` :class:`lairs.records.annotation.AnnotationLayer` carrying
  a document-level ``summary`` annotation (its ``value`` the visual analysis) and
  one temporally-anchored annotation per keyframe.

The layers view puts no floats on the wire (confidence scales to ``0..1000`` and
seconds to integer milliseconds) and has no home for the audio/fusion fields, so
the round-trip is a :class:`didactic.api.Lens`: the view captures the summary,
visual analysis, and keyframe descriptions; the complement carries the
fovea-only remainder (the exact source confidences and timestamps, the keyframes
verbatim, the transcript, the model ids, the processing times, and the reasoning
trace), so the GetPut law ``backward(*forward(dto)) == dto`` holds for every DTO.

The :class:`~src.application.ports.outbound.layers_codec.EmitContext` supplied at
construction stamps provenance (``createdAt``, ``tool``, minting authority) onto
the view only; none of it participates in the DTO round-trip, so the module-level
:data:`SUMMARY_LAYERS` singleton uses a fixed default context.
"""

from __future__ import annotations

from datetime import UTC, datetime

import didactic.api as dx
from lairs.author import builders
from lairs.integrations.codecs import CorpusFragment, FragmentRecord
from lairs.records import annotation, defs, expression

from src.application.dto.reasoning import ThinkingStep, ThinkingTrace
from src.application.dto.summarization import KeyFrameDTO, SummarizeResponseDTO
from src.application.ports.outbound.layers_codec import EmitContext
from src.infrastructure.adapters.outbound.layers._convert import (
    ANNOTATION_LAYER_NSID,
    EXPRESSION_NSID,
    JsonValue,
    conf_to_int,
    j_float,
    j_list,
    j_obj,
    j_str,
    local_uri,
    sec_to_ms,
)

# A fixed context so the singleton is deterministic; the codec constructs the
# lens with the real EmitContext per call. None of these fields round-trip.
_DEFAULT_CTX = EmitContext(
    video_id="",
    created_at=datetime(1970, 1, 1, tzinfo=UTC),
    tool="fovea",
)

_EXPRESSION_LOCAL_ID = "summary:expression"
_LAYER_LOCAL_ID = "summary:layer"

# The document-level annotation carries this reserved label so backward can
# distinguish it from the per-keyframe annotations.
_SUMMARY_LABEL = "summary"


def _doc_uuid(dto: SummarizeResponseDTO) -> defs.Uuid:
    return defs.Uuid(value=f"{dto.id}:summary")


def _keyframe_uuid(dto: SummarizeResponseDTO, index: int) -> defs.Uuid:
    return defs.Uuid(value=f"{dto.id}:kf:{index}")


def _trace_to_json(trace: ThinkingTrace | None) -> JsonValue:
    if trace is None:
        return None
    return {
        "steps": [
            {"content": step.content, "tokens_used": step.tokens_used}
            for step in trace.steps
        ],
        "total_tokens": trace.total_tokens,
        "model_id": trace.model_id,
    }


def _trace_from_json(value: JsonValue) -> ThinkingTrace | None:
    if value is None:
        return None
    obj = j_obj(value)
    steps = [
        ThinkingStep(
            content=j_str(j_obj(step)["content"]),
            tokens_used=_opt_int(j_obj(step).get("tokens_used")),
        )
        for step in j_list(obj["steps"])
    ]
    return ThinkingTrace(
        steps=steps,
        total_tokens=_opt_int(obj.get("total_tokens")),
        model_id=j_str(obj["model_id"]),
    )


def _keyframe_to_json(kf: KeyFrameDTO) -> JsonValue:
    return {
        "frame_number": kf.frame_number,
        "timestamp": kf.timestamp,
        "description": kf.description,
        "confidence": kf.confidence,
    }


def _keyframe_from_json(value: JsonValue) -> KeyFrameDTO:
    obj = j_obj(value)
    return KeyFrameDTO(
        frame_number=int(j_float(obj["frame_number"])),
        timestamp=j_float(obj["timestamp"]),
        description=j_str(obj["description"]),
        confidence=j_float(obj["confidence"]),
    )


def _opt_int(value: JsonValue) -> int | None:
    return None if value is None else int(j_float(value))


def _opt_float(value: JsonValue) -> float | None:
    return None if value is None else j_float(value)


def _opt_str(value: JsonValue) -> str | None:
    return None if value is None else j_str(value)


class SummaryLayersLens(dx.Lens[SummarizeResponseDTO, CorpusFragment, JsonValue]):
    """Lossless lens ``SummarizeResponseDTO <-> (layers fragment, complement)``."""

    def __init__(self, ctx: EmitContext | None = None) -> None:
        """Bind the provenance context stamped onto the emitted view."""
        self.ctx = ctx if ctx is not None else _DEFAULT_CTX

    def forward(
        self, dto: SummarizeResponseDTO
    ) -> tuple[CorpusFragment, JsonValue]:
        """Project a summary result to a layers fragment and fovea complement."""
        ctx = self.ctx
        expr = expression.Expression(
            id=dto.video_id,
            kind="multimodal",
            createdAt=ctx.created_at,
            text=dto.summary,
        )
        expression_uri = local_uri(ctx.authority, EXPRESSION_NSID, dto.video_id)

        annotations: list[annotation.Annotation] = [
            annotation.Annotation(
                uuid=_doc_uuid(dto),
                label=_SUMMARY_LABEL,
                text=dto.summary,
                value=dto.visual_analysis,
            )
        ]
        for index, kf in enumerate(dto.key_frames):
            ms = sec_to_ms(kf.timestamp)
            annotations.append(
                annotation.Annotation(
                    uuid=_keyframe_uuid(dto, index),
                    anchor=builders.temporal(ms, ms),
                    label=kf.description,
                    confidence=conf_to_int(kf.confidence),
                )
            )

        layer = annotation.AnnotationLayer(
            annotations=tuple(annotations),
            createdAt=ctx.created_at,
            expression=expression_uri,
            kind="document-tag",
            metadata=defs.AnnotationMetadata(
                agent=defs.AgentRef(id=dto.visual_model_used),
                confidence=conf_to_int(dto.confidence),
                timestamp=ctx.created_at,
                tool=ctx.tool,
            ),
        )

        records = (
            FragmentRecord(
                local_id=_EXPRESSION_LOCAL_ID,
                nsid=EXPRESSION_NSID,
                value_json=expr.model_dump_json(),
            ),
            FragmentRecord(
                local_id=_LAYER_LOCAL_ID,
                nsid=ANNOTATION_LAYER_NSID,
                value_json=layer.model_dump_json(),
            ),
        )
        view = CorpusFragment(records=records, source="fovea")

        complement: JsonValue = {
            "id": dto.id,
            "persona_id": dto.persona_id,
            "audio_transcript": dto.audio_transcript,
            "key_frames": [_keyframe_to_json(kf) for kf in dto.key_frames],
            "confidence": dto.confidence,
            "transcript_json": dto.transcript_json,
            "audio_language": dto.audio_language,
            "speaker_count": dto.speaker_count,
            "audio_model_used": dto.audio_model_used,
            "visual_model_used": dto.visual_model_used,
            "fusion_strategy": dto.fusion_strategy,
            "processing_time_audio": dto.processing_time_audio,
            "processing_time_visual": dto.processing_time_visual,
            "processing_time_fusion": dto.processing_time_fusion,
            "reasoning_trace": _trace_to_json(dto.reasoning_trace),
        }
        return view, complement

    def backward(
        self, view: CorpusFragment, complement: JsonValue
    ) -> SummarizeResponseDTO:
        """Reconstruct a summary result from its fragment and complement."""
        comp = j_obj(complement)
        video_id = ""
        summary = ""
        visual_analysis: str | None = None
        for record in view.records:
            if record.nsid == EXPRESSION_NSID:
                expr = expression.Expression.model_validate_json(record.value_json)
                video_id = expr.id
                summary = expr.text if expr.text is not None else ""
            elif record.nsid == ANNOTATION_LAYER_NSID:
                layer = annotation.AnnotationLayer.model_validate_json(
                    record.value_json
                )
                for ann in layer.annotations:
                    if ann.label == _SUMMARY_LABEL and ann.anchor is None:
                        visual_analysis = ann.value
                        break

        transcript = comp["transcript_json"]
        transcript_json = transcript if isinstance(transcript, dict) else None

        return SummarizeResponseDTO(
            id=j_str(comp["id"]),
            video_id=video_id,
            persona_id=j_str(comp["persona_id"]),
            summary=summary,
            visual_analysis=visual_analysis,
            audio_transcript=_opt_str(comp["audio_transcript"]),
            key_frames=[
                _keyframe_from_json(kf) for kf in j_list(comp["key_frames"])
            ],
            confidence=j_float(comp["confidence"]),
            transcript_json=transcript_json,
            audio_language=_opt_str(comp["audio_language"]),
            speaker_count=_opt_int(comp["speaker_count"]),
            audio_model_used=_opt_str(comp["audio_model_used"]),
            visual_model_used=_opt_str(comp["visual_model_used"]),
            fusion_strategy=_opt_str(comp["fusion_strategy"]),
            processing_time_audio=_opt_float(comp["processing_time_audio"]),
            processing_time_visual=_opt_float(comp["processing_time_visual"]),
            processing_time_fusion=_opt_float(comp["processing_time_fusion"]),
            reasoning_trace=_trace_from_json(comp["reasoning_trace"]),
        )


SUMMARY_LAYERS = SummaryLayersLens()
