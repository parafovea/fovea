"""Lens between a detection response DTO and canonical layers records.

A :class:`~src.application.dto.detection.DetectObjectsResponseDTO` carries
per-frame, per-detection normalized bounding boxes with float confidences over a
video. The lens projects it to a
:class:`lairs.integrations.codecs.CorpusFragment` of ``lairs`` records:

- one :class:`lairs.records.expression.Expression` (``kind="video"``) naming the
  video the detections describe,
- one :class:`lairs.records.media.Media` (``kind="video"``) carrying the source
  frame dimensions and the ``frameRate`` (scaled by 100) in a
  :class:`lairs.records.media.VideoInfo`,
- one span :class:`lairs.records.annotation.AnnotationLayer`
  (``subkind="entity-mention"``) whose ``reproducibility.command`` records the
  query and whose fragment-local record key is the response id. Each annotation
  carries, per detection, a ``spatioTemporalAnchor`` with a single keyframe at the
  detection's frame time (a pixel bounding box), the exact normalized box in
  ``annotation.spatial`` (``crs="percentage"``), the detection label, and an
  integer confidence, and
- one :class:`lairs.records.annotation.ClusterSet` grouping the detection
  annotations that share a track id: one cluster per track id (the track id is the
  cluster's ``uuid``, and its members are the annotations tracked as that object).

Confidence scales to the layers integer range. The frame number follows from the
keyframe's ``timeMs`` and the media ``frameRate``, and the frame-processing time
is model telemetry the lens omits.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

import didactic.api as dx
from lairs.integrations.codecs import CorpusFragment, FragmentRecord
from lairs.records import annotation, defs, expression, media

from src.application.dto.detection import (
    BoundingBoxDTO,
    DetectionDTO,
    DetectObjectsResponseDTO,
    FrameDetectionsDTO,
)
from src.infrastructure.adapters.outbound.layers._convert import (
    ANNOTATION_LAYER_NSID,
    CLUSTERSET_NSID,
    EXPRESSION_NSID,
    MEDIA_NSID,
    JsonValue,
    _record,
    conf_from_int,
    conf_to_int,
    local_uri,
    ms_to_sec,
    norm_bbox_to_px,
    sec_to_ms,
)

# The lens is a pure structural mapping; provenance timestamps (createdAt) are
# stamped by the codec from an EmitContext, not by the lens. A fixed placeholder
# keeps the view a deterministic function of the DTO.
_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)

# Fragment-local identifiers for the records with a fixed key.
_EXPRESSION_LOCAL_ID = "expression"
_MEDIA_LOCAL_ID = "media"
_TRACK_CLUSTER_ID = "tracks"

# The interpolation mode for a single-keyframe detection: a box holds until the
# next keyframe rather than being interpolated toward one.
_INTERPOLATION = "step"

# The kind slug for the track ClusterSet: per-frame detections of one tracked
# object are grouped like coreferent mentions of the same object.
_CLUSTER_KIND = "clustering"

# The exact normalized box rides as a JSON geometry (fractions of the frame),
# beyond what the integer pixel keyframe bbox can hold.
_GEOMETRY_FORMAT = "custom"

# The frame rate is stored as an integer scaled by 100 (2997 == 29.97fps).
_FRAME_RATE_SCALE = 100


def _detection_uuid(video_id: str, frame_number: int, index: int) -> defs.Uuid:
    """Mint a deterministic per-detection UUID (no randomness, for a pure lens)."""
    return defs.Uuid(value=f"{video_id}-f{frame_number}-d{index}")


def _derive_frame_rate(frames: list[FrameDetectionsDTO]) -> int | None:
    """Derive an integer ``frameRate`` (scaled by 100) from the frame times.

    A frame's ``frame_number / timestamp`` is the frame rate; the frame with the
    largest frame number gives the most stable estimate. Returns ``None`` when no
    frame carries a positive frame number and timestamp (the rate is unknown).
    """
    best: FrameDetectionsDTO | None = None
    for frame in frames:
        if (
            frame.frame_number > 0
            and frame.timestamp > 0
            and (best is None or frame.frame_number > best.frame_number)
        ):
            best = frame
    if best is None:
        return None
    return round(best.frame_number / best.timestamp * _FRAME_RATE_SCALE)


def _frame_number(time_ms: int, frame_rate: int | None) -> int:
    """Recover a frame number from a keyframe time and the media frame rate."""
    if frame_rate is None:
        return 0
    return round(ms_to_sec(time_ms) * (frame_rate / _FRAME_RATE_SCALE))


def _spatial_from_norm_box(box: BoundingBoxDTO) -> defs.SpatialExpression:
    """Carry the exact normalized box as a percentage-CRS geometry."""
    return defs.SpatialExpression(
        type="region",
        value=defs.SpatialEntity(
            geometry=json.dumps({"x": box.x, "y": box.y, "width": box.width, "height": box.height}),
            geometryFormat=_GEOMETRY_FORMAT,
            type="box",
            crs="percentage",
        ),
    )


def _norm_box_from_spatial(spatial: defs.SpatialExpression) -> BoundingBoxDTO:
    """Reconstruct the exact normalized box from its percentage-CRS geometry."""
    entity = spatial.value
    if entity is None or entity.geometry is None:
        raise ValueError("detection annotation carries no spatial geometry")
    box = json.loads(entity.geometry)
    return BoundingBoxDTO(
        x=float(box["x"]),
        y=float(box["y"]),
        width=float(box["width"]),
        height=float(box["height"]),
    )


def _detection_annotation(
    detection: DetectionDTO,
    frame: FrameDetectionsDTO,
    video_id: str,
    index: int,
    frame_width: int,
    frame_height: int,
) -> annotation.Annotation:
    """Project one detection to a spatio-temporally anchored annotation."""
    time_ms = sec_to_ms(frame.timestamp)
    pixel_box = norm_bbox_to_px(
        detection.bounding_box.x,
        detection.bounding_box.y,
        detection.bounding_box.width,
        detection.bounding_box.height,
        frame_width,
        frame_height,
    )
    anchor = defs.Anchor(
        spatioTemporalAnchor=defs.SpatioTemporalAnchor(
            temporalSpan=defs.TemporalSpan(start=time_ms, ending=time_ms),
            keyframes=(defs.Keyframe(timeMs=time_ms, bbox=pixel_box),),
            interpolation=_INTERPOLATION,
        )
    )
    return annotation.Annotation(
        uuid=_detection_uuid(video_id, frame.frame_number, index),
        anchor=anchor,
        label=detection.label,
        confidence=conf_to_int(detection.confidence),
        spatial=_spatial_from_norm_box(detection.bounding_box),
    )


def _detection_from_annotation(
    ann: annotation.Annotation,
    frame_rate: int | None,
    track_id: str | None,
) -> tuple[int, float, DetectionDTO]:
    """Read one detection (with its frame number and timestamp) from an annotation."""
    anchor = ann.anchor
    if (
        anchor is None
        or anchor.spatioTemporalAnchor is None
        or not anchor.spatioTemporalAnchor.keyframes
    ):
        raise ValueError("detection annotation carries no spatio-temporal keyframe")
    if ann.spatial is None:
        raise ValueError("detection annotation carries no spatial geometry")
    keyframe = anchor.spatioTemporalAnchor.keyframes[0]
    timestamp = ms_to_sec(keyframe.timeMs)
    frame_number = _frame_number(keyframe.timeMs, frame_rate)
    detection = DetectionDTO(
        label=ann.label or "",
        bounding_box=_norm_box_from_spatial(ann.spatial),
        confidence=conf_from_int(ann.confidence or 0),
        track_id=track_id,
    )
    return frame_number, timestamp, detection


def _query_of(command: str | None) -> str:
    """Recover the query the lens always records on ``reproducibility.command``.

    A ``str`` value of exactly ``"null"`` serializes to JSON null, so a ``None``
    read back uniquely denotes the literal ``"null"``; every other string,
    ``""`` included, round-trips as itself.
    """
    return "null" if command is None else command


def _track_clusters(
    tracked: list[tuple[str, str]],
) -> tuple[annotation.Cluster, ...]:
    """Group ``(annotation_uuid, track_id)`` pairs into one cluster per track id."""
    members_by_track: dict[str, list[defs.ObjectRef]] = {}
    order: list[str] = []
    for ann_uuid, track_id in tracked:
        if track_id not in members_by_track:
            members_by_track[track_id] = []
            order.append(track_id)
        members_by_track[track_id].append(defs.ObjectRef(localId=defs.Uuid(value=ann_uuid)))
    return tuple(
        annotation.Cluster(
            uuid=defs.Uuid(value=track_id), members=tuple(members_by_track[track_id])
        )
        for track_id in order
    )


def _track_by_annotation(view: CorpusFragment) -> dict[str, str]:
    """Map each tracked annotation's uuid to its track id, from the track ClusterSet."""
    record = next((r for r in view.records if r.nsid == CLUSTERSET_NSID), None)
    if record is None:
        return {}
    cluster_set = annotation.ClusterSet.model_validate_json(record.value_json)
    mapping: dict[str, str] = {}
    for cluster in cluster_set.clusters:
        for member in cluster.members:
            if member.localId is not None:
                mapping[member.localId.value] = cluster.uuid.value
    return mapping


