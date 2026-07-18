"""Lens between a fovea tracking result and canonical layers records.

A :class:`~src.application.dto.tracking.TrackObjectsResponseDTO` carries the
per-frame, per-object RLE masks a tracker (e.g. SAM2) produces over one video.
This lens projects that result to a
:class:`lairs.integrations.codecs.CorpusFragment` of canonical ``lairs`` records,
with those records authoritative — there is no verbatim sidecar:

- one :class:`lairs.records.expression.Expression` (``kind="video"``) naming the
  tracked video,
- one :class:`lairs.records.media.Media` (``kind="video"``) describing the source
  pixel dimensions and the ``frameRate`` (scaled by 100), and
- one span :class:`lairs.records.annotation.AnnotationLayer`
  (``subkind="custom"``, record key = the response id) holding, per tracked
  ``object_id``, one parent *track* :class:`~lairs.records.annotation.Annotation`
  (labeled by the object id, spanning the object's frames in time) with one child
  annotation per frame the object appears in. Each child anchors a single
  keyframe at its frame and carries that frame's mask as a ``coco-rle``
  ``annotation.spatial`` geometry (up to 65536 chars — a real mask, unlike the
  4096-char keyframe feature cap), plus the integer confidence, the occlusion
  flag, and the frame number as features.

The integer confidence is canonical, and the per-frame/per-response processing
time is model telemetry, so the lens drops it. Every reconstructed field is read
back from the canonical records, so the complement is empty and the round-trip
holds over the quantized, telemetry-free result.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import TYPE_CHECKING, TypedDict

import didactic.api as dx
from lairs.integrations.codecs import CorpusFragment, FragmentRecord
from lairs.records import annotation, defs, expression, media
from pycocotools import mask as coco_mask

from src.infrastructure.adapters.outbound.layers._convert import (
    ANNOTATION_LAYER_NSID,
    EXPRESSION_NSID,
    MEDIA_NSID,
    JsonValue,
    conf_from_int,
    conf_to_int,
    feature_map,
    local_uri,
    ms_to_sec,
    read_feature_map,
    sec_to_ms,
)

if TYPE_CHECKING:
    from src.application.dto.tracking import TrackingMaskDTO, TrackObjectsResponseDTO


# ``createdAt`` is required on the layers view records but is not part of the
# tracking DTO, so it is not round-trip data: a fixed epoch keeps the lens a
# pure DTO<->fragment map (the codec stamps real provenance from its context).
_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)

# Fragment-local identifiers for the records with a fixed key.
_EXPRESSION_LOCAL_ID = "expression"
_MEDIA_LOCAL_ID = "media"

# Child-annotation feature keys carrying the per-frame fields with no column.
_OCCLUDED_KEY = "is_occluded"
_FRAME_NUMBER_KEY = "frame_number"

# The frame rate is stored as an integer scaled by 100 (2997 == 29.97fps).
_FRAME_RATE_SCALE = 100


class _EncodedRle(TypedDict):
    """The RLE shape ``pycocotools`` consumes: a size and a run-length count string."""

    size: list[int]
    counts: str | bytes


def _rle_counts_bytes(rle: dict[str, object]) -> _EncodedRle:
    """Return a copy of ``rle`` with ``counts`` as ``bytes`` for pycocotools."""
    counts = rle["counts"]
    if isinstance(counts, str):
        counts = counts.encode("ascii")
    if not isinstance(counts, bytes):
        raise ValueError("RLE counts must be a str or bytes")
    size = rle["size"]
    if not isinstance(size, list):
        raise ValueError("RLE size must be a list")
    return {"size": size, "counts": counts}


def _derive_bbox(rle: dict[str, object]) -> defs.BoundingBox:
    """Derive a pixel bounding box from a COCO RLE mask.

    Lossy: the exact RLE lives in ``annotation.spatial``. The width and height are
    clamped to a minimum of one pixel (the layers schema requires it) so an empty
    or degenerate mask still yields a valid box.
    """
    x, y, w, h = (float(v) for v in coco_mask.toBbox(_rle_counts_bytes(rle)))
    return defs.BoundingBox(
        x=round(x),
        y=round(y),
        width=max(1, round(w)),
        height=max(1, round(h)),
    )


def _spatial_from_rle(rle: dict[str, object]) -> defs.SpatialExpression:
    """Mirror an RLE mask into a ``coco-rle`` spatial geometry."""
    return defs.SpatialExpression(
        type="region",
        value=defs.SpatialEntity(
            geometry=json.dumps(rle),
            geometryFormat="coco-rle",
            type="polygon",
            crs="pixel",
        ),
    )


def _rle_from_spatial(spatial: defs.SpatialExpression | None) -> dict[str, object]:
    """Reconstruct the exact RLE mask from its ``coco-rle`` spatial geometry."""
    if spatial is None or spatial.value is None or spatial.value.geometry is None:
        raise ValueError("tracking child annotation carries no mask geometry")
    rle = json.loads(spatial.value.geometry)
    if not isinstance(rle, dict):
        raise ValueError("expected an RLE object geometry")
    return rle


def _as_int(value: JsonValue) -> int:
    """Narrow a stored numeric feature to an ``int`` (rejecting ``bool``)."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"expected int, got {type(value).__name__}")
    return value


