"""Bind the lairs-free :class:`ILayersCodec` port to the canonical lenses.

:class:`LairsCodecAdapter` implements each ``encode_*`` by running the matching
lens's :meth:`forward` and mapping the resulting
:class:`lairs.integrations.codecs.CorpusFragment` records to the port's normalized
DTOs; :meth:`decode` delegates to :class:`~src.infrastructure.adapters.outbound.\
layers.codec.FoveaCodec`, and :meth:`encode_corpus` builds and materializes a
``lairs`` corpus via :mod:`~src.infrastructure.adapters.outbound.layers.corpus_io`.

Importing this module requires the ``lairs`` / ``didactic`` stack; the container
guards the import and falls back to
:class:`~src.infrastructure.adapters.outbound.layers.null_codec.NullLayersCodec`
when the stack is absent.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from src.application.dto.claims import ClaimsResultDTO
from src.application.ports.outbound.layers_codec import (
    ILayersCodec,
    NormalizedFragmentDTO,
    NormalizedRecordDTO,
)
from src.infrastructure.adapters.outbound.layers.codec import FoveaCodec
from src.infrastructure.adapters.outbound.layers.corpus_io import (
    materialize_corpus,
    records_to_corpus,
)
from src.infrastructure.adapters.outbound.layers.lenses import (
    DETECTION_LAYERS,
    ONTOLOGY_LAYERS,
    TRACKING_LAYERS,
    ClaimsLayersLens,
    SummaryLayersLens,
    TranscriptLayersLens,
)

if TYPE_CHECKING:
    from collections.abc import Sequence
    from pathlib import Path

    from lairs.integrations.codecs import CorpusFragment

    from src.application.dto.detection import DetectObjectsResponseDTO
    from src.application.dto.ontology import OntologyTypeDTO
    from src.application.dto.summarization import SummarizeResponseDTO
    from src.application.dto.tracking import TrackObjectsResponseDTO
    from src.application.ports.outbound.layers_codec import (
        EmitContext,
        ExtractedClaimDTO,
    )
    from src.application.ports.outbound.transcriber import TranscriptionResultDTO


def _to_fragment_dto(fragment: CorpusFragment) -> NormalizedFragmentDTO:
    """Map a lairs corpus fragment to the port's normalized fragment DTO."""
    return NormalizedFragmentDTO(
        records=tuple(
            NormalizedRecordDTO(
                local_id=record.local_id,
                nsid=record.nsid,
                value_json=record.value_json,
            )
            for record in fragment.records
        ),
        source=fragment.source,
    )


class LairsCodecAdapter(ILayersCodec):
    """Concrete :class:`ILayersCodec` backed by the canonical lairs lenses."""

    def __init__(self) -> None:
        self._codec = FoveaCodec()

    def encode_transcription(
        self, dto: TranscriptionResultDTO, ctx: EmitContext
    ) -> NormalizedFragmentDTO:
        """Project a transcription result to a normalized layers fragment."""
        view, _complement = TranscriptLayersLens(ctx).forward(dto)
        return _to_fragment_dto(view)

    def encode_detection(
        self, dto: DetectObjectsResponseDTO, ctx: EmitContext
    ) -> NormalizedFragmentDTO:
        """Project a detection result to a normalized layers fragment."""
        view, _complement = DETECTION_LAYERS.forward(dto)
        return _to_fragment_dto(view)

    def encode_tracking(
        self, dto: TrackObjectsResponseDTO, ctx: EmitContext
    ) -> NormalizedFragmentDTO:
        """Project a tracking result to a normalized layers fragment."""
        view, _complement = TRACKING_LAYERS.forward(dto)
        return _to_fragment_dto(view)

    def encode_summary(
        self, dto: SummarizeResponseDTO, ctx: EmitContext
    ) -> NormalizedFragmentDTO:
        """Project a video summary to a normalized layers fragment."""
        view, _complement = SummaryLayersLens(ctx).forward(dto)
        return _to_fragment_dto(view)

    def encode_claims(
        self, dto: ExtractedClaimDTO, ctx: EmitContext
    ) -> NormalizedFragmentDTO:
        """Project one claim tree (subclaims nested) to a normalized fragment."""
        result = ClaimsResultDTO(text=dto.text, claims=[dto])
        view, _complement = ClaimsLayersLens().forward(result)
        return _to_fragment_dto(view)

    def encode_ontology(
        self, dtos: Sequence[OntologyTypeDTO], ctx: EmitContext
    ) -> NormalizedFragmentDTO:
        """Project suggested ontology types to a normalized layers fragment."""
        view, _complement = ONTOLOGY_LAYERS.forward((tuple(dtos), ctx))
        return _to_fragment_dto(view)

    def decode(self, src: str | bytes, fmt: str) -> NormalizedFragmentDTO:
        """Decode a serialized fovea envelope into a normalized fragment."""
        if fmt not in ("fovea", "json"):
            raise ValueError(f"unsupported layers decode format: {fmt!r}")
        return _to_fragment_dto(self._codec.decode(src))

    def encode_corpus(
        self, records: Sequence[NormalizedRecordDTO], out_dir: Path
    ) -> list[str]:
        """Materialize records as a layers corpus under ``out_dir``."""
        corpus = records_to_corpus(records, corpus_name=out_dir.name or "fovea")
        return [str(path) for path in materialize_corpus(corpus, out_dir)]
