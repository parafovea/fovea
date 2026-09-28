"""Lens between a transcription result and canonical layers records.

A :class:`~src.application.ports.outbound.transcriber.TranscriptionResultDTO`
carries a full transcript plus per-segment timings, confidences, and optional
speaker labels. This lens projects it to a
:class:`lairs.integrations.codecs.CorpusFragment` of canonical ``lairs`` records,
with those records authoritative — there is no verbatim sidecar:

- one :class:`lairs.records.expression.Expression` (``kind="transcript"``)
  holding the full transcript text and its language on ``languages``,
- one :class:`lairs.records.segmentation.Segmentation` over a single
  ``Tokenization`` whose tokens are one per segment, each carrying the segment's
  temporal span (start/end scaled to integer milliseconds) and text,
- one ``token-tag``/``confidence``
  :class:`lairs.records.annotation.AnnotationLayer` carrying every segment's
  integer confidence (diarized or not), keyed to its token by ``tokenIndex``,
- when any segment is diarized, one ``tier``/``speaker``
  :class:`lairs.records.annotation.AnnotationLayer` labeling each speaker-tagged
  token, plus one :class:`lairs.records.annotation.ClusterSet` grouping those
  tokens by speaker, and
- one :class:`lairs.records.media.Media` (``kind="audio"``) whose ``AudioInfo``
  points at the transcript and segmentation and records the speaker count.

The integer confidence is canonical (the layers vocabulary is integer-by-design;
the sub-0.001 remainder is noise) and the processing time is wall-clock
telemetry, so the lens drops it. Every reconstructed field is read back from the
canonical records, so the complement is empty and the round-trip holds over the
quantized, telemetry-free result.

The record builders and reader are exposed as :func:`build_transcript_records` /
:func:`read_transcript_records` so the summary lens can compose the same
transcript sub-structure over a distinct expression rather than blobbing a
transcript dict.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import didactic.api as dx
from lairs.integrations.codecs import CorpusFragment, FragmentRecord
from lairs.records import annotation, defs, expression, media, segmentation

from src.application.ports.outbound.layers_codec import EmitContext
from src.application.ports.outbound.transcriber import (
    TranscriptionResultDTO,
    TranscriptSegmentDTO,
)
from src.infrastructure.adapters.outbound.layers._convert import (
    ANNOTATION_LAYER_NSID,
    CLUSTERSET_NSID,
    EXPRESSION_NSID,
    MEDIA_NSID,
    SEGMENTATION_NSID,
    JsonValue,
    _record,
    conf_from_int,
    conf_to_int,
    local_uri,
    ms_to_sec,
    sec_to_ms,
)

# A deterministic default context for the ctx-free singleton used in law tests.
# The codec constructs a lens with the real EmitContext per request; the view's
# provenance never enters a complement, so the round-trip laws hold for any
# context (backward reconstructs the DTO from the emitted records alone).
_DEFAULT_CTX = EmitContext(
    video_id="video",
    created_at=datetime(2026, 1, 1, tzinfo=UTC),
    tool="transcriber",
)

# The tool every emitted record attributes its work to.
_TOOL = "fovea"

# Fragment-local record identifiers, minted with an optional prefix so the
# summary lens can compose a second transcript sub-fragment without collision.
_EXPRESSION_ID = "expression"
_SEGMENTATION_ID = "segmentation"
_CONFIDENCE_LAYER_ID = "confidence"
_SPEAKER_LAYER_ID = "speakers"
_SENTIMENT_LAYER_ID = "sentiment"
_CLUSTER_SET_ID = "clusters"
_MEDIA_ID = "media"


@dataclass(frozen=True)
class SegmentData:
    """One normalized transcript segment shared by the transcript/summary lenses.

    ``sentiment`` has no home on a :class:`TranscriptSegmentDTO`; it rides here so
    the summary lens can carry per-segment sentiment through the same builders.
    """

    start: float
    end: float
    text: str
    confidence: float
    speaker: str | None = None
    sentiment: str | None = None


@dataclass(frozen=True)
class TranscriptPayload:
    """The transcript sub-structure, decoupled from any one source DTO."""

    text: str | None
    segments: tuple[SegmentData, ...]
    language: str | None
    speaker_count: int | None
    model_id: str | None
    has_segmentation: bool


@dataclass(frozen=True)
class TranscriptRefs:
    """Ids and provenance a transcript sub-fragment mints its records against."""

    authority: str
    expr_id: str
    local_prefix: str
    created_at: datetime


def _text_or_null(value: str | None) -> str:
    """Recover a required text field the lens always sets.

    A lairs scalar ``str | None`` column collapses the literal string ``"null"``
    to JSON null and reads it back as ``None`` (verified against the lairs record
    models). This helper is applied only where absence is impossible — a required
    DTO field, or an optional one whose own record/sub-field presence already
    disambiguates ``None`` from ``"null"`` — so a read-back ``None`` uniquely
    denotes an original ``"null"`` and every other string, ``""`` included,
    round-trips as itself.
    """
    return "null" if value is None else value


def _tokenization_uuid(expr_id: str) -> defs.Uuid:
    return defs.Uuid(value=f"{expr_id}:tok")


def build_transcript_records(
    payload: TranscriptPayload, refs: TranscriptRefs
) -> list[FragmentRecord]:
    """Project a transcript payload to its canonical layers records.

    Emits the transcript ``Expression`` and (audio) ``Media`` always; the
    ``Segmentation`` and its token-aligned confidence/speaker/sentiment layers
    only when ``payload.has_segmentation`` (the caller's signal that structured
    segments exist, distinct from an empty segment list).
    """
    prefix = refs.local_prefix
    expr_uri = local_uri(refs.authority, EXPRESSION_NSID, refs.expr_id)
    seg_uri = local_uri(refs.authority, SEGMENTATION_NSID, refs.expr_id)
    speaker_layer_uri = local_uri(refs.authority, ANNOTATION_LAYER_NSID, f"{refs.expr_id}:speaker")
    tokenization_id = _tokenization_uuid(refs.expr_id)

    records: list[FragmentRecord] = []

    expr_metadata = (
        defs.AnnotationMetadata(agent=defs.AgentRef(id=payload.model_id), tool=_TOOL)
        if payload.model_id is not None
        else None
    )
    records.append(
        _record(
            EXPRESSION_NSID,
            f"{prefix}{_EXPRESSION_ID}",
            expression.Expression(
                id=refs.expr_id,
                kind="transcript",
                text=payload.text,
                createdAt=refs.created_at,
                languages=(payload.language,) if payload.language is not None else None,
                metadata=expr_metadata,
            ),
        )
    )

    segmentation_ref: str | None = None
    if payload.has_segmentation:
        segmentation_ref = seg_uri
        tokens = tuple(
            segmentation.Token(
                tokenIndex=index,
                text=segment.text,
                temporalSpan=defs.TemporalSpan(
                    start=sec_to_ms(segment.start),
                    ending=sec_to_ms(segment.end),
                ),
            )
            for index, segment in enumerate(payload.segments)
        )
        records.append(
            _record(
                SEGMENTATION_NSID,
                f"{prefix}{_SEGMENTATION_ID}",
                segmentation.Segmentation(
                    createdAt=refs.created_at,
                    expression=expr_uri,
                    tokenizations=(
                        segmentation.Tokenization(
                            uuid=tokenization_id,
                            kind="custom",
                            tokens=tokens,
                        ),
                    ),
                ),
            )
        )

        if payload.segments:
            confidence_annotations = tuple(
                annotation.Annotation(
                    uuid=defs.Uuid(value=f"{refs.expr_id}:conf:{index}"),
                    tokenIndex=index,
                    confidence=conf_to_int(segment.confidence),
                )
                for index, segment in enumerate(payload.segments)
            )
            records.append(
                _record(
                    ANNOTATION_LAYER_NSID,
                    f"{prefix}{_CONFIDENCE_LAYER_ID}",
                    annotation.AnnotationLayer(
                        annotations=confidence_annotations,
                        createdAt=refs.created_at,
                        expression=expr_uri,
                        kind="token-tag",
                        subkind="confidence",
                        tokenizationId=tokenization_id,
                    ),
                )
            )

        diarized = [
            (index, segment)
            for index, segment in enumerate(payload.segments)
            if segment.speaker is not None
        ]
        if diarized:
            speaker_annotations = tuple(
                annotation.Annotation(
                    uuid=defs.Uuid(value=f"{refs.expr_id}:speaker:{index}"),
                    tokenIndex=index,
                    label=segment.speaker,
                )
                for index, segment in diarized
            )
            records.append(
                _record(
                    ANNOTATION_LAYER_NSID,
                    f"{prefix}{_SPEAKER_LAYER_ID}",
                    annotation.AnnotationLayer(
                        annotations=speaker_annotations,
                        createdAt=refs.created_at,
                        expression=expr_uri,
                        kind="tier",
                        subkind="speaker",
                        tokenizationId=tokenization_id,
                    ),
                )
            )

            members_by_speaker: dict[str, list[defs.ObjectRef]] = {}
            for index, segment in diarized:
                speaker = segment.speaker
                assert speaker is not None
                members_by_speaker.setdefault(speaker, []).append(
                    defs.ObjectRef(localId=defs.Uuid(value=f"{refs.expr_id}:speaker:{index}"))
                )
            clusters = tuple(
                annotation.Cluster(
                    uuid=defs.Uuid(value=f"{refs.expr_id}:cluster:{speaker}"),
                    canonicalLabel=speaker,
                    members=tuple(members),
                )
                for speaker, members in members_by_speaker.items()
            )
            records.append(
                _record(
                    CLUSTERSET_NSID,
                    f"{prefix}{_CLUSTER_SET_ID}",
                    annotation.ClusterSet(
                        clusters=clusters,
                        createdAt=refs.created_at,
                        kind="clustering",
                        expression=expr_uri,
                        layerRef=speaker_layer_uri,
                    ),
                )
            )

        sentimented = [
            (index, segment)
            for index, segment in enumerate(payload.segments)
            if segment.sentiment is not None
        ]
        if sentimented:
            sentiment_annotations = tuple(
                annotation.Annotation(
                    uuid=defs.Uuid(value=f"{refs.expr_id}:sentiment:{index}"),
                    tokenIndex=index,
                    label=segment.sentiment,
                )
                for index, segment in sentimented
            )
            records.append(
                _record(
                    ANNOTATION_LAYER_NSID,
                    f"{prefix}{_SENTIMENT_LAYER_ID}",
                    annotation.AnnotationLayer(
                        annotations=sentiment_annotations,
                        createdAt=refs.created_at,
                        expression=expr_uri,
                        kind="token-tag",
                        subkind="sentiment",
                        tokenizationId=tokenization_id,
                    ),
                )
            )

    records.append(
        _record(
            MEDIA_NSID,
            f"{prefix}{_MEDIA_ID}",
            media.Media(
                kind="audio",
                createdAt=refs.created_at,
                audio=media.AudioInfo(
                    transcriptRef=expr_uri,
                    segmentationRef=segmentation_ref,
                    speakerCount=payload.speaker_count,
                ),
            ),
        )
    )
    return records


def _labels_by_token(record: FragmentRecord | None) -> dict[int, str | None]:
    """Read a token-tag layer's annotation labels keyed by ``tokenIndex``."""
    if record is None:
        return {}
    layer = annotation.AnnotationLayer.model_validate_json(record.value_json)
    return {ann.tokenIndex: ann.label for ann in layer.annotations if ann.tokenIndex is not None}


