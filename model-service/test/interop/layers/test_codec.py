"""Round-trip law tests for the fovea layers codec.

The codec is exercised end to end: for each output kind a lens fragment (view
records plus a stashed complement record) is built, then ``encode``/``decode`` are
checked to invert each other — ``decode(encode(records)) == records`` (PutGet) and
``encode(decode(x)) == x`` (GetPut) — with the codec running the lens in both
directions.
"""

from __future__ import annotations

import json

import pytest

pytest.importorskip("lairs")
pytest.importorskip("panproto")

from datetime import UTC, datetime

from lairs.integrations.codecs import FragmentRecord
from lairs.integrations.ports import Codec

from src.application.dto.claims import (
    ClaimRelationshipDTO,
    ClaimsResultDTO,
    ExtractedClaimDTO,
)
from src.application.dto.detection import (
    BoundingBoxDTO,
    DetectionDTO,
    DetectObjectsResponseDTO,
    FrameDetectionsDTO,
)
from src.application.dto.ontology import OntologyTypeDTO
from src.application.dto.reasoning import ThinkingStep, ThinkingTrace
from src.application.dto.summarization import (
    KeyFrameDTO,
    SummarizeResponseDTO,
)
from src.application.dto.tracking import (
    TrackingFrameDTO,
    TrackingMaskDTO,
    TrackObjectsResponseDTO,
)
from src.application.ports.outbound.transcriber import (
    TranscriptionResultDTO,
    TranscriptSegmentDTO,
)
from src.infrastructure.adapters.outbound.layers._convert import (
    COMPLEMENT_NSID,
)
from src.infrastructure.adapters.outbound.layers.codec import (
    FoveaCodec,
    _dump,
    _lens_for,
    _lens_input,
)

from .conftest import make_ctx

_CTX = make_ctx(video_id="clip-7")


def _transcription() -> tuple[str, object]:
    dto = TranscriptionResultDTO(
        text="Hello there. General Kenobi.",
        segments=[
            TranscriptSegmentDTO(0.0, 1.25, "Hello there.", 0.9, "A"),
            TranscriptSegmentDTO(1.25, 2.5, "General Kenobi.", 0.8, "B"),
        ],
        language="en",
        speaker_count=2,
        processing_time=0.4321,
    )
    return "transcription", dto


def _detection() -> tuple[str, object]:
    dto = DetectObjectsResponseDTO(
        id="det-1",
        video_id="clip-7",
        query="person",
        frames=[
            FrameDetectionsDTO(
                frame_number=0,
                timestamp=0.5,
                detections=[
                    DetectionDTO(
                        label="person",
                        bounding_box=BoundingBoxDTO(0.1, 0.2, 0.3, 0.4),
                        confidence=0.87,
                        track_id="t1",
                    )
                ],
            )
        ],
        total_detections=1,
        processing_time=0.12,
        video_width=1920,
        video_height=1080,
    )
    return "detection", dto


def _tracking() -> tuple[str, object]:
    dto = TrackObjectsResponseDTO(
        id="trk-1",
        video_id="clip-7",
        frames=[
            TrackingFrameDTO(
                frame_number=0,
                timestamp=0.0,
                masks=[
                    TrackingMaskDTO(
                        object_id=1,
                        mask_rle={"size": [1080, 1920], "counts": "abc123"},
                        confidence=0.75,
                        is_occluded=False,
                    )
                ],
                processing_time=0.03,
            )
        ],
        video_width=1920,
        video_height=1080,
        total_frames=1,
        processing_time=0.3,
        fps=30.0,
    )
    return "tracking", dto


def _summary() -> tuple[str, object]:
    dto = SummarizeResponseDTO(
        id="sum-1",
        video_id="clip-7",
        persona_id="analyst",
        summary="A person walks across the frame.",
        visual_analysis="Detailed visual analysis.",
        key_frames=[
            KeyFrameDTO(frame_number=3, timestamp=1.5, description="entry", confidence=0.6),
        ],
        confidence=0.82,
        visual_model_used="qwen2-vl",
    )
    return "summary", dto


