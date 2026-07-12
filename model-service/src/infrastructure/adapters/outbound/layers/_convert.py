"""Shared, reversible conversions between fovea values and ``lairs`` models.

These helpers centralize the mechanical conversions every layers lens relies on.
Two sinks are served:

- the layers *view*, built from the canonical ``lairs.records`` models, uses the
  typed :func:`feature_map` / :func:`object_ref` builders and the integer scale
  helpers (layers puts no floats on the wire).
- the lens *complement*, a plain :data:`JsonValue`, carries the fovea-only
  remainder (the exact source floats and dropped fields the lossy integer view
  cannot represent) via :func:`dumps_meta` and the ``j_*`` narrowers.

This module MAY import ``lairs`` / ``didactic``; the application layer never
imports it directly (it depends on the lairs-free port instead).
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import TYPE_CHECKING

from lairs.integrations.codecs import FragmentRecord
from lairs.records import defs

if TYPE_CHECKING:
    import didactic.api as dx

# A plain JSON value: what a lens complement and a serialized record are made of.
type JsonValue = (
    str | int | float | bool | None | list["JsonValue"] | dict[str, "JsonValue"]
)

# --- integer scales (layers puts no floats on the wire) ---------------------

# layers scales confidence to an integer 0-1000.
CONFIDENCE_SCALE = 1000
# layers scales seconds to integer milliseconds.
MS_SCALE = 1000

# --- canonical layers collection NSIDs --------------------------------------
# Used both as fragment record NSIDs and as the collection segment of minted
# corpus AT-URIs. Confirmed against ``lairs`` (tui/registry.py, data/corpus.py).

EXPRESSION_NSID = "pub.layers.expression.expression"
SEGMENTATION_NSID = "pub.layers.segmentation.segmentation"
ANNOTATION_LAYER_NSID = "pub.layers.annotation.annotationLayer"
MEDIA_NSID = "pub.layers.media.media"
CLUSTERSET_NSID = "pub.layers.annotation.clusterSet"
GRAPH_NODE_NSID = "pub.layers.graph.graphNode"
GRAPH_EDGESET_NSID = "pub.layers.graph.graphEdgeSet"
ONTOLOGY_NSID = "pub.layers.ontology.ontology"
TYPEDEF_NSID = "pub.layers.ontology.typeDef"
CORPUS_NSID = "pub.layers.corpus.corpus"
MEMBERSHIP_NSID = "pub.layers.corpus.membership"

# The private NSID under which the codec stashes lens complements so
# ``encode(decode(x)) == x`` holds; a layers consumer ignores unknown NSIDs.
COMPLEMENT_NSID = "fovea.interop.complement"


# --- integer scale helpers (lossy view <-> exact complement) ----------------


def conf_to_int(confidence: float) -> int:
    """Scale a ``0.0..1.0`` confidence to a layers integer in ``[0, 1000]``.

    Lossy: the exact source float belongs in the lens complement.
    """
    return max(0, min(CONFIDENCE_SCALE, round(confidence * CONFIDENCE_SCALE)))


def conf_from_int(value: int) -> float:
    """Scale a layers integer confidence back to a ``0.0..1.0`` float."""
    return value / CONFIDENCE_SCALE


def sec_to_ms(seconds: float) -> int:
    """Scale seconds to integer milliseconds.

    Lossy: the exact source float belongs in the lens complement.
    """
    return round(seconds * MS_SCALE)


def ms_to_sec(milliseconds: int) -> float:
    """Scale integer milliseconds back to seconds."""
    return milliseconds / MS_SCALE


def norm_bbox_to_px(
    x: float,
    y: float,
    width: float,
    height: float,
    frame_width: int,
    frame_height: int,
) -> defs.BoundingBox:
    """Convert a normalized ``0.0..1.0`` bbox to a pixel :class:`defs.BoundingBox`.

    ``width`` and ``height`` are clamped to a minimum of 1 pixel (the layers
    schema requires it). Lossy: the exact source floats and frame dimensions
    belong in the lens complement.
    """
    return defs.BoundingBox(
        x=round(x * frame_width),
        y=round(y * frame_height),
        width=max(1, round(width * frame_width)),
        height=max(1, round(height * frame_height)),
    )


# --- typed feature maps (the layers view) -----------------------------------


def feature_map(features: Mapping[str, JsonValue]) -> defs.FeatureMap | None:
    """Build a layers ``featureMap`` model, or ``None`` for an empty mapping.

    Each value is serialized with ``json.dumps`` so arbitrary (including
    non-string) values round-trip exactly via :func:`read_feature_map`. Entries
    preserve the mapping's iteration order so the round-trip is exact. An empty
    mapping projects to ``None`` (a faithful layers view omits empty optionals).
    """
    if not features:
        return None
    return defs.FeatureMap(
        entries=tuple(
            defs.Feature(key=key, value=json.dumps(features[key])) for key in features
        )
    )


def read_feature_map(fm: defs.FeatureMap | None) -> dict[str, JsonValue]:
    """Decode a layers ``featureMap`` model back into a feature dict."""
    if fm is None:
        return {}
    return {entry.key: json.loads(entry.value) for entry in fm.entries}


# --- typed object references (the layers view) ------------------------------


def object_ref(local_id: str) -> defs.ObjectRef:
    """Build a layers ``objectRef`` to a local object by id."""
    return defs.ObjectRef(localId=defs.Uuid(value=local_id))


# --- AT-URI minting ---------------------------------------------------------


def local_uri(authority: str, nsid: str, key: str) -> str:
    """Mint a layers AT-URI ``at://{authority}/{nsid}/{key}``."""
    return f"at://{authority}/{nsid}/{key}"