def read_transcript_records(
    records: tuple[FragmentRecord, ...], local_prefix: str
) -> TranscriptPayload | None:
    """Reconstruct a transcript payload from a fragment's records.

    Returns ``None`` when the fragment carries no transcript expression under
    ``local_prefix`` (the summary lens's signal that the DTO had no audio).
    """
    by_id = {record.local_id: record for record in records}
    expr_record = by_id.get(f"{local_prefix}{_EXPRESSION_ID}")
    if expr_record is None:
        return None

    expr = expression.Expression.model_validate_json(expr_record.value_json)
    language = expr.languages[0] if expr.languages else None
    # The metadata rides only when a model id is present, so its presence is the
    # marker that separates an absent model from the literal id "null" (which the
    # lairs scalar column collapses to JSON null on the way in).
    model_id = (
        _text_or_null(expr.metadata.agent.id)
        if expr.metadata is not None and expr.metadata.agent is not None
        else None
    )

    speaker_count: int | None = None
    media_record = by_id.get(f"{local_prefix}{_MEDIA_ID}")
    if media_record is not None:
        med = media.Media.model_validate_json(media_record.value_json)
        speaker_count = med.audio.speakerCount if med.audio is not None else None

    seg_record = by_id.get(f"{local_prefix}{_SEGMENTATION_ID}")
    has_segmentation = seg_record is not None
    segments: tuple[SegmentData, ...] = ()
    if seg_record is not None:
        seg = segmentation.Segmentation.model_validate_json(seg_record.value_json)
        tokens = seg.tokenizations[0].tokens if seg.tokenizations else ()

        confidence_by_index: dict[int, float] = {}
        confidence_record = by_id.get(f"{local_prefix}{_CONFIDENCE_LAYER_ID}")
        if confidence_record is not None:
            layer = annotation.AnnotationLayer.model_validate_json(confidence_record.value_json)
            confidence_by_index = {
                ann.tokenIndex: conf_from_int(ann.confidence or 0)
                for ann in layer.annotations
                if ann.tokenIndex is not None
            }

        speaker_by_index = _labels_by_token(by_id.get(f"{local_prefix}{_SPEAKER_LAYER_ID}"))
        sentiment_by_index = _labels_by_token(by_id.get(f"{local_prefix}{_SENTIMENT_LAYER_ID}"))

        segments = tuple(
            SegmentData(
                start=ms_to_sec(token.temporalSpan.start) if token.temporalSpan else 0.0,
                end=ms_to_sec(token.temporalSpan.ending) if token.temporalSpan else 0.0,
                text=_text_or_null(token.text),
                confidence=confidence_by_index.get(token.tokenIndex, 0.0),
                speaker=speaker_by_index.get(token.tokenIndex),
                sentiment=sentiment_by_index.get(token.tokenIndex),
            )
            for token in tokens
        )

    return TranscriptPayload(
        text=expr.text,
        segments=segments,
        language=language,
        speaker_count=speaker_count,
        model_id=model_id,
        has_segmentation=has_segmentation,
    )


