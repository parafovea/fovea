"""Lens between a fovea tracking result and canonical layers records.

A :class:`~src.application.dto.tracking.TrackObjectsResponseDTO` carries the
per-frame, per-object RLE masks a tracker (e.g. SAM2) produces over one video.
The lens projects that result to a
:class:`lairs.integrations.codecs.CorpusFragment` of ``lairs`` records:

- one :class:`lairs.records.expression.Expression` (``kind="video"``) naming the
  tracked video,
- one :class:`lairs.records.media.Media` (``kind="video"``) describing the source
  pixel dimensions, the ``frameRate`` (scaled by 100), and the video's total frame
  count,
- one span :class:`lairs.records.annotation.AnnotationLayer`
  (``subkind="custom"``, record key = the response id) holding one
  :class:`~lairs.records.annotation.Annotation` per frame an object appears in.
  Each annotation anchors a single keyframe at its frame and carries that frame's
  mask as a ``coco-rle`` ``annotation.spatial`` geometry (up to 65536 chars, wider
  than the 4096-char keyframe feature cap), the integer confidence, and the frame's
  occlusion as the keyframe's visibility, and
- one :class:`lairs.records.annotation.ClusterSet` grouping those annotations by
  tracked object: one cluster per ``object_id`` (the object id is the cluster's
  ``uuid``, and its members are the per-frame annotations of that object).

Confidence scales to the layers integer range. The frame number follows from the
keyframe's ``timeMs`` and the media ``frameRate``, and the per-frame and
per-response processing time is model telemetry the lens omits.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import TYPE_CHECKING, TypedDict

import didactic.api as dx
from lairs.integrations.codecs import CorpusFragment
from lairs.records import annotation, defs, expression, media
from pycocotools import mask as coco_mask

from src.infrastructure.adapters.outbound.layers._convert import (
    ANNOTATION_LAYER_NSID,
    CLUSTERSET_NSID,
    EXPRESSION_NSID,
    MEDIA_NSID,
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

if TYPE_CHECKING:
    from src.application.dto.tracking import TrackingMaskDTO, TrackObjectsResponseDTO


# ``createdAt`` is required on the layers view records but is not part of the
# tracking DTO, so a fixed epoch keeps the lens a deterministic DTO->fragment map
# (the codec stamps real provenance from its context).
_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)

# Fragment-local identifiers for the records with a fixed key.
_EXPRESSION_LOCAL_ID = "expression"
_MEDIA_LOCAL_ID = "media"
_TRACK_CLUSTER_ID = "tracks"

# The keyframe visibility flag: present and false marks an occluded frame.
_VISIBLE_KEY = "visible"

# The media feature holding the video's total frame count.
_TOTAL_FRAMES_KEY = "total_frames"

# The kind slug for the track ClusterSet: the per-frame annotations of one object
# are grouped like coreferent mentions of the same object.
_CLUSTER_KIND = "clustering"

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

    The exact RLE lives in ``annotation.spatial``; this box is the keyframe's
    pixel anchor. The width and height are clamped to a minimum of one pixel (the
    layers schema requires it) so an empty or degenerate mask still yields a valid
    box.
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
        raise ValueError("tracking annotation carries no mask geometry")
    rle = json.loads(spatial.value.geometry)
    if not isinstance(rle, dict):
        raise ValueError("expected an RLE object geometry")
    return rle


def _as_int(value: JsonValue) -> int:
    """Narrow a stored numeric feature to an ``int`` (rejecting ``bool``)."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"expected int, got {type(value).__name__}")
    return value


def _frame_number(time_ms: int, frame_rate: int | None) -> int:
    """Recover a frame number from a keyframe time and the media frame rate."""
    if frame_rate is None:
        return 0
    return round(ms_to_sec(time_ms) * (frame_rate / _FRAME_RATE_SCALE))


def _keyframe_features(is_occluded: bool) -> defs.FeatureMap | None:
    """Carry an occluded frame as a keyframe visibility flag; a visible frame carries none."""
    if not is_occluded:
        return None
    return feature_map({_VISIBLE_KEY: False})


def _is_occluded(keyframe: defs.Keyframe) -> bool:
    """Sample a keyframe's visibility: an absent or true flag means visible."""
    features = read_feature_map(keyframe.features)
    return not bool(features.get(_VISIBLE_KEY, True))


