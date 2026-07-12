"""A no-op :class:`ILayersCodec` for environments without the ``lairs`` stack.

The layers codec depends on ``lairs`` / ``didactic``, which live only in the codec
virtualenv. When those are absent, the container binds :class:`NullLayersCodec` so
the application still starts; every method raises a clear :class:`RuntimeError`,
letting the HTTP layer answer ``501 Not Implemented`` rather than crash on import.

This module is deliberately lairs-free: it imports only the framework-neutral port.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, NoReturn

from src.application.ports.outbound.layers_codec import ILayersCodec

if TYPE_CHECKING:
    from collections.abc import Sequence
    from pathlib import Path

    from src.application.dto.claims import ExtractedClaimDTO
    from src.application.dto.detection import DetectObjectsResponseDTO
    from src.application.dto.ontology import OntologyTypeDTO
    from src.application.dto.summarization import SummarizeResponseDTO
    from src.application.dto.tracking import TrackObjectsResponseDTO
    from src.application.ports.outbound.layers_codec import (
        EmitContext,
        NormalizedFragmentDTO,
        NormalizedRecordDTO,
    )
    from src.application.ports.outbound.transcriber import TranscriptionResultDTO

_MESSAGE = (
    "The layers codec is unavailable: the 'lairs' / 'didactic' stack is not "
    "installed in this environment. Install the codec extras (the codec "
    "virtualenv) to enable layers import/export."
)


def _unavailable() -> NoReturn:
    raise RuntimeError(_MESSAGE)


class NullLayersCodec(ILayersCodec):
    """A stand-in codec that reports the layers stack is unavailable."""

    def encode_transcription(
        self, dto: TranscriptionResultDTO, ctx: EmitContext
    ) -> NormalizedFragmentDTO:
        """Raise: the layers stack is unavailable."""
        _unavailable()

    def encode_detection(
        self, dto: DetectObjectsResponseDTO, ctx: EmitContext
    ) -> NormalizedFragmentDTO:
        """Raise: the layers stack is unavailable."""
        _unavailable()

    def encode_tracking(
        self, dto: TrackObjectsResponseDTO, ctx: EmitContext
    ) -> NormalizedFragmentDTO:
        """Raise: the layers stack is unavailable."""
        _unavailable()

    def encode_summary(
        self, dto: SummarizeResponseDTO, ctx: EmitContext
    ) -> NormalizedFragmentDTO:
        """Raise: the layers stack is unavailable."""
        _unavailable()

    def encode_claims(
        self, dto: ExtractedClaimDTO, ctx: EmitContext
    ) -> NormalizedFragmentDTO:
        """Raise: the layers stack is unavailable."""
        _unavailable()

    def encode_ontology(
        self, dtos: Sequence[OntologyTypeDTO], ctx: EmitContext
    ) -> NormalizedFragmentDTO:
        """Raise: the layers stack is unavailable."""
        _unavailable()

    def decode(self, src: str | bytes, fmt: str) -> NormalizedFragmentDTO:
        """Raise: the layers stack is unavailable."""
        _unavailable()

    def encode_corpus(
        self, records: Sequence[NormalizedRecordDTO], out_dir: Path
    ) -> list[str]:
        """Raise: the layers stack is unavailable."""
        _unavailable()