class TranscriptLayersLens(dx.Lens[TranscriptionResultDTO, CorpusFragment, JsonValue]):
    """Lens ``TranscriptionResultDTO <-> layers fragment`` with an empty complement."""

    def __init__(self, ctx: EmitContext | None = None) -> None:
        """Bind the provenance context stamped onto the emitted records."""
        self._ctx = ctx if ctx is not None else _DEFAULT_CTX

    def forward(self, dto: TranscriptionResultDTO) -> tuple[CorpusFragment, JsonValue]:
        """Project a transcription result to a layers fragment (no complement)."""
        ctx = self._ctx
        refs = TranscriptRefs(
            authority=ctx.authority,
            expr_id=ctx.video_id,
            local_prefix="",
            created_at=ctx.created_at,
        )
        payload = TranscriptPayload(
            text=dto.text,
            segments=tuple(
                SegmentData(
                    start=segment.start,
                    end=segment.end,
                    text=segment.text,
                    confidence=segment.confidence,
                    speaker=segment.speaker,
                )
                for segment in dto.segments
            ),
            language=dto.language,
            speaker_count=dto.speaker_count,
            model_id=None,
            has_segmentation=True,
        )
        records = build_transcript_records(payload, refs)
        return CorpusFragment(records=tuple(records), source="fovea"), None

    def backward(self, view: CorpusFragment, complement: JsonValue) -> TranscriptionResultDTO:
        """Reconstruct a transcription result from its layers fragment alone."""
        del complement  # every field is recovered from the canonical records
        payload = read_transcript_records(view.records, "")
        # The transcript lens always emits a transcript expression, so a fragment
        # it produced always reconstructs a payload.
        if payload is None:
            raise ValueError("transcript fragment carries no transcript expression")
        return TranscriptionResultDTO(
            text=_text_or_null(payload.text),
            segments=[
                TranscriptSegmentDTO(
                    start=segment.start,
                    end=segment.end,
                    text=segment.text,
                    confidence=segment.confidence,
                    speaker=segment.speaker,
                )
                for segment in payload.segments
            ],
            language=payload.language,
            speaker_count=payload.speaker_count,
            processing_time=0.0,
        )


TRANSCRIPT_LAYERS = TranscriptLayersLens()