class TrackingLayersLens(dx.Lens["TrackObjectsResponseDTO", CorpusFragment, JsonValue]):
    """Lens ``tracking result <-> layers fragment`` with an empty complement."""

    def forward(self, dto: TrackObjectsResponseDTO) -> tuple[CorpusFragment, JsonValue]:
        """Project a tracking result to a layers fragment (no complement)."""
        # Group masks by object in first-appearance order, keeping each mask's
        # frame number and timestamp so keyframes and the temporal span can build.
        order: list[int] = []
        by_object: dict[int, list[tuple[int, float, TrackingMaskDTO]]] = {}
        for frame in dto.frames:
            for mask in frame.masks:
                if mask.object_id not in by_object:
                    by_object[mask.object_id] = []
                    order.append(mask.object_id)
                by_object[mask.object_id].append((frame.frame_number, frame.timestamp, mask))

        expr_uri = local_uri("local", EXPRESSION_NSID, dto.video_id or _EXPRESSION_LOCAL_ID)

        annotations: list[annotation.Annotation] = []
        for object_id in order:
            entries = by_object[object_id]
            parent_uuid = str(object_id)
            child_uuids: list[str] = []
            children: list[annotation.Annotation] = []
            for frame_number, timestamp, mask in entries:
                child_uuid = f"{object_id}-f{frame_number}"
                child_uuids.append(child_uuid)
                time_ms = sec_to_ms(timestamp)
                children.append(
                    annotation.Annotation(
                        uuid=defs.Uuid(value=child_uuid),
                        parentId=defs.Uuid(value=parent_uuid),
                        anchor=defs.Anchor(
                            spatioTemporalAnchor=defs.SpatioTemporalAnchor(
                                temporalSpan=defs.TemporalSpan(start=time_ms, ending=time_ms),
                                keyframes=(
                                    defs.Keyframe(timeMs=time_ms, bbox=_derive_bbox(mask.mask_rle)),
                                ),
                                interpolation="step",
                            )
                        ),
                        spatial=_spatial_from_rle(mask.mask_rle),
                        confidence=conf_to_int(mask.confidence),
                        features=feature_map(
                            {_OCCLUDED_KEY: mask.is_occluded, _FRAME_NUMBER_KEY: frame_number}
                        ),
                    )
                )
            times = [sec_to_ms(timestamp) for _fn, timestamp, _mask in entries]
            annotations.append(
                annotation.Annotation(
                    uuid=defs.Uuid(value=parent_uuid),
                    label=parent_uuid,
                    anchor=defs.Anchor(
                        temporalSpan=defs.TemporalSpan(start=min(times), ending=max(times)),
                    ),
                    childIds=tuple(defs.Uuid(value=child) for child in child_uuids),
                )
            )
            annotations.extend(children)

        expression_record = expression.Expression(id=dto.video_id, kind="video", createdAt=_EPOCH)
        media_record = media.Media(
            kind="video",
            createdAt=_EPOCH,
            video=media.VideoInfo(
                width=dto.video_width,
                height=dto.video_height,
                frameRate=round(dto.fps * _FRAME_RATE_SCALE),
            ),
        )
        layer = annotation.AnnotationLayer(
            annotations=tuple(annotations),
            createdAt=_EPOCH,
            expression=expr_uri,
            kind="span",
            subkind="custom",
            sourceMethod="automatic",
        )
        records = (
            _record(EXPRESSION_NSID, _EXPRESSION_LOCAL_ID, expression_record),
            _record(MEDIA_NSID, _MEDIA_LOCAL_ID, media_record),
            _record(ANNOTATION_LAYER_NSID, dto.id, layer),
        )
        return CorpusFragment(records=records, source="fovea"), None

    def backward(self, view: CorpusFragment, complement: JsonValue) -> TrackObjectsResponseDTO:
        """Reconstruct a tracking result from its layers fragment alone."""
        del complement  # every field is recovered from the canonical records

        from src.application.dto.tracking import (  # noqa: PLC0415
            TrackingFrameDTO,
            TrackingMaskDTO,
            TrackObjectsResponseDTO,
        )

        expr = next(
            expression.Expression.model_validate_json(record.value_json)
            for record in view.records
            if record.nsid == EXPRESSION_NSID
        )
        med = next(
            media.Media.model_validate_json(record.value_json)
            for record in view.records
            if record.nsid == MEDIA_NSID
        )
        layer_record = next(
            record for record in view.records if record.nsid == ANNOTATION_LAYER_NSID
        )
        layer = annotation.AnnotationLayer.model_validate_json(layer_record.value_json)

        # Parent track annotations carry the object id in their label; the child
        # annotations carry the per-frame masks.
        object_by_uuid = {
            ann.uuid.value: int(ann.label)
            for ann in layer.annotations
            if ann.parentId is None and ann.label is not None
        }

        order: list[int] = []
        by_frame: dict[int, tuple[float, list[TrackingMaskDTO]]] = {}
        for ann in layer.annotations:
            if ann.parentId is None:
                continue
            anchor = ann.anchor
            if (
                anchor is None
                or anchor.spatioTemporalAnchor is None
                or not anchor.spatioTemporalAnchor.keyframes
            ):
                raise ValueError("tracking child annotation carries no keyframe")
            keyframe = anchor.spatioTemporalAnchor.keyframes[0]
            features = read_feature_map(ann.features)
            frame_number = _as_int(features[_FRAME_NUMBER_KEY])
            timestamp = ms_to_sec(keyframe.timeMs)
            if frame_number not in by_frame:
                by_frame[frame_number] = (timestamp, [])
                order.append(frame_number)
            by_frame[frame_number][1].append(
                TrackingMaskDTO(
                    object_id=object_by_uuid[ann.parentId.value],
                    mask_rle=_rle_from_spatial(ann.spatial),
                    confidence=conf_from_int(ann.confidence or 0),
                    is_occluded=bool(features[_OCCLUDED_KEY]),
                )
            )

        frames = [
            TrackingFrameDTO(
                frame_number=frame_number,
                timestamp=by_frame[frame_number][0],
                masks=by_frame[frame_number][1],
                processing_time=0.0,
            )
            for frame_number in order
        ]
        total_frames = max(order) + 1 if order else 0

        video = med.video
        fps = (
            (video.frameRate / _FRAME_RATE_SCALE) if video and video.frameRate is not None else 0.0
        )
        return TrackObjectsResponseDTO(
            id=layer_record.local_id,
            video_id=expr.id or "",
            frames=frames,
            video_width=video.width if video and video.width is not None else 0,
            video_height=video.height if video and video.height is not None else 0,
            total_frames=total_frames,
            processing_time=0.0,
            fps=fps,
        )


def _record(nsid: str, local_id: str, model: dx.Model) -> FragmentRecord:
    return FragmentRecord(local_id=local_id, nsid=nsid, value_json=model.model_dump_json())


TRACKING_LAYERS = TrackingLayersLens()
