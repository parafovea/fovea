"""Lens between a fovea summary result and canonical layers records.

A :class:`~src.application.dto.summarization.SummarizeResponseDTO` carries a
video-level multimodal summary: a free-text summary, an optional visual analysis,
per-keyframe descriptions with timestamps and confidences, an optional structured
transcript with diarization, and a pile of audio/fusion provenance. This lens
projects that DTO to a :class:`lairs.integrations.codecs.CorpusFragment` of
canonical ``lairs`` records, with those records authoritative — there is no
verbatim sidecar:

- one :class:`lairs.records.expression.Expression` (``kind="multimodal"``) whose
  ``text`` is the summary, ``id`` is the summary's own id, and ``features`` carry
  the open fusion strategy,
- when a visual analysis is present, a second child ``Expression``
  (``kind="section"``, ``parentRef`` the summary) whose ``text`` is the analysis
  prose (a full linguistic unit, not a capped tag value),
- one ``document-tag`` :class:`lairs.records.annotation.AnnotationLayer` whose
  ``metadata`` records the persona, overall confidence, the visual model, and the
  source-video dependency, and one temporally-anchored annotation per keyframe
  (description, confidence, and the frame number as a feature), and
- when the DTO carries audio, a composed transcript sub-fragment (a transcript
  ``Expression`` + ``Segmentation`` + token-tag confidence/sentiment layers +
  speaker tier + ``ClusterSet`` + audio ``Media``) built by the transcript lens.

The integer confidence is canonical (the layers vocabulary is integer-by-design;
the sub-0.001 remainder is noise); the reasoning trace and processing times are
model/pipeline telemetry, so the lens drops them, lifting only the visual/audio
model ids to ``annotationMetadata.agent``. Every reconstructed field is read back
from the canonical records, so the complement is empty and the round-trip holds
over the quantized, telemetry-free result.
"""

from __future__ import annotations

from datetime import UTC, datetime

import didactic.api as dx
from lairs.author import builders
from lairs.integrations.codecs import CorpusFragment, FragmentRecord
from lairs.records import annotation, defs, expression

from src.application.dto.summarization import KeyFrameDTO, SummarizeResponseDTO
from src.application.ports.outbound.layers_codec import EmitContext
from src.infrastructure.adapters.outbound.layers._convert import (
    ANNOTATION_LAYER_NSID,
    EXPRESSION_NSID,
    JsonValue,
    _record,
    conf_from_int,
    conf_to_int,
    feature_map,
    local_uri,
    ms_to_sec,
    read_feature_map,
    sec_to_ms,
)
from src.infrastructure.adapters.outbound.layers.lenses.transcript import (
    SegmentData,
    TranscriptPayload,
    TranscriptRefs,
    build_transcript_records,
    read_transcript_records,
)

# A fixed context so the singleton is deterministic; the codec constructs the
# lens with the real EmitContext per call. None of these fields round-trip.
_DEFAULT_CTX = EmitContext(
    video_id="",
    created_at=datetime(1970, 1, 1, tzinfo=UTC),
    tool="fovea",
)

# The tool every emitted record attributes its work to.
_TOOL = "fovea"

# Fragment-local record identifiers.
_SUMMARY_EXPRESSION_ID = "summary:expression"
_VISUAL_EXPRESSION_ID = "summary:visual"
_SUMMARY_LAYER_ID = "summary:layer"
_TRANSCRIPT_PREFIX = "transcript:"

# Open extension / feature keys with no dedicated column.
_FK_FUSION_STRATEGY = "fusion_strategy"
_FK_FRAME_NUMBER = "frame_number"


def _text_or_null(value: str | None) -> str:
    """Recover a required text field the lens always sets (see the transcript lens).

    A lairs scalar ``str | None`` column collapses the literal string ``"null"``
    to JSON null and reads it back as ``None`` (verified against the lairs record
    models). This helper is applied only where absence is impossible — a required
    DTO field, or an optional one whose own record/sub-field presence already
    disambiguates ``None`` from ``"null"`` — so a read-back ``None`` uniquely
    denotes an original ``"null"`` and every other string (``""`` included)
    round-trips as itself.
    """
    return "null" if value is None else value


def _as_int(value: JsonValue) -> int:
    """Narrow a stored numeric feature to an ``int`` (rejecting ``bool``)."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"expected int, got {type(value).__name__}")
    return value


def _has_audio(dto: SummarizeResponseDTO) -> bool:
    """Whether the DTO carries any audio signal warranting a transcript sub-fragment."""
    return (
        dto.transcript_json is not None
        or dto.audio_transcript is not None
        or dto.audio_language is not None
        or dto.speaker_count is not None
        or dto.audio_model_used is not None
    )


def _segments_from_transcript_json(
    transcript_json: dict[str, object] | None,
) -> tuple[SegmentData, ...]:
    """Read the normalized segments from a summary's structured transcript dict."""
    if transcript_json is None:
        return ()
    raw_segments = transcript_json.get("segments")
    if not isinstance(raw_segments, list):
        return ()
    segments: list[SegmentData] = []
    for raw in raw_segments:
        assert isinstance(raw, dict)
        speaker = raw.get("speaker")
        sentiment = raw.get("sentiment")
        segments.append(
            SegmentData(
                start=float(raw["start"]),
                end=float(raw["end"]),
                text=str(raw["text"]),
                confidence=float(raw["confidence"]),
                speaker=None if speaker is None else str(speaker),
                sentiment=None if sentiment is None else str(sentiment),
            )
        )
    return tuple(segments)


