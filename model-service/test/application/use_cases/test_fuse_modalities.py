"""Tests for audio-visual fusion strategies."""

from __future__ import annotations

import pytest

from src.application.use_cases.fuse_modalities import (
    AudioSegment,
    FusionConfig,
    FusionStrategy,
    HybridFusion,
    NativeMultimodalFusion,
    SequentialFusion,
    TimestampAlignedFusion,
    VisualFrame,
    create_fusion_strategy,
)


def _segments() -> list[AudioSegment]:
    return [
        AudioSegment(start=0.0, end=1.0, text="hello", speaker="S1", confidence=0.9),
        AudioSegment(start=1.0, end=2.0, text="world", speaker="S2", confidence=0.8),
    ]


def _frames() -> list[VisualFrame]:
    return [
        VisualFrame(timestamp=0.5, frame_number=15, description="scene A", objects=["car"]),
        VisualFrame(timestamp=1.5, frame_number=45, description="scene B", objects=[]),
    ]


@pytest.mark.asyncio
async def test_sequential_fusion_happy_path() -> None:
    strategy = SequentialFusion(FusionConfig(strategy=FusionStrategy.SEQUENTIAL))
    result = await strategy.fuse(
        audio_transcript="hello world",
        audio_segments=_segments(),
        visual_summary="video depicts scenes",
        visual_frames=_frames(),
        audio_language="en",
        speaker_count=2,
    )
    assert result.fusion_strategy == "sequential"
    assert "Visual Analysis" in result.summary
    assert "Audio Transcript" in result.summary
    assert result.audio_language == "en"
    assert result.speaker_count == 2


@pytest.mark.asyncio
async def test_sequential_fusion_orders_by_weight() -> None:
    cfg = FusionConfig(strategy=FusionStrategy.SEQUENTIAL, audio_weight=0.8, visual_weight=0.2)
    strategy = SequentialFusion(cfg)
    result = await strategy.fuse(
        audio_transcript="a",
        audio_segments=[],
        visual_summary="v",
        visual_frames=[],
    )
    audio_idx = result.summary.index("Audio")
    visual_idx = result.summary.index("Visual")
    assert audio_idx < visual_idx


@pytest.mark.asyncio
async def test_timestamp_aligned_fusion_sorts_events() -> None:
    strategy = TimestampAlignedFusion(FusionConfig(strategy=FusionStrategy.TIMESTAMP_ALIGNED))
    result = await strategy.fuse(
        audio_transcript="hello world",
        audio_segments=_segments(),
        visual_summary="v",
        visual_frames=_frames(),
    )
    assert result.fusion_strategy == "timestamp_aligned"
    assert "[0.0s]" in result.summary
    assert "[0.5s]" in result.summary
    idx_0 = result.summary.index("[0.0s]")
    idx_05 = result.summary.index("[0.5s]")
    assert idx_0 < idx_05


@pytest.mark.asyncio
async def test_native_multimodal_fusion() -> None:
    strategy = NativeMultimodalFusion(FusionConfig(strategy=FusionStrategy.NATIVE_MULTIMODAL))
    result = await strategy.fuse(
        audio_transcript="transcript",
        audio_segments=_segments(),
        visual_summary="visual",
        visual_frames=_frames(),
    )
    assert result.fusion_strategy == "native_multimodal"
    assert "transcript" in result.summary
    assert "visual" in result.summary


@pytest.mark.asyncio
async def test_hybrid_fusion_selects_timestamp_with_multiple_speakers() -> None:
    strategy = HybridFusion(FusionConfig(strategy=FusionStrategy.HYBRID))
    result = await strategy.fuse(
        audio_transcript="a",
        audio_segments=_segments(),
        visual_summary="v",
        visual_frames=_frames(),
        speaker_count=3,
    )
    assert result.fusion_strategy == "hybrid"
    assert "[0.0s]" in result.summary


@pytest.mark.asyncio
async def test_hybrid_fusion_falls_back_to_sequential() -> None:
    strategy = HybridFusion(FusionConfig(strategy=FusionStrategy.HYBRID))
    result = await strategy.fuse(
        audio_transcript="a",
        audio_segments=[],
        visual_summary="v",
        visual_frames=_frames(),
        speaker_count=1,
    )
    assert result.fusion_strategy == "hybrid"
    assert "Visual Analysis" in result.summary
    assert "Audio Transcript" in result.summary


def test_create_fusion_strategy_known() -> None:
    assert isinstance(
        create_fusion_strategy(FusionConfig(strategy=FusionStrategy.SEQUENTIAL)),
        SequentialFusion,
    )
    assert isinstance(
        create_fusion_strategy(FusionConfig(strategy=FusionStrategy.TIMESTAMP_ALIGNED)),
        TimestampAlignedFusion,
    )
    assert isinstance(
        create_fusion_strategy(FusionConfig(strategy=FusionStrategy.NATIVE_MULTIMODAL)),
        NativeMultimodalFusion,
    )
    assert isinstance(
        create_fusion_strategy(FusionConfig(strategy=FusionStrategy.HYBRID)),
        HybridFusion,
    )


def test_visual_frame_defaults() -> None:
    frame = VisualFrame(timestamp=0.0, frame_number=0, description="x", objects=[])
    assert frame.confidence == 1.0
    assert frame.objects == []
