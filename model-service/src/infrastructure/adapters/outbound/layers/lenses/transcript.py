"""Lens between a transcription result and canonical layers records.

A :class:`~src.application.ports.outbound.transcriber.TranscriptionResultDTO`
carries a full transcript plus per-segment timings, confidences, and optional
speaker labels. This lens projects it to a
:class:`lairs.integrations.codecs.CorpusFragment` of canonical ``lairs`` records:

- one :class:`lairs.records.expression.Expression` (``kind="transcript"``)
  holding the full transcript text,
- one :class:`lairs.records.segmentation.Segmentation` over a single
  ``Tokenization`` whose tokens are one per segment, each carrying the segment's
  temporal span (start/end scaled to integer milliseconds),
- when any segment is diarized, one ``tier``/``speaker``
  :class:`lairs.records.annotation.AnnotationLayer` with one temporally anchored
  annotation per speaker-labeled segment, plus one
  :class:`lairs.records.annotation.ClusterSet` grouping those annotations by
  speaker,
- one :class:`lairs.records.media.Media` (``kind="audio"``) whose ``AudioInfo``
  points at the transcript and segmentation and records the speaker count.

The layers view scales seconds to integer milliseconds and confidence to an
integer ``0..1000`` (layers puts no floats on the wire), so the projection is
lossy. It is therefore a :class:`didactic.api.Lens`, not an iso: the complement
carries the exact source floats and every field the integer view cannot
represent (the full text, each segment's exact ``start``/``end``/``confidence``/
``text``/``speaker``, the language, speaker count, and processing time), so the
GetPut law ``backward(*forward(dto)) == dto`` holds for every result.
"""

from __future__ import annotations

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
    conf_to_int,
    j_float,
    j_list,
    j_obj,
    j_str,
    local_uri,
    sec_to_ms,
)

# A deterministic default context for the ctx-free singleton used in law tests.
# The codec constructs a lens with the real EmitContext per request; the view's
# provenance never enters the complement, so the round-trip laws hold for any
# context (backward reconstructs the DTO from the complement alone).
_DEFAULT_CTX = EmitContext(
    video_id="video",
    created_at=datetime(2026, 1, 1, tzinfo=UTC),
    tool="transcriber",
)

# Fragment-local record identifiers (stable, so the view is deterministic).
_EXPRESSION_ID = "expression"
_SEGMENTATION_ID = "segmentation"
_SPEAKER_LAYER_ID = "speakers"
_CLUSTER_SET_ID = "clusters"
_MEDIA_ID = "media"


def _tokenization_uuid(video_id: str) -> defs.Uuid:
    return defs.Uuid(value=f"{video_id}:tok")


def _speaker_annotation_uuid(video_id: str, index: int) -> defs.Uuid:
    return defs.Uuid(value=f"{video_id}:speaker:{index}")


def _segment_from_json(value: JsonValue) -> TranscriptSegmentDTO:
    obj = j_obj(value)
    speaker = obj["speaker"]
    return TranscriptSegmentDTO(
        start=j_float(obj["start"]),
        end=j_float(obj["end"]),
        text=j_str(obj["text"]),
        confidence=j_float(obj["confidence"]),
        speaker=None if speaker is None else j_str(speaker),
    )