def _transcript_json_from_payload(payload: TranscriptPayload) -> dict[str, object] | None:
    """Rebuild the canonical structured transcript dict from a transcript payload.

    Returns ``None`` when the payload carried no segmentation (the DTO's
    ``transcript_json`` was ``None``), distinct from an empty segment list.

    The canonical fovea shape is ``{"segments": [...], "speakers": [...],
    "language": "..."}``. Every field is reconstructed from the transcript
    sub-fragment's own native records — segments from the tokenization plus its
    token-tag layers, top-level ``speakers`` from the diarization ``ClusterSet``
    (the distinct segment speakers, sorted), and ``language`` from the transcript
    ``Expression.languages``. Non-canonical top-level keys and per-segment keys
    beyond ``start``/``end``/``text``/``speaker``/``confidence``/``sentiment`` are
    outside the fovea contract and are not carried (there is no opaque bucket).
    """
    if not payload.has_segmentation:
        return None
    segments: list[dict[str, object]] = []
    for segment in payload.segments:
        entry: dict[str, object] = {
            "start": segment.start,
            "end": segment.end,
            "text": segment.text,
            "speaker": segment.speaker,
            "confidence": segment.confidence,
        }
        if segment.sentiment is not None:
            entry["sentiment"] = segment.sentiment
        segments.append(entry)
    result: dict[str, object] = {"segments": segments}
    speakers = sorted({s.speaker for s in payload.segments if s.speaker is not None})
    if speakers:
        result["speakers"] = speakers
    if payload.language is not None:
        result["language"] = payload.language
    return result