# --- metadata dicts in the lens complement (JsonValue) ----------------------


def dumps_meta(mapping: Mapping[str, JsonValue]) -> str:
    """Encode a metadata dict as a JSON string for a lens complement.

    Serializing to a JSON string keeps the complement a plain :data:`JsonValue`
    and round-trips exactly through :func:`loads_meta`. Key insertion order is
    preserved so the reconstructed dict compares equal to the original (didactic
    compares dict fields order-sensitively).
    """
    return json.dumps(dict(mapping))


def loads_meta(value: JsonValue) -> dict[str, JsonValue]:
    """Decode a :func:`dumps_meta` string back into a metadata dict."""
    loaded = json.loads(j_str(value))
    if not isinstance(loaded, dict):
        return {}
    return {str(key): val for key, val in loaded.items()}


# --- record building --------------------------------------------------------


def _record(nsid: str, local_id: str, model: dx.Model) -> FragmentRecord:
    """Build a :class:`FragmentRecord` from a serialized ``lairs`` model."""
    return FragmentRecord(
        local_id=local_id, nsid=nsid, value_json=model.model_dump_json()
    )


# --- JsonValue narrowers (for reading complements) --------------------------


def j_obj(value: JsonValue) -> dict[str, JsonValue]:
    """Narrow a :data:`JsonValue` to a JSON object, raising otherwise."""
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object, got {type(value).__name__}")
    return value


def j_list(value: JsonValue) -> tuple[JsonValue, ...]:
    """Narrow a :data:`JsonValue` to a JSON array, raising otherwise.

    Accepts both tuples (in-process complements) and lists (complements that have
    round-tripped through JSON, as in the codec), normalizing to a tuple.
    """
    if isinstance(value, (tuple, list)):
        return tuple(value)
    raise ValueError(f"expected JSON array, got {type(value).__name__}")


def j_str(value: JsonValue) -> str:
    """Narrow a :data:`JsonValue` to a string, raising otherwise."""
    if not isinstance(value, str):
        raise ValueError(f"expected str, got {type(value).__name__}")
    return value


def j_float(value: JsonValue) -> float:
    """Narrow a :data:`JsonValue` to a float, raising otherwise.

    Accepts ``int`` (but not ``bool``) and returns it as a ``float``.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"expected number, got {type(value).__name__}")
    return float(value)