class TranscriptLayersLens(dx.Lens[TranscriptionResultDTO, CorpusFragment, JsonValue]):
    """Lossless lens ``TranscriptionResultDTO <-> (layers fragment, complement)``."""

    def __init__(self, ctx: EmitContext | None = None) -> None:
        self._ctx = ctx if ctx is not None else _DEFAULT_CTX

    def forward(self, dto: TranscriptionResultDTO) -> tuple[CorpusFragment, JsonValue]:
        """Project a transcription result to a layers fragment and complement."""
        ctx = self._ctx
        expr_uri = local_uri(ctx.authority, EXPRESSION_NSID, ctx.video_id)
        seg_uri = local_uri(ctx.authority, SEGMENTATION_NSID, ctx.video_id)
        layer_uri = local_uri(ctx.authority, ANNOTATION_LAYER_NSID, ctx.video_id)
        tokenization_id = _tokenization_uuid(ctx.video_id)

        records: list[FragmentRecord] = []

        records.append(
            _record(
                EXPRESSION_NSID,
                _EXPRESSION_ID,
                expression.Expression(
                    id=ctx.video_id,
                    kind="transcript",
                    text=dto.text,
                    createdAt=ctx.created_at,
                ),
            )
        )

        tokens = tuple(
            segmentation.Token(
                tokenIndex=index,
                text=segment.text,
                temporalSpan=defs.TemporalSpan(
                    start=sec_to_ms(segment.start),
                    ending=sec_to_ms(segment.end),
                ),
            )
            for index, segment in enumerate(dto.segments)
        )
        records.append(
            _record(
                SEGMENTATION_NSID,
                _SEGMENTATION_ID,
                segmentation.Segmentation(
                    createdAt=ctx.created_at,
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

        diarized = [
            (index, segment)
            for index, segment in enumerate(dto.segments)
            if segment.speaker is not None
        ]
        if diarized:
            annotations = tuple(
                annotation.Annotation(
                    uuid=_speaker_annotation_uuid(ctx.video_id, index),
                    anchor=defs.Anchor(
                        temporalSpan=defs.TemporalSpan(
                            start=sec_to_ms(segment.start),
                            ending=sec_to_ms(segment.end),
                        )
                    ),
                    label=segment.speaker,
                    confidence=conf_to_int(segment.confidence),
                )
                for index, segment in diarized
            )
            records.append(
                _record(
                    ANNOTATION_LAYER_NSID,
                    _SPEAKER_LAYER_ID,
                    annotation.AnnotationLayer(
                        annotations=annotations,
                        createdAt=ctx.created_at,
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
                    defs.ObjectRef(localId=_speaker_annotation_uuid(ctx.video_id, index))
                )
            clusters = tuple(
                annotation.Cluster(
                    uuid=defs.Uuid(value=f"{ctx.video_id}:cluster:{speaker}"),
                    canonicalLabel=speaker,
                    members=tuple(members),
                )
                for speaker, members in members_by_speaker.items()
            )
            records.append(
                _record(
                    CLUSTERSET_NSID,
                    _CLUSTER_SET_ID,
                    annotation.ClusterSet(
                        clusters=clusters,
                        createdAt=ctx.created_at,
                        kind="clustering",
                        expression=expr_uri,
                        layerRef=layer_uri,
                    ),
                )
            )

        records.append(
            _record(
                MEDIA_NSID,
                _MEDIA_ID,
                media.Media(
                    kind="audio",
                    createdAt=ctx.created_at,
                    audio=media.AudioInfo(
                        transcriptRef=expr_uri,
                        segmentationRef=seg_uri,
                        speakerCount=dto.speaker_count,
                    ),
                ),
            )
        )

        view = CorpusFragment(records=tuple(records), source="fovea")
        complement: JsonValue = {
            "text": dto.text,
            "language": dto.language,
            "speaker_count": dto.speaker_count,
            "processing_time": dto.processing_time,
            "segments": [
                {
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text,
                    "confidence": segment.confidence,
                    "speaker": segment.speaker,
                }
                for segment in dto.segments
            ],
        }
        return view, complement

    def backward(self, view: CorpusFragment, complement: JsonValue) -> TranscriptionResultDTO:
        """Reconstruct a transcription result from its fragment and complement."""
        comp = j_obj(complement)
        language = comp["language"]
        speaker_count = comp["speaker_count"]
        return TranscriptionResultDTO(
            text=j_str(comp["text"]),
            segments=[_segment_from_json(segment) for segment in j_list(comp["segments"])],
            language=None if language is None else j_str(language),
            speaker_count=None if speaker_count is None else int(j_float(speaker_count)),
            processing_time=j_float(comp["processing_time"]),
        )


TRANSCRIPT_LAYERS = TranscriptLayersLens()