class SummaryLayersLens(dx.Lens[SummarizeResponseDTO, CorpusFragment, JsonValue]):
    """Lens ``SummarizeResponseDTO <-> layers fragment`` with an empty complement."""

    def __init__(self, ctx: EmitContext | None = None) -> None:
        """Bind the provenance context stamped onto the emitted records."""
        self.ctx = ctx if ctx is not None else _DEFAULT_CTX

    def forward(self, dto: SummarizeResponseDTO) -> tuple[CorpusFragment, JsonValue]:
        """Project a summary result to a layers fragment (no complement)."""
        ctx = self.ctx
        summary_uri = local_uri(ctx.authority, EXPRESSION_NSID, dto.id)
        video_uri = local_uri(ctx.authority, EXPRESSION_NSID, dto.video_id)

        records: list[FragmentRecord] = [
            _record(
                EXPRESSION_NSID,
                _SUMMARY_EXPRESSION_ID,
                expression.Expression(
                    id=dto.id,
                    kind="multimodal",
                    createdAt=ctx.created_at,
                    text=dto.summary,
                    features=(
                        feature_map({_FK_FUSION_STRATEGY: dto.fusion_strategy})
                        if dto.fusion_strategy is not None
                        else None
                    ),
                ),
            )
        ]

        if dto.visual_analysis is not None:
            records.append(
                _record(
                    EXPRESSION_NSID,
                    _VISUAL_EXPRESSION_ID,
                    expression.Expression(
                        id=f"{dto.id}:visual",
                        kind="section",
                        createdAt=ctx.created_at,
                        text=dto.visual_analysis,
                        parentRef=summary_uri,
                    ),
                )
            )

        keyframe_annotations = tuple(
            self._keyframe_annotation(dto.id, index, kf) for index, kf in enumerate(dto.key_frames)
        )
        records.append(
            _record(
                ANNOTATION_LAYER_NSID,
                _SUMMARY_LAYER_ID,
                annotation.AnnotationLayer(
                    annotations=keyframe_annotations,
                    createdAt=ctx.created_at,
                    expression=summary_uri,
                    kind="document-tag",
                    metadata=defs.AnnotationMetadata(
                        # The agent rides only when a visual model id is present,
                        # so its presence (not its collapsible id string) is the
                        # marker that distinguishes an absent model from the
                        # literal id "null".
                        agent=(
                            defs.AgentRef(id=dto.visual_model_used)
                            if dto.visual_model_used is not None
                            else None
                        ),
                        confidence=conf_to_int(dto.confidence),
                        dependencies=(defs.ObjectRef(recordRef=video_uri),),
                        personaRef=dto.persona_id,
                        timestamp=ctx.created_at,
                        tool=_TOOL,
                    ),
                ),
            )
        )

        if _has_audio(dto):
            payload = TranscriptPayload(
                text=dto.audio_transcript,
                segments=_segments_from_transcript_json(dto.transcript_json),
                language=dto.audio_language,
                speaker_count=dto.speaker_count,
                model_id=dto.audio_model_used,
                has_segmentation=dto.transcript_json is not None,
            )
            refs = TranscriptRefs(
                authority=ctx.authority,
                expr_id=f"{dto.id}:transcript",
                local_prefix=_TRANSCRIPT_PREFIX,
                created_at=ctx.created_at,
            )
            records.extend(build_transcript_records(payload, refs))

        return CorpusFragment(records=tuple(records), source="fovea"), None

    def _keyframe_annotation(
        self, summary_id: str, index: int, kf: KeyFrameDTO
    ) -> annotation.Annotation:
        ms = sec_to_ms(kf.timestamp)
        return annotation.Annotation(
            uuid=defs.Uuid(value=f"{summary_id}:kf:{index}"),
            anchor=builders.temporal(ms, ms),
            text=kf.description,
            confidence=conf_to_int(kf.confidence),
            features=feature_map({_FK_FRAME_NUMBER: kf.frame_number}),
        )

    def backward(self, view: CorpusFragment, complement: JsonValue) -> SummarizeResponseDTO:
        """Reconstruct a summary result from its layers fragment alone."""
        del complement  # every field is recovered from the canonical records
        by_id = {record.local_id: record.value_json for record in view.records}

        summary_expr = expression.Expression.model_validate_json(by_id[_SUMMARY_EXPRESSION_ID])
        summary_features = read_feature_map(summary_expr.features)
        fusion_strategy = summary_features.get(_FK_FUSION_STRATEGY)

        layer = annotation.AnnotationLayer.model_validate_json(by_id[_SUMMARY_LAYER_ID])
        metadata = layer.metadata
        persona_id = metadata.personaRef if metadata is not None else None
        confidence = conf_from_int(
            metadata.confidence if metadata is not None and metadata.confidence is not None else 0
        )
        visual_model_used = (
            _text_or_null(metadata.agent.id)
            if metadata is not None and metadata.agent is not None
            else None
        )
        video_id = _video_id_from_metadata(metadata)

        visual_analysis: str | None = None
        visual_record = by_id.get(_VISUAL_EXPRESSION_ID)
        if visual_record is not None:
            visual_expr = expression.Expression.model_validate_json(visual_record)
            visual_analysis = _text_or_null(visual_expr.text)

        key_frames = [_keyframe_from_annotation(ann) for ann in layer.annotations]

        payload = read_transcript_records(view.records, _TRANSCRIPT_PREFIX)
        if payload is None:
            audio_transcript = None
            transcript_json: dict[str, object] | None = None
            audio_language = None
            speaker_count = None
            audio_model_used = None
        else:
            audio_transcript = payload.text
            transcript_json = _transcript_json_from_payload(payload)
            audio_language = payload.language
            speaker_count = payload.speaker_count
            audio_model_used = payload.model_id

        return SummarizeResponseDTO(
            id=summary_expr.id,
            video_id=video_id,
            persona_id=_text_or_null(persona_id),
            summary=_text_or_null(summary_expr.text),
            visual_analysis=visual_analysis,
            audio_transcript=audio_transcript,
            key_frames=key_frames,
            confidence=confidence,
            transcript_json=transcript_json,
            audio_language=audio_language,
            speaker_count=speaker_count,
            audio_model_used=audio_model_used,
            visual_model_used=visual_model_used,
            fusion_strategy=None if fusion_strategy is None else str(fusion_strategy),
            processing_time_audio=None,
            processing_time_visual=None,
            processing_time_fusion=None,
            reasoning_trace=None,
        )


def _video_id_from_metadata(metadata: defs.AnnotationMetadata | None) -> str:
    """Recover the source-video id from the summary layer's dependency ref."""
    if metadata is None or not metadata.dependencies:
        return ""
    record_ref = metadata.dependencies[0].recordRef
    if record_ref is None:
        return ""
    return record_ref.rsplit("/", 1)[-1]


def _keyframe_from_annotation(ann: annotation.Annotation) -> KeyFrameDTO:
    """Reconstruct a keyframe from its temporally-anchored document-tag annotation."""
    anchor = ann.anchor
    span = anchor.temporalSpan if anchor is not None else None
    timestamp = ms_to_sec(span.start) if span is not None else 0.0
    features = read_feature_map(ann.features)
    frame_number = _as_int(features[_FK_FRAME_NUMBER])
    return KeyFrameDTO(
        frame_number=frame_number,
        timestamp=timestamp,
        description=_text_or_null(ann.text),
        confidence=conf_from_int(ann.confidence or 0),
    )


SUMMARY_LAYERS = SummaryLayersLens()
