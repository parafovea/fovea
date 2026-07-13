"""Lens between a fovea tracking result and canonical layers records.

A :class:`~src.application.dto.tracking.TrackObjectsResponseDTO` carries the
per-frame, per-object RLE masks a tracker (e.g. SAM2) produces over one video.
This lens projects that result to a
:class:`lairs.integrations.codecs.CorpusFragment` of canonical ``lairs`` records:

- one :class:`lairs.records.media.Media` (``kind="video"``) describing the
  source video's pixel dimensions, and
- one span :class:`lairs.records.annotation.AnnotationLayer`
  (``subkind="custom"``) with one :class:`~lairs.records.annotation.Annotation`
  per tracked ``object_id``. Each annotation anchors by a
  :class:`~lairs.records.defs.SpatioTemporalAnchor` whose keyframes carry a
  per-frame pixel bounding box *derived* from the RLE (via
  :func:`pycocotools.mask.toBbox`) plus the exact RLE, occlusion flag, and
  scaled confidence as keyframe features; the object's first RLE is also mirrored
  into ``annotation.spatial`` as a ``coco-rle`` geometry.

The layers view is *lossy*: seconds become integer milliseconds, confidences
become integers in ``[0, 1000]``, and each keyframe box is derived from the mask
rather than stored verbatim. So the round-trip is a :class:`dx.Lens`: the view
captures a faithful layers projection, and the complement carries the fovea-only
remainder (the exact RLE dicts — the source of truth — the source-second
timestamps, the float confidences, the occlusion flags, the object order, and
the response/frame scalars ``layers`` has no slot for), so the GetPut law holds
for every tracking result.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import didactic.api as dx
from lairs.integrations.codecs import CorpusFragment, FragmentRecord
from lairs.records import annotation, defs, media
from pycocotools import mask as coco_mask

from src.infrastructure.adapters.outbound.layers._convert import (
    ANNOTATION_LAYER_NSID,
    MEDIA_NSID,
    JsonValue,
    conf_to_int,
    feature_map,
    j_float,
    j_list,
    j_obj,
    j_str,
    local_uri,
    sec_to_ms,
)

if TYPE_CHECKING:
    from src.application.dto.tracking import TrackingMaskDTO, TrackObjectsResponseDTO


def _j_int(value: JsonValue) -> int:
    """Narrow a :data:`JsonValue` to an ``int`` (rejecting ``bool``)."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"expected int, got {type(value).__name__}")
    return value


def _j_bool(value: JsonValue) -> bool:
    """Narrow a :data:`JsonValue` to a ``bool``."""
    if not isinstance(value, bool):
        raise ValueError(f"expected bool, got {type(value).__name__}")
    return value


# ``createdAt`` is required on the layers view records but is not part of the
# tracking DTO, so it is not round-trip data: a fixed epoch keeps the lens a
# pure DTO<->fragment map (the codec stamps real provenance from its context).
_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


def _rle_counts_bytes(rle: dict[str, object]) -> dict[str, object]:
    """Return a copy of ``rle`` with ``counts`` as ``bytes`` for pycocotools."""
    counts = rle["counts"]
    if isinstance(counts, str):
        counts = counts.encode("ascii")
    return {"size": rle["size"], "counts": counts}


