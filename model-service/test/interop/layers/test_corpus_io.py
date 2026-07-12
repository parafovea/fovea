"""Corpus IO round-trip tests for the layers codec adapter.

These exercise the ``lairs.data.Corpus`` materialize/load path end to end, beyond
the per-lens projection tests: a small multi-record corpus (an
``expression.Expression`` plus a ``segmentation.Segmentation``, an
``annotation.AnnotationLayer``, a ``ClusterSet``, and a ``Media``) is folded into
a corpus, materialized to Arrow/Parquet views, and read back with structural
equality of the ``pub.layers`` records.

The corpus records come from the ``sample_corpus.jsonl`` fixture, so the fixture
is the load-bearing "small multi-record corpus" under test. The offline read-back
commits the corpus to a local ``lairs`` repository and loads each record by AT-URI
(``Repository.load``); the network-bound ``load_corpus`` path needs a live PDS (or
an injected PDS client) and is covered only by full-stack E2E, not here.

A final case drives :class:`FoveaCodec` over its own external format (a fovea
output envelope, the codec's decode input) and asserts the decoded fragment holds
canonical ``pub.layers`` records: feeding raw records to ``decode`` is the encode
direction, so the envelope, not the fixture, is the codec's decode input.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

pytest.importorskip("lairs")
pytest.importorskip("panproto")

from lairs.records import annotation, expression, media, segmentation
from lairs.store import Repository

from src.application.ports.outbound.layers_codec import (
    NormalizedRecordDTO,
)
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
    local_uri,
)
from src.infrastructure.adapters.outbound.layers.codec import FoveaCodec, _dump
from src.infrastructure.adapters.outbound.layers.corpus_io import (
    _MODEL_BY_NSID,
    _key,
    records_to_corpus,
    save_corpus_repo,
)
from src.infrastructure.adapters.outbound.layers.lairs_codec_adapter import (
    LairsCodecAdapter,
)

from .conftest import make_ctx

_FIXTURE = Path(__file__).parent / "fixtures" / "sample_corpus.jsonl"
_CORPUS_NAME = "sample"
_AUTHORITY = "local"


def _transcription_dto() -> TranscriptionResultDTO:
    """The transcription DTO the ``sample_corpus.jsonl`` fixture is built from."""
    return TranscriptionResultDTO(
        text="Hello there. General Kenobi.",
        segments=[
            TranscriptSegmentDTO(0.0, 1.25, "Hello there.", 0.9, "A"),
            TranscriptSegmentDTO(1.25, 2.5, "General Kenobi.", 0.8, "B"),
        ],
        language="en",
        speaker_count=2,
        processing_time=0.4,
    )


def _fixture_records() -> list[NormalizedRecordDTO]:
    """Load the ``sample_corpus.jsonl`` fixture as normalized records."""
    lines = [line for line in _FIXTURE.read_text().splitlines() if line.strip()]
    return [NormalizedRecordDTO(**json.loads(line)) for line in lines]


def _model_by_local_id(records: list[NormalizedRecordDTO], local_id: str) -> object:
    """Parse a fixture record's ``value_json`` into its ``pub.layers`` model."""
    record = next(r for r in records if r.local_id == local_id)
    return _MODEL_BY_NSID[record.nsid].model_validate_json(record.value_json)


def test_fixture_records_validate_as_layers_models() -> None:
    """Every fixture line is a valid ``pub.layers.*`` record of its NSID."""
    records = _fixture_records()
    assert {r.local_id for r in records} == {
        "expression",
        "segmentation",
        "speakers",
        "clusters",
        "media",
    }
    for record in records:
        assert record.nsid in _MODEL_BY_NSID
        # Raises on an invalid record, so a bad fixture fails loudly.
        _MODEL_BY_NSID[record.nsid].model_validate_json(record.value_json)


def test_records_fold_into_corpus_graph() -> None:
    """Records fold into a corpus with one expression, layer, and segmentation."""
    corpus = records_to_corpus(_fixture_records(), corpus_name=_CORPUS_NAME)

    assert len(list(corpus.expressions)) == 1
    assert len(list(corpus.annotation_layers())) == 1
    assert len(list(corpus.segmentations())) == 1
    assert len(list(corpus.memberships())) == 1
    assert len(list(corpus.media())) == 1
    assert corpus.corpus_record.name == _CORPUS_NAME
    assert corpus.corpus_record.expressionCount == 1


