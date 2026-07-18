"""Lens between a detection response DTO and canonical layers records.

A :class:`~src.application.dto.detection.DetectObjectsResponseDTO` carries
per-frame, per-detection normalized bounding boxes with float confidences over a
video. This lens projects it to a
:class:`lairs.integrations.codecs.CorpusFragment` of canonical ``lairs`` records,
with those records authoritative — there is no verbatim sidecar:

- one :class:`lairs.records.expression.Expression` (``kind="video"``) naming the
  video the detections describe,
- one :class:`lairs.records.media.Media` (``kind="video"``) carrying the source
  frame dimensions and a best-effort ``frameRate`` (scaled by 100) in a
  :class:`lairs.records.media.VideoInfo`, and
- one span :class:`lairs.records.annotation.AnnotationLayer`
  (``subkind="entity-mention"``) whose ``reproducibility.command`` records the
  query and whose fragment-local record key is the response id. Each annotation
  carries, per detection, a ``spatioTemporalAnchor`` with a single ``step``
  keyframe (the frame time in milliseconds, a pixel bounding box, and the frame
  number as a keyframe feature), the exact normalized box in
  ``annotation.spatial`` (``crs="percentage"``), the detection label, an integer
  confidence, and the track id as a feature.

The integer confidence is canonical (the layers vocabulary is integer-by-design;
the sub-0.001 remainder is noise), and the frame-processing time is model
telemetry, so the lens drops it. Every reconstructed field is read back from the
canonical records, so the complement is empty and the round-trip holds over the
quantized, telemetry-free result.
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
    EXPRESSION_NSID,
    MEDIA_NSID,
    JsonValue,
    _record,
    conf_from_int,
    conf_to_int,
    feature_map,
    local_uri,
    ms_to_sec,
    norm_bbox_to_px,
    read_feature_map,
    sec_to_ms,
)

# The lens is a pure structural mapping; provenance timestamps (createdAt) are
# stamped by the codec from an EmitContext, not by the lens. A fixed placeholder
# keeps the view a deterministic function of the DTO. It is never read back (the
# DTO carries no creation time), so it does not affect the round-trip.
_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)

# Fragment-local identifiers for the records with a fixed key.
_EXPRESSION_LOCAL_ID = "expression"
_MEDIA_LOCAL_ID = "media"

# The interpolation mode for a single-keyframe detection: a box holds until the
# next keyframe rather than being interpolated toward one.
_INTERPOLATION = "step"

# Feature keys carrying the per-detection fields with no dedicated column.
_TRACK_ID_KEY = "track_id"
_FRAME_NUMBER_KEY = "frame_number"

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


def _as_int(value: JsonValue) -> int:
    """Narrow a stored numeric feature to an ``int`` (rejecting ``bool``)."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"expected int, got {type(value).__name__}")
    return value


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
            keyframes=(
                defs.Keyframe(
                    timeMs=time_ms,
                    bbox=pixel_box,
                    features=feature_map({_FRAME_NUMBER_KEY: frame.frame_number}),
                ),
            ),
            interpolation=_INTERPOLATION,
        )
    )
    features = (
        feature_map({_TRACK_ID_KEY: detection.track_id}) if detection.track_id is not None else None
    )
    return annotation.Annotation(
        uuid=_detection_uuid(video_id, frame.frame_number, index),
        anchor=anchor,
        label=detection.label,
        confidence=conf_to_int(detection.confidence),
        spatial=_spatial_from_norm_box(detection.bounding_box),
        features=features,
    )


def _detection_from_annotation(ann: annotation.Annotation) -> tuple[int, float, DetectionDTO]:
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
    frame_features = read_feature_map(keyframe.features)
    frame_number = _as_int(frame_features[_FRAME_NUMBER_KEY])
    timestamp = ms_to_sec(keyframe.timeMs)
    ann_features = read_feature_map(ann.features)
    track = ann_features.get(_TRACK_ID_KEY)
    detection = DetectionDTO(
        label=ann.label or "",
        bounding_box=_norm_box_from_spatial(ann.spatial),
        confidence=conf_from_int(ann.confidence or 0),
        track_id=track if isinstance(track, str) else None,
    )
    return frame_number, timestamp, detection


def _query_of(command: str | None) -> str:
    """Recover the query the lens always records on ``reproducibility.command``.

    A ``str`` value of exactly ``"null"`` serializes to JSON null, so a ``None``
    read back uniquely denotes the literal ``"null"``; every other string,
    ``""`` included, round-trips as itself.
    """
    return "null" if command is None else command


class DetectionLayersLens(dx.Lens[DetectObjectsResponseDTO, CorpusFragment, JsonValue]):
    """Lens ``DetectObjectsResponseDTO <-> layers fragment`` with an empty complement."""

    def forward(self, dto: DetectObjectsResponseDTO) -> tuple[CorpusFragment, JsonValue]:
        """Project a detection response to a layers fragment (no complement)."""
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

        annotations = tuple(
            _detection_annotation(
                detection,
                frame,
                dto.video_id,
                index,
                dto.video_width,
                dto.video_height,
            )
            for frame in dto.frames
            for index, detection in enumerate(frame.detections)
        )
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
                    annotations=annotations,
                ),
            )
        )

        return CorpusFragment(records=tuple(records), source="fovea"), None

    def backward(self, view: CorpusFragment, complement: JsonValue) -> DetectObjectsResponseDTO:
        """Reconstruct a detection response from its layers fragment alone."""
        del complement  # every field is recovered from the canonical records

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

        # Regroup the per-detection annotations back into frames, in the frame's
        # first-appearance order (empty frames carry no detections and drop out).
        order: list[int] = []
        by_frame: dict[int, tuple[float, list[DetectionDTO]]] = {}
        total = 0
        for ann in layer.annotations:
            frame_number, timestamp, detection = _detection_from_annotation(ann)
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

        video = med.video
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
