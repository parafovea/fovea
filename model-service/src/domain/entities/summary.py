"""Video summary domain entities.

This module defines entities for representing video summaries, key frames,
extracted claims, and claim synthesis results.
"""

from dataclasses import dataclass, field
from typing import Any

from src.domain.value_objects import ConfidenceScore, Timestamp


@dataclass
class KeyFrame:
    """A key frame identified during video analysis.

    Parameters
    ----------
    frame_number : int
        Frame index in the video.
    timestamp : Timestamp
        Time position in the video.
    description : str
        AI-generated description of the frame.
    confidence : ConfidenceScore
        Confidence in the description.
    """

    frame_number: int
    timestamp: Timestamp
    description: str
    confidence: ConfidenceScore

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation.

        Returns
        -------
        dict[str, Any]
            Dictionary representation.
        """
        return {
            "frame_number": self.frame_number,
            "timestamp": self.timestamp.seconds,
            "description": self.description,
            "confidence": self.confidence.value,
        }


@dataclass
class TranscriptSegment:
    """A segment of audio transcript.

    Parameters
    ----------
    text : str
        Transcribed text.
    start : Timestamp
        Segment start time.
    end : Timestamp
        Segment end time.
    speaker : str | None
        Speaker identifier if diarization enabled.
    confidence : ConfidenceScore
        Transcription confidence.
    """

    text: str
    start: Timestamp
    end: Timestamp
    speaker: str | None = None
    confidence: ConfidenceScore = field(default_factory=lambda: ConfidenceScore(1.0))

    @property
    def duration(self) -> float:
        """Segment duration in seconds."""
        return self.end.seconds - self.start.seconds

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation.

        Returns
        -------
        dict[str, Any]
            Dictionary representation.
        """
        return {
            "text": self.text,
            "start": self.start.seconds,
            "end": self.end.seconds,
            "speaker": self.speaker,
            "confidence": self.confidence.value,
        }


@dataclass
class Summary:
    """A complete video summary.

    Parameters
    ----------
    summary_id : str
        Unique summary identifier.
    video_id : str
        Source video identifier.
    persona_id : str
        Persona used for summarization.
    summary_text : str
        Generated summary text.
    visual_analysis : str | None
        Detailed visual content analysis.
    audio_transcript : str | None
        Full audio transcript.
    key_frames : list[KeyFrame]
        Identified key frames.
    confidence : ConfidenceScore
        Overall confidence score.
    transcript_segments : list[TranscriptSegment]
        Structured transcript segments.
    """

    summary_id: str
    video_id: str
    persona_id: str
    summary_text: str
    visual_analysis: str | None = None
    audio_transcript: str | None = None
    key_frames: list[KeyFrame] = field(default_factory=list)
    confidence: ConfidenceScore = field(default_factory=lambda: ConfidenceScore(0.0))
    transcript_segments: list[TranscriptSegment] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def has_audio(self) -> bool:
        """Check if summary includes audio content."""
        return self.audio_transcript is not None

    @property
    def key_frame_count(self) -> int:
        """Number of key frames identified."""
        return len(self.key_frames)

    @property
    def speaker_count(self) -> int:
        """Number of unique speakers in transcript."""
        speakers = {s.speaker for s in self.transcript_segments if s.speaker}
        return len(speakers)


@dataclass
class ExtractedClaim:
    """A claim extracted from summary text.

    Parameters
    ----------
    claim_id : str
        Unique claim identifier.
    text : str
        Claim text.
    confidence : ConfidenceScore
        Extraction confidence.
    sentence_index : int | None
        Index of source sentence.
    char_start : int | None
        Start character offset in source.
    char_end : int | None
        End character offset in source.
    claim_type : str | None
        Semantic type of claim.
    subclaims : list[ExtractedClaim]
        Nested subclaims.
    """

    claim_id: str
    text: str
    confidence: ConfidenceScore
    sentence_index: int | None = None
    char_start: int | None = None
    char_end: int | None = None
    claim_type: str | None = None
    subclaims: list["ExtractedClaim"] = field(default_factory=list)

    @property
    def has_subclaims(self) -> bool:
        """Check if claim has subclaims."""
        return len(self.subclaims) > 0

    @property
    def total_claims(self) -> int:
        """Total claims including subclaims recursively."""
        count = 1
        for subclaim in self.subclaims:
            count += subclaim.total_claims
        return count

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation.

        Returns
        -------
        dict[str, Any]
            Dictionary representation.
        """
        return {
            "claim_id": self.claim_id,
            "text": self.text,
            "confidence": self.confidence.value,
            "sentence_index": self.sentence_index,
            "char_start": self.char_start,
            "char_end": self.char_end,
            "claim_type": self.claim_type,
            "subclaims": [c.to_dict() for c in self.subclaims],
        }


@dataclass
class ClaimExtractionResult:
    """Result of claim extraction from a summary.

    Parameters
    ----------
    summary_id : str
        Source summary identifier.
    claims : list[ExtractedClaim]
        Extracted claims.
    model_used : str
        Model used for extraction.
    processing_time : float
        Processing time in seconds.
    """

    summary_id: str
    claims: list[ExtractedClaim]
    model_used: str
    processing_time: float

    @property
    def claim_count(self) -> int:
        """Number of top-level claims."""
        return len(self.claims)

    @property
    def total_claims(self) -> int:
        """Total claims including subclaims."""
        return sum(c.total_claims for c in self.claims)


@dataclass
class ClaimRelationship:
    """Relationship between two claims.

    Parameters
    ----------
    source_claim_id : str
        Source claim identifier.
    target_claim_id : str
        Target claim identifier.
    relation_type : str
        Type of relationship.
    confidence : ConfidenceScore
        Confidence in the relationship.
    notes : str | None
        Optional notes.
    """

    source_claim_id: str
    target_claim_id: str
    relation_type: str
    confidence: ConfidenceScore = field(default_factory=lambda: ConfidenceScore(0.8))
    notes: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation.

        Returns
        -------
        dict[str, Any]
            Dictionary representation.
        """
        return {
            "source_claim_id": self.source_claim_id,
            "target_claim_id": self.target_claim_id,
            "relation_type": self.relation_type,
            "confidence": self.confidence.value,
            "notes": self.notes,
        }


@dataclass
class SynthesizedSummary:
    """A summary synthesized from multiple claim sources.

    Parameters
    ----------
    summary_id : str
        Target summary identifier.
    gloss_items : list[dict[str, Any]]
        Summary as GlossItem array with references.
    model_used : str
        Model used for synthesis.
    processing_time : float
        Processing time in seconds.
    claims_used : int
        Total claims synthesized.
    synthesis_metadata : dict[str, Any]
        Metadata about synthesis process.
    """

    summary_id: str
    gloss_items: list[dict[str, Any]]
    model_used: str
    processing_time: float
    claims_used: int
    synthesis_metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def text(self) -> str:
        """Extract plain text from gloss items."""
        return " ".join(item.get("text", "") for item in self.gloss_items if "text" in item)
