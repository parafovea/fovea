"""Lens between a detection response DTO and canonical layers records.

A :class:`~src.application.dto.detection.DetectObjectsResponseDTO` carries
per-frame, per-detection normalized bounding boxes with float confidences over a
video. This lens projects it to a
:class:`lairs.integrations.codecs.CorpusFragment` of canonical ``lairs`` records:

- one :class:`lairs.records.expression.Expression` (``kind="video"``) naming the
  video the detections describe,
- one :class:`lairs.records.media.Media` (``kind="video"``) carrying the source
  frame dimensions in a :class:`lairs.records.media.VideoInfo`,
- one span :class:`lairs.records.annotation.AnnotationLayer`
  (``subkind="entity-mention"``) whose annotations carry, per detection, a
  ``spatioTemporalAnchor`` with a single ``step``-interpolated keyframe (the
  frame time in milliseconds and the pixel bounding box), the detection label,
  an integer confidence, and the track id as a feature.

The layers view is integer-only (milliseconds, pixels, confidence scaled
0-1000), so the projection is lossy and the round-trip is a :class:`dx.Lens`
rather than an isomorphism. The complement carries the exact source values the
integer view cannot represent — the normalized float boxes, the float
confidences, the float frame timestamps in seconds, the frame numbers, the track
ids, and the response header fields (id, video id, query, total detections,
processing time, and frame dimensions) — so GetPut holds: ``backward(*forward(
dto)) == dto`` for every response.
"""

from __future__ import annotations

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
    conf_to_int,
    feature_map,
    j_float,
    j_list,
    j_obj,
    j_str,
    local_uri,
    norm_bbox_to_px,
    sec_to_ms,
)

# The lens is a pure structural mapping; provenance timestamps (createdAt) are
# stamped by the codec from an EmitContext, not by the lens. A fixed placeholder
# keeps the view a deterministic function of the DTO. It is never read back (the
# DTO carries no creation time), so it does not affect the round-trip.
_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)

# Fragment-local identifiers for the emitted records.
_EXPRESSION_LOCAL_ID = "expression"
_MEDIA_LOCAL_ID = "media"
_LAYER_LOCAL_ID = "detections"

# The interpolation mode for a single-keyframe detection: a box holds until the
# next keyframe rather than being interpolated toward one.
_INTERPOLATION = "step"

# The feature key under which a detection's track id rides in the view.
_TRACK_ID_KEY = "track_id"


def _detection_uuid(video_id: str, frame_number: int, index: int) -> defs.Uuid:
    """Mint a deterministic per-detection UUID (no randomness, for a pure lens)."""
    return defs.Uuid(value=f"{video_id}-f{frame_number}-d{index}")


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
    box = norm_bbox_to_px(
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
            keyframes=(defs.Keyframe(timeMs=time_ms, bbox=box),),
            interpolation=_INTERPOLATION,
        )
    )
    features = (
        feature_map({_TRACK_ID_KEY: detection.track_id})
        if detection.track_id is not None
        else None
    )
    return annotation.Annotation(
        uuid=_detection_uuid(video_id, frame.frame_number, index),
        anchor=anchor,
        label=detection.label,
        confidence=conf_to_int(detection.confidence),
        features=features,
    )


def _detection_complement(detection: DetectionDTO) -> dict[str, JsonValue]:
    """Capture a detection's exact source values for the lens complement."""
    return {
        "label": detection.label,
        "confidence": detection.confidence,
        "track_id": detection.track_id,
        "bbox": {
            "x": detection.bounding_box.x,
            "y": detection.bounding_box.y,
            "width": detection.bounding_box.width,
            "height": detection.bounding_box.height,
        },
    }


def _frame_complement(frame: FrameDetectionsDTO) -> dict[str, JsonValue]:
    """Capture a frame's exact source values for the lens complement."""
    return {
        "frame_number": frame.frame_number,
        "timestamp": frame.timestamp,
        "detections": [_detection_complement(det) for det in frame.detections],
    }


def _bbox_from_complement(value: JsonValue) -> BoundingBoxDTO:
    """Reconstruct a normalized bounding box from its complement entry."""
    box = j_obj(value)
    return BoundingBoxDTO(
        x=j_float(box["x"]),
        y=j_float(box["y"]),
        width=j_float(box["width"]),
        height=j_float(box["height"]),
    )


def _detection_from_complement(value: JsonValue) -> DetectionDTO:
    """Reconstruct a detection from its complement entry."""
    det = j_obj(value)
    track = det["track_id"]
    return DetectionDTO(
        label=j_str(det["label"]),
        bounding_box=_bbox_from_complement(det["bbox"]),
        confidence=j_float(det["confidence"]),
        track_id=track if isinstance(track, str) else None,
    )


def _frame_from_complement(value: JsonValue) -> FrameDetectionsDTO:
    """Reconstruct a frame's detections from its complement entry."""
    frame = j_obj(value)
    return FrameDetectionsDTO(
        frame_number=int(j_float(frame["frame_number"])),
        timestamp=j_float(frame["timestamp"]),
        detections=[
            _detection_from_complement(det) for det in j_list(frame["detections"])
        ],
    )


class DetectionLayersLens(
    dx.Lens[DetectObjectsResponseDTO, CorpusFragment, JsonValue]
):
    """Lossy lens ``DetectObjectsResponseDTO <-> (layers fragment, complement)``."""

    def forward(
        self, dto: DetectObjectsResponseDTO
    ) -> tuple[CorpusFragment, JsonValue]:
        """Project a detection response to a layers fragment and complement."""
        expression_uri = local_uri(
            "local", EXPRESSION_NSID, dto.video_id or _EXPRESSION_LOCAL_ID
        )
        records: list[FragmentRecord] = [
            _record(
                EXPRESSION_NSID,
                _EXPRESSION_LOCAL_ID,
                expression.Expression(
                    id=dto.video_id,
                    kind="video",
                    createdAt=_EPOCH,
                    text=dto.query or None,
                ),
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
        records.append(
            _record(
                ANNOTATION_LAYER_NSID,
                _LAYER_LOCAL_ID,
                annotation.AnnotationLayer(
                    expression=expression_uri,
                    kind="span",
                    subkind="entity-mention",
                    createdAt=_EPOCH,
                    annotations=annotations,
                ),
            )
        )

        view = CorpusFragment(records=tuple(records), source="fovea")
        complement: JsonValue = {
            "id": dto.id,
            "video_id": dto.video_id,
            "query": dto.query,
            "total_detections": dto.total_detections,
            "processing_time": dto.processing_time,
            "video_width": dto.video_width,
            "video_height": dto.video_height,
            "frames": [_frame_complement(frame) for frame in dto.frames],
        }
        return view, complement

    def backward(
        self, view: CorpusFragment, complement: JsonValue
    ) -> DetectObjectsResponseDTO:
        """Reconstruct a detection response from its fragment and complement."""
        comp = j_obj(complement)
        return DetectObjectsResponseDTO(
            id=j_str(comp["id"]),
            video_id=j_str(comp["video_id"]),
            query=j_str(comp["query"]),
            frames=[_frame_from_complement(frame) for frame in j_list(comp["frames"])],
            total_detections=int(j_float(comp["total_detections"])),
            processing_time=j_float(comp["processing_time"]),
            video_width=int(j_float(comp["video_width"])),
            video_height=int(j_float(comp["video_height"])),
        )


DETECTION_LAYERS = DetectionLayersLens()