def _derive_bbox(rle: dict[str, object]) -> defs.BoundingBox:
    """Derive a pixel bounding box from a COCO RLE mask.

    Lossy: the exact RLE lives in the keyframe features and the complement. The
    width and height are clamped to a minimum of one pixel (the layers schema
    requires it) so an empty or degenerate mask still yields a valid box.
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


class TrackingLayersLens(
    dx.Lens["TrackObjectsResponseDTO", CorpusFragment, JsonValue]
):
    """Lossless lens ``tracking result <-> (layers fragment, fovea complement)``."""

    def forward(
        self, dto: TrackObjectsResponseDTO
    ) -> tuple[CorpusFragment, JsonValue]:
        """Project a tracking result to a layers fragment and fovea complement."""
        # Group masks by object in first-appearance order, keeping each mask's
        # frame timestamp so keyframes and the temporal span can be built.
        order: list[int] = []
        by_object: dict[int, list[tuple[float, TrackingMaskDTO]]] = {}
        for frame in dto.frames:
            for mask in frame.masks:
                if mask.object_id not in by_object:
                    by_object[mask.object_id] = []
                    order.append(mask.object_id)
                by_object[mask.object_id].append((frame.timestamp, mask))

        expr_uri = local_uri("local", MEDIA_NSID, dto.video_id)

        annotations: list[annotation.Annotation] = []
        for object_id in order:
            entries = by_object[object_id]
            keyframes: list[defs.Keyframe] = []
            for timestamp, mask in entries:
                keyframes.append(
                    defs.Keyframe(
                        timeMs=sec_to_ms(timestamp),
                        bbox=_derive_bbox(mask.mask_rle),
                        features=feature_map(
                            {
                                "mask_rle": mask.mask_rle,
                                "is_occluded": mask.is_occluded,
                                "confidence": conf_to_int(mask.confidence),
                            }
                        ),
                    )
                )
            times = [kf.timeMs for kf in keyframes]
            first_mask = entries[0][1]
            annotations.append(
                annotation.Annotation(
                    uuid=defs.Uuid(value=str(object_id)),
                    label=str(object_id),
                    confidence=conf_to_int(first_mask.confidence),
                    anchor=defs.Anchor(
                        spatioTemporalAnchor=defs.SpatioTemporalAnchor(
                            temporalSpan=defs.TemporalSpan(
                                start=min(times), ending=max(times)
                            ),
                            keyframes=tuple(keyframes),
                            interpolation="linear",
                        )
                    ),
                    spatial=_spatial_from_rle(first_mask.mask_rle),
                )
            )

        media_record = media.Media(
            kind="video",
            createdAt=_EPOCH,
            video=media.VideoInfo(
                width=dto.video_width, height=dto.video_height
            ),
        )
        layer = annotation.AnnotationLayer(
            annotations=tuple(annotations),
            createdAt=_EPOCH,
            expression=expr_uri,
            kind="span",
            subkind="custom",
        )
        records = (
            _tracking_record(MEDIA_NSID, "media", media_record),
            _tracking_record(ANNOTATION_LAYER_NSID, "tracking", layer),
        )
        view = CorpusFragment(records=records, source="fovea")

        complement: JsonValue = {
            "id": dto.id,
            "video_id": dto.video_id,
            "video_width": dto.video_width,
            "video_height": dto.video_height,
            "total_frames": dto.total_frames,
            "processing_time": dto.processing_time,
            "fps": dto.fps,
            "frames": [
                {
                    "frame_number": frame.frame_number,
                    "timestamp": frame.timestamp,
                    "processing_time": frame.processing_time,
                    "masks": [
                        {
                            "object_id": mask.object_id,
                            "mask_rle": mask.mask_rle,
                            "confidence": mask.confidence,
                            "is_occluded": mask.is_occluded,
                        }
                        for mask in frame.masks
                    ],
                }
                for frame in dto.frames
            ],
        }
        return view, complement

    def backward(
        self, view: CorpusFragment, complement: JsonValue
    ) -> TrackObjectsResponseDTO:
        """Reconstruct a tracking result from its fovea complement.

        The exact RLE masks, float confidences, and source-second timestamps are
        the complement's, never the lossy layers view's derived boxes.
        """
        from src.application.dto.tracking import (  # noqa: PLC0415
            TrackingFrameDTO,
            TrackingMaskDTO,
            TrackObjectsResponseDTO,
        )

        comp = j_obj(complement)
        frames: list[TrackingFrameDTO] = []
        for frame_value in j_list(comp["frames"]):
            frame = j_obj(frame_value)
            masks = [
                TrackingMaskDTO(
                    object_id=_j_int(mask["object_id"]),
                    mask_rle=j_obj(mask["mask_rle"]),
                    confidence=j_float(mask["confidence"]),
                    is_occluded=_j_bool(mask["is_occluded"]),
                )
                for mask in (j_obj(m) for m in j_list(frame["masks"]))
            ]
            frames.append(
                TrackingFrameDTO(
                    frame_number=_j_int(frame["frame_number"]),
                    timestamp=j_float(frame["timestamp"]),
                    masks=masks,
                    processing_time=j_float(frame["processing_time"]),
                )
            )
        return TrackObjectsResponseDTO(
            id=j_str(comp["id"]),
            video_id=j_str(comp["video_id"]),
            frames=frames,
            video_width=_j_int(comp["video_width"]),
            video_height=_j_int(comp["video_height"]),
            total_frames=_j_int(comp["total_frames"]),
            processing_time=j_float(comp["processing_time"]),
            fps=j_float(comp["fps"]),
        )


def _tracking_record(nsid: str, local_id: str, model: dx.Model) -> FragmentRecord:
    return FragmentRecord(
        local_id=local_id, nsid=nsid, value_json=model.model_dump_json()
    )


TRACKING_LAYERS = TrackingLayersLens()