class TrackingLayersLens(dx.Lens["TrackObjectsResponseDTO", CorpusFragment, JsonValue]):
    """Lens between a tracking result and a layers fragment."""

    def forward(self, dto: TrackObjectsResponseDTO) -> tuple[CorpusFragment, JsonValue]:
        """Project a tracking result to a layers fragment."""
        # Group masks by object in first-appearance order, keeping each mask's
        # frame number and timestamp so keyframes and clusters can build.
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
        clusters: list[annotation.Cluster] = []
        for object_id in order:
            members: list[defs.ObjectRef] = []
            for frame_number, timestamp, mask in by_object[object_id]:
                child_uuid = f"{object_id}-f{frame_number}"
                members.append(defs.ObjectRef(localId=defs.Uuid(value=child_uuid)))
                time_ms = sec_to_ms(timestamp)
                annotations.append(
                    annotation.Annotation(
                        uuid=defs.Uuid(value=child_uuid),
                        anchor=defs.Anchor(
                            spatioTemporalAnchor=defs.SpatioTemporalAnchor(
                                temporalSpan=defs.TemporalSpan(start=time_ms, ending=time_ms),
                                keyframes=(
                                    defs.Keyframe(
                                        timeMs=time_ms,
                                        bbox=_derive_bbox(mask.mask_rle),
                                        features=_keyframe_features(mask.is_occluded),
                                    ),
                                ),
                                interpolation="step",
                            )
                        ),
                        spatial=_spatial_from_rle(mask.mask_rle),
                        confidence=conf_to_int(mask.confidence),
                    )
                )
            clusters.append(
                annotation.Cluster(uuid=defs.Uuid(value=str(object_id)), members=tuple(members))
            )

        expression_record = expression.Expression(id=dto.video_id, kind="video", createdAt=_EPOCH)
        media_record = media.Media(
            kind="video",
            createdAt=_EPOCH,
            video=media.VideoInfo(
                width=dto.video_width,
                height=dto.video_height,
                frameRate=round(dto.fps * _FRAME_RATE_SCALE),
            ),
            features=feature_map({_TOTAL_FRAMES_KEY: dto.total_frames}),
        )
        layer = annotation.AnnotationLayer(
            annotations=tuple(annotations),
            createdAt=_EPOCH,
            expression=expr_uri,
            kind="span",
            subkind="custom",
            sourceMethod="automatic",
        )
        cluster_set = annotation.ClusterSet(
            clusters=tuple(clusters),
            createdAt=_EPOCH,
            kind=_CLUSTER_KIND,
            expression=expr_uri,
        )
        records = (
            _record(EXPRESSION_NSID, _EXPRESSION_LOCAL_ID, expression_record),
            _record(MEDIA_NSID, _MEDIA_LOCAL_ID, media_record),
            _record(ANNOTATION_LAYER_NSID, dto.id, layer),
            _record(CLUSTERSET_NSID, _TRACK_CLUSTER_ID, cluster_set),
        )
        return CorpusFragment(records=records, source="fovea"), None

    def backward(self, view: CorpusFragment, complement: JsonValue) -> TrackObjectsResponseDTO:
        """Reconstruct a tracking result from its layers fragment."""
        del complement  # the fragment carries every field

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
        cluster_record = next(
            (record for record in view.records if record.nsid == CLUSTERSET_NSID), None
        )

        # Each annotation's tracked object id is the uuid of the cluster it belongs to.
        object_by_annotation: dict[str, int] = {}
        if cluster_record is not None:
            cluster_set = annotation.ClusterSet.model_validate_json(cluster_record.value_json)
            for cluster in cluster_set.clusters:
                object_id = int(cluster.uuid.value)
                for member in cluster.members:
                    if member.localId is not None:
                        object_by_annotation[member.localId.value] = object_id

        video = med.video
        frame_rate = video.frameRate if video is not None else None

        order: list[int] = []
        by_frame: dict[int, tuple[float, list[TrackingMaskDTO]]] = {}
        for ann in layer.annotations:
            anchor = ann.anchor
            if (
                anchor is None
                or anchor.spatioTemporalAnchor is None
                or not anchor.spatioTemporalAnchor.keyframes
            ):
                raise ValueError("tracking annotation carries no keyframe")
            keyframe = anchor.spatioTemporalAnchor.keyframes[0]
            timestamp = ms_to_sec(keyframe.timeMs)
            frame_number = _frame_number(keyframe.timeMs, frame_rate)
            if frame_number not in by_frame:
                by_frame[frame_number] = (timestamp, [])
                order.append(frame_number)
            by_frame[frame_number][1].append(
                TrackingMaskDTO(
                    object_id=object_by_annotation[ann.uuid.value],
                    mask_rle=_rle_from_spatial(ann.spatial),
                    confidence=conf_from_int(ann.confidence or 0),
                    is_occluded=_is_occluded(keyframe),
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

        media_features = read_feature_map(med.features)
        total_frames = (
            _as_int(media_features[_TOTAL_FRAMES_KEY]) if _TOTAL_FRAMES_KEY in media_features else 0
        )

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


TRACKING_LAYERS = TrackingLayersLens()
