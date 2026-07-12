"""Outbound port for the layers codec.

Framework-neutral contract for projecting model-service outputs into canonical
``pub.layers.*`` records and reading them back. This module is deliberately
*lairs-free*: it imports neither ``lairs`` nor ``didactic``, so the application
layer can depend on it without pulling the record-model stack. The concrete
adapter under ``infrastructure/adapters/outbound/layers`` binds it to
``lairs.integrations.ports.Codec``.

The port speaks in normalized DTOs — :class:`NormalizedRecordDTO` and
:class:`NormalizedFragmentDTO` — that mirror the shape of a
``lairs.integrations.codecs.CorpusFragment`` (a tuple of ``(local_id, nsid,
value_json)`` records plus an optional source) without importing it. Each
``encode_*`` method takes an application DTO and an :class:`EmitContext` (the
provenance every emitted record carries) and returns a fragment.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Sequence
    from datetime import datetime
    from pathlib import Path

    from src.application.dto.claims import ExtractedClaimDTO
    from src.application.dto.detection import DetectObjectsResponseDTO
    from src.application.dto.ontology import OntologyTypeDTO
    from src.application.dto.summarization import SummarizeResponseDTO
    from src.application.dto.tracking import TrackObjectsResponseDTO
    from src.application.ports.outbound.transcriber import TranscriptionResultDTO


@dataclass(frozen=True)
class NormalizedRecordDTO:
    """A single normalized layers record, framework-neutral.

    Mirrors ``lairs.integrations.codecs.FragmentRecord`` without importing it.

    Parameters
    ----------
    local_id : str
        Fragment-local identifier for the record.
    nsid : str
        The record's canonical ``pub.layers.*`` namespace id.
    value_json : str
        The record model serialized as a JSON string.
    """

    local_id: str
    nsid: str
    value_json: str


@dataclass(frozen=True)
class NormalizedFragmentDTO:
    """A normalized layers corpus fragment, framework-neutral.

    Mirrors ``lairs.integrations.codecs.CorpusFragment`` without importing it.

    Parameters
    ----------
    records : tuple[NormalizedRecordDTO, ...]
        The fragment's records, in emission order.
    source : str | None
        Optional source label for the fragment.
    """

    records: tuple[NormalizedRecordDTO, ...]
    source: str | None = None


@dataclass(frozen=True)
class EmitContext:
    """Provenance every emitted layers record carries.

    Parameters
    ----------
    video_id : str
        Identifier of the video the records describe.
    created_at : datetime
        Creation timestamp stamped onto emitted records.
    tool : str
        Name of the tool/model that produced the annotations.
    agent_id : str | None
        Optional identifier of the producing agent.
    persona_ref : str | None
        Optional AT-URI of a ``pub.layers.persona`` describing the agent.
    authority : str
        Authority segment used when minting AT-URIs (defaults to ``"local"``).
    """

    video_id: str
    created_at: datetime
    tool: str
    agent_id: str | None = None
    persona_ref: str | None = None
    authority: str = "local"


class ILayersCodec(ABC):
    """Port for projecting model-service outputs to layers records and back."""

    @abstractmethod
    def encode_transcription(
        self, dto: TranscriptionResultDTO, ctx: EmitContext
    ) -> NormalizedFragmentDTO:
        """Project a transcription result to a layers fragment."""

    @abstractmethod
    def encode_detection(
        self, dto: DetectObjectsResponseDTO, ctx: EmitContext
    ) -> NormalizedFragmentDTO:
        """Project an object-detection result to a layers fragment."""

    @abstractmethod
    def encode_tracking(
        self, dto: TrackObjectsResponseDTO, ctx: EmitContext
    ) -> NormalizedFragmentDTO:
        """Project an object-tracking result to a layers fragment."""

    @abstractmethod
    def encode_summary(
        self, dto: SummarizeResponseDTO, ctx: EmitContext
    ) -> NormalizedFragmentDTO:
        """Project a video summary to a layers fragment."""

    @abstractmethod
    def encode_claims(
        self, dto: ExtractedClaimDTO, ctx: EmitContext
    ) -> NormalizedFragmentDTO:
        """Project an extracted claim (with subclaims) to a layers fragment."""

    @abstractmethod
    def encode_ontology(
        self, dtos: Sequence[OntologyTypeDTO], ctx: EmitContext
    ) -> NormalizedFragmentDTO:
        """Project suggested ontology types to a layers fragment."""

    @abstractmethod
    def decode(self, src: str | bytes, fmt: str) -> NormalizedFragmentDTO:
        """Decode a serialized document of format ``fmt`` into a fragment."""

    @abstractmethod
    def encode_corpus(
        self, records: Sequence[NormalizedRecordDTO], out_dir: Path
    ) -> list[str]:
        """Materialize records as a layers corpus under ``out_dir``.

        Returns the paths written, as strings.
        """