def _claims() -> tuple[str, object]:
    dto = ClaimsResultDTO(
        text="The sky is blue. Water is wet.",
        claims=[
            ExtractedClaimDTO(
                text="The sky is blue.",
                confidence=0.9,
                sentence_index=0,
                char_start=0,
                char_end=16,
                subclaims=[
                    ExtractedClaimDTO(text="blue", confidence=0.8, char_start=12, char_end=16)
                ],
                claim_type="observation",
                reasoning_trace=ThinkingTrace(
                    steps=[ThinkingStep(content="think", tokens_used=3)],
                    total_tokens=3,
                    model_id="r1",
                ),
            ),
            ExtractedClaimDTO(text="Water is wet.", confidence=0.7),
        ],
        relationships=[
            ClaimRelationshipDTO(
                source_claim_id="claim-0",
                target_claim_id="claim-2",
                relation_type="supports",
                confidence=0.6,
                notes="n",
            )
        ],
    )
    return "claims", dto


def _ontology() -> tuple[str, object]:
    types = (
        OntologyTypeDTO(
            name="Vehicle",
            description="A means of transport.",
            parent=None,
            confidence=0.9,
            examples=["car", "truck"],
            reasoning_trace=ThinkingTrace(
                steps=[ThinkingStep(content="reason", tokens_used=None)],
                total_tokens=None,
                model_id="r1",
            ),
        ),
        OntologyTypeDTO(name="Car", description="A car.", parent="Vehicle", confidence=0.8),
    )
    return "ontology", {"types": list(types), "ctx": _CTX}


_CASES = [
    _transcription,
    _detection,
    _tracking,
    _summary,
    _claims,
    _ontology,
]
_IDS = ["transcription", "detection", "tracking", "summary", "claims", "ontology"]


def _records_for(kind: str, source_for_dump: object) -> tuple[FragmentRecord, ...]:
    """Build a lens fragment (view records + stashed complement) for ``kind``."""
    lens = _lens_for(kind)
    if kind == "ontology":
        assert isinstance(source_for_dump, dict)
        lens_in = _lens_input(
            kind, {"types": source_for_dump["types"], "ctx": source_for_dump["ctx"]}
        )
    else:
        lens_in = source_for_dump
    view, complement = lens.forward(lens_in)
    complement_record = FragmentRecord(
        local_id="complement",
        nsid=COMPLEMENT_NSID,
        value_json=json.dumps({"kind": kind, "complement": complement}),
    )
    return (*view.records, complement_record)


def test_name_is_fovea() -> None:
    assert FoveaCodec().name == "fovea"


def test_is_a_lairs_codec() -> None:
    assert isinstance(FoveaCodec(), Codec)


@pytest.mark.parametrize("case", _CASES, ids=_IDS)
def test_decode_encode_roundtrip_records(case) -> None:
    """``decode(encode(records)) == records`` (PutGet through the codec)."""
    kind, source = case()
    codec = FoveaCodec()
    records = _records_for(kind, source)

    encoded = codec.encode(records)
    assert isinstance(encoded, str)
    decoded = codec.decode(encoded)
    assert decoded.records == records
    assert decoded.source == "fovea"


@pytest.mark.parametrize("case", _CASES, ids=_IDS)
def test_encode_decode_roundtrip_document(case) -> None:
    """``encode(decode(x)) == x`` (GetPut through the codec)."""
    kind, source = case()
    codec = FoveaCodec()
    document = json.dumps({"kind": kind, "source": _dump(source)})

    fragment = codec.decode(document)
    assert codec.encode(fragment.records) == document


@pytest.mark.parametrize("case", _CASES, ids=_IDS)
def test_complement_stashed_under_private_nsid(case) -> None:
    kind, source = case()
    records = _records_for(kind, source)
    complements = [r for r in records if r.nsid == COMPLEMENT_NSID]
    assert len(complements) == 1
    payload = json.loads(complements[0].value_json)
    assert payload["kind"] == kind


def test_decode_accepts_bytes() -> None:
    kind, source = _transcription()
    codec = FoveaCodec()
    document = json.dumps({"kind": kind, "source": _dump(source)})
    from_str = codec.decode(document)
    from_bytes = codec.decode(document.encode("utf-8"))
    assert from_bytes.records == from_str.records


def test_decode_into_extends_existing_fragment() -> None:
    kind, source = _transcription()
    codec = FoveaCodec()
    seed = codec.decode(json.dumps({"kind": kind, "source": _dump(source)}))
    extended = codec.decode(json.dumps({"kind": kind, "source": _dump(source)}), into=seed)
    assert len(extended.records) == 2 * len(seed.records)


def test_datetime_survives_the_generic_codec() -> None:
    from src.infrastructure.adapters.outbound.layers.codec import _load

    stamp = datetime(2026, 3, 4, 5, 6, 7, tzinfo=UTC)
    assert _load(_dump(stamp)) == stamp
