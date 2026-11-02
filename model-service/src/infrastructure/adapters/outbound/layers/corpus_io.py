"""Build and materialize a layers ``Corpus`` from normalized fovea records.

These are thin wrappers over :class:`lairs.data.Corpus`: :func:`records_to_corpus`
folds a flat list of normalized records (each a ``(local_id, nsid, value_json)``
triple, as a lens fragment or the codec produces) into a corpus graph — adding
expressions with a membership each, annotation layers, and every other record by
minted AT-URI — and :func:`materialize_corpus` / :func:`save_corpus_repo` delegate
to the corresponding ``lairs`` store entry points. The network-bound publish path
is imported lazily and defaults to a dry run, so importing this module never pulls
the publish stack and no live PDS is required.

This module MAY import ``lairs``; the application layer never imports it directly
(it depends on the lairs-free port instead).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, cast

from lairs.data import Corpus, load_corpus
from lairs.records import annotation, expression, graph, media, ontology, segmentation
from lairs.records import corpus as corpus_records

from src.infrastructure.adapters.outbound.layers._convert import (
    ANNOTATION_LAYER_NSID,
    CLUSTERSET_NSID,
    CORPUS_NSID,
    EXPRESSION_NSID,
    GRAPH_EDGESET_NSID,
    GRAPH_NODE_NSID,
    MEDIA_NSID,
    MEMBERSHIP_NSID,
    ONTOLOGY_NSID,
    SEGMENTATION_NSID,
    TYPEDEF_NSID,
    local_uri,
)

if TYPE_CHECKING:
    from collections.abc import Sequence
    from pathlib import Path

    import didactic.api as dx
    import httpx
    from lairs.store import Repository

    from src.application.ports.outbound.layers_codec import NormalizedRecordDTO

# The record model each emitted collection NSID validates into. Expressions and
# annotation layers take dedicated corpus entry points; the rest are added by
# AT-URI so ``save_to_repo`` preserves them.
_MODEL_BY_NSID: dict[str, type[dx.Model]] = {
    EXPRESSION_NSID: expression.Expression,
    SEGMENTATION_NSID: segmentation.Segmentation,
    ANNOTATION_LAYER_NSID: annotation.AnnotationLayer,
    MEDIA_NSID: media.Media,
    CLUSTERSET_NSID: annotation.ClusterSet,
    GRAPH_NODE_NSID: graph.GraphNode,
    GRAPH_EDGESET_NSID: graph.GraphEdgeSet,
    ONTOLOGY_NSID: ontology.Ontology,
    TYPEDEF_NSID: ontology.TypeDef,
}

_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


def _key(local_id: str) -> str:
    """Sanitize a fragment-local id into an AT-URI record key."""
    return local_id.replace(":", "-").replace("/", "-")


def _parse(nsid: str, value_json: str) -> dx.Model:
    """Validate a record's JSON into the record model its NSID names."""
    return _MODEL_BY_NSID[nsid].model_validate_json(value_json)


def records_to_corpus(
    records: Sequence[NormalizedRecordDTO],
    *,
    corpus_name: str,
    authority: str = "local",
) -> Corpus:
    """Fold normalized fovea records into a layers corpus.

    Each expression record becomes a corpus expression with a membership; each
    annotation-layer record becomes an annotation layer; every other record
    (segmentation, media, ontology, graph, cluster) is added verbatim by minted
    AT-URI. A single corpus record describes the resulting dataset.
    """
    corpus_uri = local_uri(authority, CORPUS_NSID, corpus_name)
    corpus = Corpus.new(corpus_uri)

    ordinal = 0
    corpus_created_at = _EPOCH
    for record in records:
        uri = local_uri(authority, record.nsid, _key(record.local_id))
        model = _parse(record.nsid, record.value_json)
        if record.nsid == EXPRESSION_NSID:
            # The NSID discriminator fixes the concrete parsed model type, which
            # the string-keyed dispatch hides from the checker.
            expr = cast("expression.Expression", model)
            corpus.add_expression(uri, expr)
            corpus.add_membership(
                local_uri(authority, MEMBERSHIP_NSID, _key(record.local_id)),
                corpus_records.Membership(
                    corpusRef=corpus_uri,
                    expressionRef=uri,
                    createdAt=expr.createdAt,
                    ordinal=ordinal,
                ),
            )
            if ordinal == 0:
                corpus_created_at = expr.createdAt
            ordinal += 1
        elif record.nsid == ANNOTATION_LAYER_NSID:
            corpus.add_annotation_layer(uri, cast("annotation.AnnotationLayer", model))
        else:
            corpus.add_record(uri, model)

    corpus.add_record(
        corpus_uri,
        corpus_records.Corpus(
            name=corpus_name,
            createdAt=corpus_created_at,
            expressionCount=ordinal,
        ),
    )
    return corpus


def materialize_corpus(corpus: Corpus, out_dir: Path) -> list[Path]:
    """Materialize a corpus to Arrow/Parquet views (delegates to ``lairs``)."""
    return corpus.materialize(out_dir)


def save_corpus_repo(corpus: Corpus, path: Path) -> str:
    """Commit a corpus to a local lairs repository and return the revision."""
    return corpus.save_to_repo(path)


def load_layers_corpus(uri: str, *, source: str = "pds") -> Corpus:
    """Load a layers corpus by AT-URI (a thin wrapper over ``lairs.load_corpus``)."""
    return load_corpus(uri, source=source)


def publish_corpus(
    repo: Repository,
    revision: str,
    *,
    to: str,
    endpoint: str | None = None,
    client: httpx.Client | None = None,
    dry_run: bool = True,
) -> object:
    """Publish a committed corpus revision to a PDS (opt-in; default dry run).

    The network-bound publish entry point is imported lazily so importing this
    module never pulls the publish stack; ``endpoint`` (PDS base URL) and
    ``client`` (an authorized ``httpx.Client``) are required for an actual write.
    """
    from lairs.author import publish as publish_module  # noqa: PLC0415

    return publish_module.publish(
        repo, revision, to=to, endpoint=endpoint, client=client, dry_run=dry_run
    )