class DetectionLayersLens(dx.Lens[DetectObjectsResponseDTO, CorpusFragment, JsonValue]):
    """Lens between a detection response and a layers fragment."""

    def forward(self, dto: DetectObjectsResponseDTO) -> tuple[CorpusFragment, JsonValue]:
        """Project a detection response to a layers fragment."""
        expression_uri = local_uri("local", EXPRESSION_NSID, dto.video_id or _EXPRESSION_LOCAL_ID)
        frame_rate = _derive_frame_rate(dto.frames)
        records: list[FragmentRecord] = [
            _record(
                EXPRESSION_NSID,
                _EXPRESSION_LOCAL_ID,
                expression.Expression(id=dto.video_id, kind="video", createdAt=_EPOCH),
            ),
            _record(
                MEDIA_NSID,
                _MEDIA_LOCAL_ID,
                media.Media(
                    kind="video",
                    createdAt=_EPOCH,
                    video=media.VideoInfo(
                        width=dto.video_width,
                        height=dto.video_height,
                        frameRate=frame_rate,
                    ),
                ),
            ),
        ]

        annotations: list[annotation.Annotation] = []
        tracked: list[tuple[str, str]] = []
        for frame in dto.frames:
            for index, detection in enumerate(frame.detections):
                ann = _detection_annotation(
                    detection,
                    frame,
                    dto.video_id,
                    index,
                    dto.video_width,
                    dto.video_height,
                )
                annotations.append(ann)
                if detection.track_id is not None:
                    tracked.append((ann.uuid.value, detection.track_id))

        # The response id is the annotation layer's fragment-local record key.
        records.append(
            _record(
                ANNOTATION_LAYER_NSID,
                dto.id,
                annotation.AnnotationLayer(
                    expression=expression_uri,
                    kind="span",
                    subkind="entity-mention",
                    sourceMethod="automatic",
                    createdAt=_EPOCH,
                    reproducibility=defs.ReproducibilityInfo(command=dto.query),
                    annotations=tuple(annotations),
                ),
            )
        )

        clusters = _track_clusters(tracked)
        if clusters:
            records.append(
                _record(
                    CLUSTERSET_NSID,
                    _TRACK_CLUSTER_ID,
                    annotation.ClusterSet(
                        clusters=clusters,
                        createdAt=_EPOCH,
                        kind=_CLUSTER_KIND,
                        expression=expression_uri,
                    ),
                )
            )

        return CorpusFragment(records=tuple(records), source="fovea"), None

    def backward(self, view: CorpusFragment, complement: JsonValue) -> DetectObjectsResponseDTO:
        """Reconstruct a detection response from its layers fragment."""
        del complement  # the fragment carries every field

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

        video = med.video
        frame_rate = video.frameRate if video is not None else None
        track_by_annotation = _track_by_annotation(view)

        # Regroup the per-detection annotations back into frames, in the frame's
        # first-appearance order (empty frames carry no detections and drop out).
        order: list[int] = []
        by_frame: dict[int, tuple[float, list[DetectionDTO]]] = {}
        total = 0
        for ann in layer.annotations:
            frame_number, timestamp, detection = _detection_from_annotation(
                ann, frame_rate, track_by_annotation.get(ann.uuid.value)
            )
            if frame_number not in by_frame:
                by_frame[frame_number] = (timestamp, [])
                order.append(frame_number)
            by_frame[frame_number][1].append(detection)
            total += 1

        frames = [
            FrameDetectionsDTO(
                frame_number=frame_number,
                timestamp=by_frame[frame_number][0],
                detections=by_frame[frame_number][1],
            )
            for frame_number in order
        ]

        return DetectObjectsResponseDTO(
            id=layer_record.local_id,
            video_id=expr.id or "",
            query=_query_of(layer.reproducibility.command if layer.reproducibility else None),
            frames=frames,
            total_detections=total,
            processing_time=0.0,
            video_width=video.width if video and video.width is not None else 0,
            video_height=video.height if video and video.height is not None else 0,
        )


DETECTION_LAYERS = DetectionLayersLens()
