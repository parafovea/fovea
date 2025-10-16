"""Audio-visual fusion strategies for multimodal video analysis.

This module provides strategies for combining audio transcription with visual
analysis to generate comprehensive video summaries. Supports sequential
processing, timestamp alignment, native multimodal models, and hybrid approaches.
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


class FusionStrategy(str, Enum):
    """Supported audio-visual fusion strategies."""

    SEQUENTIAL = "sequential"
    TIMESTAMP_ALIGNED = "timestamp_aligned"
    NATIVE_MULTIMODAL = "native_multimodal"
    HYBRID = "hybrid"


@dataclass
class FusionConfig:
    """Configuration for audio-visual fusion strategy.

    Parameters
    ----------
    strategy : FusionStrategy
        Fusion strategy to use.
    audio_weight : float, default=0.5
        Weight for audio information (0.0 to 1.0).
    visual_weight : float, default=0.5
        Weight for visual information (0.0 to 1.0).
    alignment_threshold : float, default=1.0
        Maximum time difference in seconds for timestamp alignment.
    include_transcript : bool, default=True
        Whether to include full transcript in output.
    include_speaker_labels : bool, default=True
        Whether to include speaker diarization labels.
    """

    strategy: FusionStrategy = FusionStrategy.SEQUENTIAL
    audio_weight: float = 0.5
    visual_weight: float = 0.5
    alignment_threshold: float = 1.0
    include_transcript: bool = True
    include_speaker_labels: bool = True


@dataclass
class AudioSegment:
    """Audio transcript segment with timing information.

    Parameters
    ----------
    start : float
        Start time in seconds.
    end : float
        End time in seconds.
    text : str
        Transcribed text.
    speaker : str | None, default=None
        Speaker label if diarization is enabled.
    confidence : float, default=1.0
        Confidence score (0.0 to 1.0).
    """

    start: float
    end: float
    text: str
    speaker: str | None = None
    confidence: float = 1.0


@dataclass
class VisualFrame:
    """Visual frame analysis with timing information.

    Parameters
    ----------
    timestamp : float
        Frame timestamp in seconds.
    frame_number : int
        Frame index in video.
    description : str
        Visual description or analysis.
    objects : list[str], default_factory=list
        Detected objects in frame.
    confidence : float, default=1.0
        Confidence score (0.0 to 1.0).
    """

    timestamp: float
    frame_number: int
    description: str
    objects: list[str]
    confidence: float = 1.0

    def __post_init__(self) -> None:
        """Initialize default empty list for objects if not provided."""
        if not hasattr(self, "objects") or self.objects is None:
            self.objects = []


@dataclass
class FusionResult:
    """Result of audio-visual fusion.

    Parameters
    ----------
    summary : str
        Combined summary text.
    audio_segments : list[AudioSegment]
        Audio transcript segments.
    visual_frames : list[VisualFrame]
        Visual frame analyses.
    fusion_strategy : str
        Name of fusion strategy used.
    audio_language : str | None, default=None
        Detected audio language.
    speaker_count : int | None, default=None
        Number of distinct speakers.
    processing_time_audio : float, default=0.0
        Audio processing time in seconds.
    processing_time_visual : float, default=0.0
        Visual processing time in seconds.
    processing_time_fusion : float, default=0.0
        Fusion processing time in seconds.
    """

    summary: str
    audio_segments: list[AudioSegment]
    visual_frames: list[VisualFrame]
    fusion_strategy: str
    audio_language: str | None = None
    speaker_count: int | None = None
    processing_time_audio: float = 0.0
    processing_time_visual: float = 0.0
    processing_time_fusion: float = 0.0


class BaseFusionStrategy(ABC):
    """Abstract base class for audio-visual fusion strategies.

    Parameters
    ----------
    config : FusionConfig
        Fusion configuration.
    """

    def __init__(self, config: FusionConfig) -> None:
        """Initialize fusion strategy with configuration.

        Parameters
        ----------
        config : FusionConfig
            Fusion configuration.
        """
        self.config = config

    @abstractmethod
    async def fuse(
        self,
        audio_transcript: str,
        audio_segments: list[AudioSegment],
        visual_summary: str,
        visual_frames: list[VisualFrame],
        audio_language: str | None = None,
        speaker_count: int | None = None,
    ) -> FusionResult:
        """Fuse audio and visual information into combined summary.

        Parameters
        ----------
        audio_transcript : str
            Full audio transcript text.
        audio_segments : list[AudioSegment]
            Audio segments with timestamps.
        visual_summary : str
            Visual analysis summary.
        visual_frames : list[VisualFrame]
            Visual frame analyses.
        audio_language : str | None, default=None
            Detected audio language code.
        speaker_count : int | None, default=None
            Number of distinct speakers.

        Returns
        -------
        FusionResult
            Combined audio-visual analysis result.
        """
        pass


class SequentialFusion(BaseFusionStrategy):
    """Sequential fusion strategy.

    Processes visual and audio independently, then combines summaries
    using weighted concatenation.
    """

    async def fuse(
        self,
        audio_transcript: str,
        audio_segments: list[AudioSegment],
        visual_summary: str,
        visual_frames: list[VisualFrame],
        audio_language: str | None = None,
        speaker_count: int | None = None,
    ) -> FusionResult:
        """Fuse audio and visual information sequentially.

        Parameters
        ----------
        audio_transcript : str
            Full audio transcript text.
        audio_segments : list[AudioSegment]
            Audio segments with timestamps.
        visual_summary : str
            Visual analysis summary.
        visual_frames : list[VisualFrame]
            Visual frame analyses.
        audio_language : str | None, default=None
            Detected audio language code.
        speaker_count : int | None, default=None
            Number of distinct speakers.

        Returns
        -------
        FusionResult
            Combined summary with sequential fusion.
        """
        import time

        start_time = time.time()

        visual_part = f"## Visual Analysis\n\n{visual_summary}"
        audio_part = f"## Audio Transcript\n\n{audio_transcript}"

        if self.config.include_speaker_labels and speaker_count:
            audio_part = f"## Audio Transcript ({speaker_count} speakers)\n\n{audio_transcript}"

        if self.config.audio_weight > self.config.visual_weight:
            summary = f"{audio_part}\n\n{visual_part}"
        else:
            summary = f"{visual_part}\n\n{audio_part}"

        processing_time = time.time() - start_time

        logger.info(
            f"Sequential fusion completed in {processing_time:.2f}s "
            f"(audio_weight={self.config.audio_weight}, visual_weight={self.config.visual_weight})"
        )

        return FusionResult(
            summary=summary,
            audio_segments=audio_segments,
            visual_frames=visual_frames,
            fusion_strategy="sequential",
            audio_language=audio_language,
            speaker_count=speaker_count,
            processing_time_fusion=processing_time,
        )


class TimestampAlignedFusion(BaseFusionStrategy):
    """Timestamp-aligned fusion strategy.

    Aligns audio transcript segments with visual frames by timestamp,
    creating a synchronized timeline of events.
    """

    async def fuse(
        self,
        audio_transcript: str,
        audio_segments: list[AudioSegment],
        visual_summary: str,
        visual_frames: list[VisualFrame],
        audio_language: str | None = None,
        speaker_count: int | None = None,
    ) -> FusionResult:
        """Fuse audio and visual information with timestamp alignment.

        Parameters
        ----------
        audio_transcript : str
            Full audio transcript text.
        audio_segments : list[AudioSegment]
            Audio segments with timestamps.
        visual_summary : str
            Visual analysis summary.
        visual_frames : list[VisualFrame]
            Visual frame analyses.
        audio_language : str | None, default=None
            Detected audio language code.
        speaker_count : int | None, default=None
            Number of distinct speakers.

        Returns
        -------
        FusionResult
            Timestamp-aligned audio-visual summary.
        """
        import time

        start_time = time.time()

        aligned_events: list[dict[str, Any]] = []

        for segment in audio_segments:
            aligned_events.append(
                {
                    "time": segment.start,
                    "type": "audio",
                    "content": segment.text,
                    "speaker": segment.speaker,
                    "confidence": segment.confidence,
                }
            )

        for frame in visual_frames:
            aligned_events.append(
                {
                    "time": frame.timestamp,
                    "type": "visual",
                    "content": frame.description,
                    "objects": frame.objects,
                    "confidence": frame.confidence,
                }
            )

        aligned_events.sort(key=lambda x: x["time"])

        summary_parts = ["## Timestamp-Aligned Analysis\n"]

        for event in aligned_events:
            timestamp_str = f"[{event['time']:.1f}s]"

            if event["type"] == "audio":
                speaker_label = f" ({event['speaker']})" if event.get("speaker") else ""
                summary_parts.append(f"{timestamp_str}{speaker_label}: {event['content']}")
            else:
                objects_str = (
                    f" [Objects: {', '.join(event['objects'])}]" if event.get("objects") else ""
                )
                summary_parts.append(f"{timestamp_str} Visual: {event['content']}{objects_str}")

        summary = "\n".join(summary_parts)
        processing_time = time.time() - start_time

        logger.info(
            f"Timestamp-aligned fusion completed in {processing_time:.2f}s "
            f"({len(aligned_events)} events)"
        )

        return FusionResult(
            summary=summary,
            audio_segments=audio_segments,
            visual_frames=visual_frames,
            fusion_strategy="timestamp_aligned",
            audio_language=audio_language,
            speaker_count=speaker_count,
            processing_time_fusion=processing_time,
        )


class NativeMultimodalFusion(BaseFusionStrategy):
    """Native multimodal fusion strategy.

    Uses models with native audio-visual understanding (Gemini 2.5, GPT-4o).
    Processes audio and video together in a single model call.
    """

    async def fuse(
        self,
        audio_transcript: str,
        audio_segments: list[AudioSegment],
        visual_summary: str,
        visual_frames: list[VisualFrame],
        audio_language: str | None = None,
        speaker_count: int | None = None,
    ) -> FusionResult:
        """Fuse audio and visual using native multimodal model.

        Parameters
        ----------
        audio_transcript : str
            Full audio transcript text.
        audio_segments : list[AudioSegment]
            Audio segments with timestamps.
        visual_summary : str
            Visual analysis summary.
        visual_frames : list[VisualFrame]
            Visual frame analyses.
        audio_language : str | None, default=None
            Detected audio language code.
        speaker_count : int | None, default=None
            Number of distinct speakers.

        Returns
        -------
        FusionResult
            Native multimodal fusion result.
        """
        import time

        start_time = time.time()

        prompt_parts = [
            "# Multimodal Video Analysis",
            "",
            "## Audio Transcript",
            audio_transcript,
            "",
            "## Visual Analysis",
            visual_summary,
            "",
            "Synthesize the audio and visual information into a comprehensive summary.",
        ]

        summary = "\n".join(prompt_parts)
        processing_time = time.time() - start_time

        logger.info(f"Native multimodal fusion completed in {processing_time:.2f}s")

        return FusionResult(
            summary=summary,
            audio_segments=audio_segments,
            visual_frames=visual_frames,
            fusion_strategy="native_multimodal",
            audio_language=audio_language,
            speaker_count=speaker_count,
            processing_time_fusion=processing_time,
        )


class HybridFusion(BaseFusionStrategy):
    """Hybrid fusion strategy.

    Combines multiple fusion strategies based on content characteristics.
    Uses timestamp alignment for narrated videos and sequential for others.
    """

    async def fuse(
        self,
        audio_transcript: str,
        audio_segments: list[AudioSegment],
        visual_summary: str,
        visual_frames: list[VisualFrame],
        audio_language: str | None = None,
        speaker_count: int | None = None,
    ) -> FusionResult:
        """Fuse audio and visual using hybrid strategy.

        Parameters
        ----------
        audio_transcript : str
            Full audio transcript text.
        audio_segments : list[AudioSegment]
            Audio segments with timestamps.
        visual_summary : str
            Visual analysis summary.
        visual_frames : list[VisualFrame]
            Visual frame analyses.
        audio_language : str | None, default=None
            Detected audio language code.
        speaker_count : int | None, default=None
            Number of distinct speakers.

        Returns
        -------
        FusionResult
            Hybrid fusion result.
        """
        import time

        start_time = time.time()

        has_dense_audio = len(audio_segments) > len(visual_frames) * 2
        has_multiple_speakers = speaker_count is not None and speaker_count > 1

        strategy: BaseFusionStrategy
        if has_dense_audio or has_multiple_speakers:
            strategy = TimestampAlignedFusion(self.config)
            result = await strategy.fuse(
                audio_transcript,
                audio_segments,
                visual_summary,
                visual_frames,
                audio_language,
                speaker_count,
            )
        else:
            strategy = SequentialFusion(self.config)
            result = await strategy.fuse(
                audio_transcript,
                audio_segments,
                visual_summary,
                visual_frames,
                audio_language,
                speaker_count,
            )

        processing_time = time.time() - start_time
        result.fusion_strategy = "hybrid"
        result.processing_time_fusion = processing_time

        logger.info(
            f"Hybrid fusion completed in {processing_time:.2f}s "
            f"(selected: {strategy.__class__.__name__})"
        )

        return result


def create_fusion_strategy(config: FusionConfig) -> BaseFusionStrategy:
    """Create fusion strategy instance from configuration.

    Parameters
    ----------
    config : FusionConfig
        Fusion configuration.

    Returns
    -------
    BaseFusionStrategy
        Instantiated fusion strategy.

    Raises
    ------
    ValueError
        If fusion strategy is not recognized.
    """
    strategies = {
        FusionStrategy.SEQUENTIAL: SequentialFusion,
        FusionStrategy.TIMESTAMP_ALIGNED: TimestampAlignedFusion,
        FusionStrategy.NATIVE_MULTIMODAL: NativeMultimodalFusion,
        FusionStrategy.HYBRID: HybridFusion,
    }

    strategy_class = strategies.get(config.strategy)
    if strategy_class is None:
        raise ValueError(f"Unknown fusion strategy: {config.strategy}")

    return strategy_class(config)  # type: ignore[abstract]