def test_encode_corpus_materializes_view_files(tmp_path: Path) -> None:
    """``encode_corpus`` writes non-empty Arrow/Parquet views for the corpus."""
    out_dir = tmp_path / _CORPUS_NAME
    written = LairsCodecAdapter().encode_corpus(_fixture_records(), out_dir)

    names = {Path(path).name for path in written}
    assert {"expressions.parquet", "annotations.parquet"} <= names
    for path in written:
        resolved = Path(path)
        assert resolved.exists()
        assert resolved.stat().st_size > 0


def test_corpus_records_roundtrip_through_local_repo(tmp_path: Path) -> None:
    """Fold, commit, and read back: the ``pub.layers`` records survive intact.

    Commits the corpus to a local ``lairs`` repository and loads each record back
    by its minted AT-URI, asserting structural equality with the source records.
    This is the offline stand-in for ``load_corpus`` (which needs a live PDS).
    """
    records = _fixture_records()
    corpus = records_to_corpus(records, corpus_name=_CORPUS_NAME, authority=_AUTHORITY)

    repo_path = tmp_path / "repo"
    save_corpus_repo(corpus, repo_path)
    repo = Repository.open(repo_path)

    expr = repo.load(
        local_uri(_AUTHORITY, EXPRESSION_NSID, _key("expression")),
        expression.Expression,
    )
    seg = repo.load(
        local_uri(_AUTHORITY, SEGMENTATION_NSID, _key("segmentation")),
        segmentation.Segmentation,
    )
    layer = repo.load(
        local_uri(_AUTHORITY, ANNOTATION_LAYER_NSID, _key("speakers")),
        annotation.AnnotationLayer,
    )

    assert expr == _model_by_local_id(records, "expression")
    assert seg == _model_by_local_id(records, "segmentation")
    assert layer == _model_by_local_id(records, "speakers")


def test_media_and_cluster_records_survive_the_roundtrip(tmp_path: Path) -> None:
    """Records added verbatim by AT-URI (media, cluster set) also read back."""
    records = _fixture_records()
    corpus = records_to_corpus(records, corpus_name=_CORPUS_NAME, authority=_AUTHORITY)

    repo_path = tmp_path / "repo"
    save_corpus_repo(corpus, repo_path)
    repo = Repository.open(repo_path)

    loaded_media = repo.load(
        local_uri(_AUTHORITY, MEDIA_NSID, _key("media")),
        media.Media,
    )
    loaded_clusters = repo.load(
        local_uri(_AUTHORITY, CLUSTERSET_NSID, _key("clusters")),
        annotation.ClusterSet,
    )

    assert loaded_media == _model_by_local_id(records, "media")
    assert loaded_clusters == _model_by_local_id(records, "clusters")


def test_fovea_codec_decodes_envelope_to_layers_records() -> None:
    """:class:`FoveaCodec` decodes its envelope into canonical layers records.

    The codec's external format is a fovea output envelope, not raw records, so
    this feeds a serialized envelope (the decode input) and asserts the fragment
    holds validating ``pub.layers`` records tagged ``fovea``.
    """
    document = json.dumps(
        {"kind": "transcription", "source": _dump(_transcription_dto())}
    )

    fragment = FoveaCodec().decode(document)

    assert fragment.source == "fovea"
    by_id = {record.local_id: record for record in fragment.records}
    expression.Expression.model_validate_json(by_id["expression"].value_json)
    segmentation.Segmentation.model_validate_json(by_id["segmentation"].value_json)
    annotation.AnnotationLayer.model_validate_json(by_id["speakers"].value_json)


def test_adapter_and_fixture_agree() -> None:
    """The fixture is what the adapter's lens emits for the same input.

    Guards the fixture against drift: regenerating the transcript projection must
    reproduce the fixture's records (same NSIDs and value JSON).
    """
    ctx = make_ctx(video_id="sample-clip", tool="fovea-interop-fixture")
    emitted_records = LairsCodecAdapter().encode_transcription(
        _transcription_dto(), ctx
    ).records

    emitted = {(r.nsid, r.value_json) for r in emitted_records}
    fixture = {(r.nsid, r.value_json) for r in _fixture_records()}
    assert emitted == fixture
