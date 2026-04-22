"""Tests for summary domain entities."""

from __future__ import annotations

from src.domain.entities.summary import (
    ClaimExtractionResult,
    ClaimRelationship,
    ExtractedClaim,
    KeyFrame,
    Summary,
    SynthesizedSummary,
    TranscriptSegment,
)
from src.domain.value_objects import ConfidenceScore, Timestamp


class TestKeyFrame:
    def test_to_dict(self) -> None:
        kf = KeyFrame(
            frame_number=5,
            timestamp=Timestamp(2.5),
            description="scene",
            confidence=ConfidenceScore(0.9),
        )
        d = kf.to_dict()
        assert d == {
            "frame_number": 5,
            "timestamp": 2.5,
            "description": "scene",
            "confidence": 0.9,
        }


class TestTranscriptSegment:
    def test_duration(self) -> None:
        s = TranscriptSegment(text="hi", start=Timestamp(1.0), end=Timestamp(3.5))
        assert s.duration == 2.5

    def test_default_confidence(self) -> None:
        s = TranscriptSegment(text="hi", start=Timestamp(0.0), end=Timestamp(1.0))
        assert s.confidence.value == 1.0

    def test_to_dict_with_speaker(self) -> None:
        s = TranscriptSegment(
            text="hello",
            start=Timestamp(0.0),
            end=Timestamp(1.0),
            speaker="SP1",
            confidence=ConfidenceScore(0.8),
        )
        d = s.to_dict()
        assert d["text"] == "hello"
        assert d["speaker"] == "SP1"
        assert d["confidence"] == 0.8


class TestSummary:
    def _summary(
        self,
        *,
        audio_transcript: str | None = None,
        key_frames: list[KeyFrame] | None = None,
        transcript_segments: list[TranscriptSegment] | None = None,
    ) -> Summary:
        return Summary(
            summary_id="s",
            video_id="v",
            persona_id="p",
            summary_text="text",
            audio_transcript=audio_transcript,
            key_frames=key_frames or [],
            transcript_segments=transcript_segments or [],
        )

    def test_defaults(self) -> None:
        s = self._summary()
        assert not s.has_audio
        assert s.key_frame_count == 0
        assert s.speaker_count == 0

    def test_has_audio(self) -> None:
        s = self._summary(audio_transcript="some words")
        assert s.has_audio

    def test_key_frame_count(self) -> None:
        frames = [
            KeyFrame(
                frame_number=i,
                timestamp=Timestamp(float(i)),
                description="",
                confidence=ConfidenceScore(1.0),
            )
            for i in range(3)
        ]
        s = self._summary(key_frames=frames)
        assert s.key_frame_count == 3

    def test_speaker_count_unique(self) -> None:
        segments = [
            TranscriptSegment(text="a", start=Timestamp(0.0), end=Timestamp(1.0), speaker="S1"),
            TranscriptSegment(text="b", start=Timestamp(1.0), end=Timestamp(2.0), speaker="S2"),
            TranscriptSegment(text="c", start=Timestamp(2.0), end=Timestamp(3.0), speaker="S1"),
            TranscriptSegment(text="d", start=Timestamp(3.0), end=Timestamp(4.0), speaker=None),
        ]
        s = self._summary(transcript_segments=segments)
        assert s.speaker_count == 2


class TestExtractedClaim:
    def test_no_subclaims(self) -> None:
        c = ExtractedClaim(
            claim_id="c1",
            text="claim",
            confidence=ConfidenceScore(0.9),
        )
        assert not c.has_subclaims
        assert c.total_claims == 1

    def test_subclaims_recursive(self) -> None:
        leaf = ExtractedClaim(claim_id="l", text="leaf", confidence=ConfidenceScore(0.7))
        mid = ExtractedClaim(
            claim_id="m", text="mid", confidence=ConfidenceScore(0.8), subclaims=[leaf]
        )
        root = ExtractedClaim(
            claim_id="r", text="root", confidence=ConfidenceScore(0.9), subclaims=[mid, leaf]
        )
        assert root.has_subclaims
        assert root.total_claims == 1 + mid.total_claims + leaf.total_claims
        assert root.total_claims == 4

    def test_to_dict(self) -> None:
        sub = ExtractedClaim(claim_id="s", text="sub", confidence=ConfidenceScore(0.7))
        c = ExtractedClaim(
            claim_id="c",
            text="root",
            confidence=ConfidenceScore(0.9),
            sentence_index=1,
            char_start=0,
            char_end=5,
            claim_type="fact",
            subclaims=[sub],
        )
        d = c.to_dict()
        assert d["claim_id"] == "c"
        assert d["sentence_index"] == 1
        assert len(d["subclaims"]) == 1


class TestClaimExtractionResult:
    def test_counts(self) -> None:
        sub = ExtractedClaim(claim_id="s", text="", confidence=ConfidenceScore(0.5))
        claims = [
            ExtractedClaim(claim_id="a", text="", confidence=ConfidenceScore(0.5), subclaims=[sub]),
            ExtractedClaim(claim_id="b", text="", confidence=ConfidenceScore(0.5)),
        ]
        r = ClaimExtractionResult(
            summary_id="s", claims=claims, model_used="m", processing_time=0.1
        )
        assert r.claim_count == 2
        assert r.total_claims == 3

    def test_empty(self) -> None:
        r = ClaimExtractionResult(summary_id="s", claims=[], model_used="m", processing_time=0.0)
        assert r.claim_count == 0
        assert r.total_claims == 0


class TestClaimRelationship:
    def test_defaults(self) -> None:
        rel = ClaimRelationship(
            source_claim_id="a", target_claim_id="b", relation_type="supports"
        )
        assert rel.confidence.value == 0.8
        assert rel.notes is None

    def test_to_dict(self) -> None:
        rel = ClaimRelationship(
            source_claim_id="a",
            target_claim_id="b",
            relation_type="conflicts_with",
            confidence=ConfidenceScore(0.95),
            notes="note",
        )
        d = rel.to_dict()
        assert d["source_claim_id"] == "a"
        assert d["relation_type"] == "conflicts_with"
        assert d["confidence"] == 0.95
        assert d["notes"] == "note"


class TestSynthesizedSummary:
    def test_text_extraction(self) -> None:
        s = SynthesizedSummary(
            summary_id="s",
            gloss_items=[
                {"type": "text", "text": "Hello"},
                {"type": "typeRef", "content": "Person"},
                {"type": "text", "text": "world"},
            ],
            model_used="m",
            processing_time=0.5,
            claims_used=3,
        )
        assert s.text == "Hello world"

    def test_empty_gloss_items(self) -> None:
        s = SynthesizedSummary(
            summary_id="s",
            gloss_items=[],
            model_used="m",
            processing_time=0.0,
            claims_used=0,
        )
        assert s.text == ""

    def test_default_metadata(self) -> None:
        s = SynthesizedSummary(
            summary_id="s",
            gloss_items=[],
            model_used="m",
            processing_time=0.0,
            claims_used=0,
        )
        assert s.synthesis_metadata == {}
