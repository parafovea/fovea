"""didactic wire models for the FastAPI request/response bodies.

One :class:`didactic.api.Model` per API concept. These are the shapes the
routes accept and return; :mod:`dx_bodies` converts them to Pydantic mirrors
so FastAPI can validate requests, serialize responses, and generate OpenAPI.

Container fields use ``tuple[T, ...]`` (didactic's immutable list) and
free-form JSON payloads use ``dict[str, JsonValue]`` (a JSON-shaped
recursive alias). Numeric and length bounds are expressed as
``annotated_types`` primitives, which the Pydantic boundary enforces.
"""

from __future__ import annotations

from typing import Annotated, Literal

import didactic.api as dx
from annotated_types import Ge, Gt, Le, MinLen

# JSON-shaped recursive payload for free-form fields (RLE masks, gloss items,
# annotation blobs, provider metadata). didactic classifies this as an opaque
# JSON fixpoint; Pydantic accepts the recursive alias natively.
type JsonValue = str | int | float | bool | None | list["JsonValue"] | dict[str, "JsonValue"]

# Reusable constrained scalars.
ConfidenceScore = Annotated[float, Ge(0.0), Le(1.0)]
NormalizedCoordinate = Annotated[float, Ge(0.0), Le(1.0)]
ProcessingTime = Annotated[float, Ge(0.0)]
NonNegativeInt = Annotated[int, Ge(0)]
PositiveInt = Annotated[int, Gt(0)]
NonEmptyStr = Annotated[str, MinLen(1)]


# ---------------------------------------------------------------------------
# Common
# ---------------------------------------------------------------------------


class ErrorResponse(dx.Model):
    """Error response body for API errors."""

    error: str = dx.field(description="Error type")
    message: str = dx.field(description="Human-readable error message")
    details: dict[str, JsonValue] | None = dx.field(
        default=None, description="Additional error details"
    )


class ThumbnailGenerateRequest(dx.Model):
    """Request body for the thumbnail generation endpoint."""

    video_id: NonEmptyStr = dx.field(description="Unique identifier for the video")
    video_path: NonEmptyStr = dx.field(description="Path to video file")
    timestamp: Annotated[float, Ge(0.0)] = dx.field(
        default=1.0, description="Timestamp to extract (seconds)"
    )
    size: Literal["small", "medium", "large"] = dx.field(
        default="medium", description="Thumbnail size preset"
    )


class ThumbnailGenerateResponse(dx.Model):
    """Response body for the thumbnail generation endpoint."""

    video_id: NonEmptyStr = dx.field(description="Video identifier")
    thumbnail_path: NonEmptyStr = dx.field(description="Path to generated thumbnail")
    timestamp: Annotated[float, Ge(0.0)] = dx.field(description="Timestamp used for extraction")
    size: str = dx.field(description="Size preset used")


# ---------------------------------------------------------------------------
# Reasoning traces
# ---------------------------------------------------------------------------


class ThinkingStep(dx.Model):
    """One step of a chain-of-thought trace."""

    content: str = dx.field(description="Reasoning step text")
    tokens_used: int | None = dx.field(default=None, description="Optional token count")


class ThinkingTrace(dx.Model):
    """Captured reasoning trace from a thinking-capable model."""

    steps: tuple[ThinkingStep, ...] = dx.field(
        default_factory=tuple, description="Reasoning steps in order"
    )
    model_id: str = dx.field(default="", description="Producing model identifier")
    total_tokens: int | None = dx.field(
        default=None, description="Optional total tokens across steps"
    )


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------


class BoundingBox(dx.Model):
    """Bounding box coordinates, normalized to [0, 1]."""

    x: NormalizedCoordinate = dx.field(description="X coordinate (normalized)")
    y: NormalizedCoordinate = dx.field(description="Y coordinate (normalized)")
    width: NormalizedCoordinate = dx.field(description="Box width (normalized)")
    height: NormalizedCoordinate = dx.field(description="Box height (normalized)")


class Detection(dx.Model):
    """Single object detection result."""

    label: NonEmptyStr = dx.field(description="Detected object label")
    bounding_box: BoundingBox = dx.field(description="Bounding box coordinates")
    confidence: ConfidenceScore = dx.field(description="Detection confidence score")
    track_id: str | None = dx.field(default=None, description="Tracking ID across frames")


class FrameDetections(dx.Model):
    """Detections for a single video frame."""

    frame_number: NonNegativeInt = dx.field(description="Frame number in the video")
    timestamp: Annotated[float, Ge(0.0)] = dx.field(description="Time in seconds from video start")
    detections: tuple[Detection, ...] = dx.field(
        default_factory=tuple, description="Detections in this frame"
    )


class DetectionRequest(dx.Model):
    """Request body for the object detection endpoint."""

    video_id: NonEmptyStr = dx.field(description="Unique identifier for the video")
    query: NonEmptyStr = dx.field(description="Text query describing objects to detect")
    video_path: str | None = dx.field(default=None, description="Optional full path to video file")
    frame_numbers: tuple[int, ...] = dx.field(
        default_factory=tuple, description="Specific frames to process"
    )
    confidence_threshold: ConfidenceScore = dx.field(
        default=0.3, description="Minimum confidence for detections"
    )
    enable_tracking: bool = dx.field(default=True, description="Whether to enable object tracking")


class DetectionResponse(dx.Model):
    """Response body for the object detection endpoint."""

    id: NonEmptyStr = dx.field(description="Unique identifier for this detection job")
    video_id: NonEmptyStr = dx.field(description="Video identifier")
    query: NonEmptyStr = dx.field(description="Query that was used")
    frames: tuple[FrameDetections, ...] = dx.field(
        default_factory=tuple, description="Frames with detections"
    )
    total_detections: NonNegativeInt = dx.field(description="Total detections across all frames")
    processing_time: ProcessingTime = dx.field(description="Processing time in seconds")


# ---------------------------------------------------------------------------
# Tracking
# ---------------------------------------------------------------------------


class TrackingMaskData(dx.Model):
    """RLE-encoded segmentation mask for a tracked object."""

    object_id: int = dx.field(description="Unique identifier for tracked object")
    mask_rle: dict[str, JsonValue] = dx.field(
        description="RLE-encoded mask with 'size' and 'counts' keys"
    )
    confidence: ConfidenceScore = dx.field(description="Mask prediction confidence")
    is_occluded: bool = dx.field(
        default=False, description="Whether object is occluded in this frame"
    )


class TrackingFrameResult(dx.Model):
    """Tracking results for a single video frame."""

    frame_number: NonNegativeInt = dx.field(description="Frame number in the video")
    timestamp: Annotated[float, Ge(0.0)] = dx.field(description="Time in seconds from video start")
    masks: tuple[TrackingMaskData, ...] = dx.field(
        default_factory=tuple, description="Tracked object masks"
    )
    processing_time: ProcessingTime = dx.field(
        description="Processing time for this frame in seconds"
    )


class TrackingRequest(dx.Model):
    """Request body for the object tracking endpoint."""

    video_id: NonEmptyStr = dx.field(description="Unique identifier for the video")
    initial_masks: tuple[str, ...] = dx.field(
        description="Base64-encoded initial masks for frame 0 (numpy arrays)"
    )
    object_ids: tuple[int, ...] = dx.field(description="Object IDs to track")
    frame_numbers: tuple[int, ...] = dx.field(
        default_factory=tuple, description="Specific frames to process (empty = all)"
    )


class TrackingResponse(dx.Model):
    """Response body for the object tracking endpoint."""

    id: NonEmptyStr = dx.field(description="Unique identifier for this tracking job")
    video_id: NonEmptyStr = dx.field(description="Video identifier")
    frames: tuple[TrackingFrameResult, ...] = dx.field(
        default_factory=tuple, description="Frames with tracked masks"
    )
    video_width: PositiveInt = dx.field(description="Video frame width in pixels")
    video_height: PositiveInt = dx.field(description="Video frame height in pixels")
    total_frames: NonNegativeInt = dx.field(description="Total frames processed")
    processing_time: ProcessingTime = dx.field(description="Total processing time in seconds")
    fps: Annotated[float, Ge(0.0)] = dx.field(description="Processing speed in frames per second")


# ---------------------------------------------------------------------------
# Ontology
# ---------------------------------------------------------------------------


class OntologyType(dx.Model):
    """Suggested ontology type from augmentation."""

    name: NonEmptyStr = dx.field(description="Type name")
    description: str = dx.field(description="Type description")
    parent: str | None = dx.field(default=None, description="Parent type name")
    confidence: ConfidenceScore = dx.field(default=0.0, description="Confidence score")
    examples: tuple[str, ...] = dx.field(default_factory=tuple, description="Example instances")
    thinking: ThinkingTrace | None = dx.field(
        default=None, description="Optional reasoning trace from a thinking-capable model"
    )


class AugmentRequest(dx.Model):
    """Request body for the ontology augmentation endpoint."""

    persona_id: NonEmptyStr = dx.field(description="Unique identifier for the persona")
    domain: NonEmptyStr = dx.field(description="Domain description for context")
    existing_types: tuple[str, ...] = dx.field(
        default_factory=tuple, description="Existing type names"
    )
    target_category: Literal["entity", "event", "role", "relation"] = dx.field(
        description="Category to augment"
    )
    max_suggestions: Annotated[int, Ge(1), Le(50)] = dx.field(
        default=10, description="Maximum suggestions to return"
    )


class AugmentResponse(dx.Model):
    """Response body for the ontology augmentation endpoint."""

    id: NonEmptyStr = dx.field(description="Unique identifier for this augmentation")
    persona_id: NonEmptyStr = dx.field(description="Persona identifier")
    target_category: str = dx.field(description="Category that was augmented")
    suggestions: tuple[OntologyType, ...] = dx.field(
        default_factory=tuple, description="Suggested types"
    )
    reasoning: str = dx.field(description="Explanation of why these types were suggested")


# ---------------------------------------------------------------------------
# Summarization
# ---------------------------------------------------------------------------


class KeyFrame(dx.Model):
    """Key frame information from video analysis."""

    frame_number: int = dx.field(description="Frame number in the video")
    timestamp: Annotated[float, Ge(0.0)] = dx.field(description="Time in seconds from video start")
    description: str = dx.field(description="Frame description")
    confidence: ConfidenceScore = dx.field(default=0.0, description="Model confidence score")


class GenerationOverrides(dx.Model):
    """Per-request overrides for LLM/VLM sampling parameters."""

    temperature: Annotated[float, Ge(0.0), Le(2.0)] | None = dx.field(
        default=None, description="Sampling temperature override"
    )
    top_p: Annotated[float, Ge(0.0), Le(1.0)] | None = dx.field(
        default=None, description="Nucleus sampling probability mass"
    )
    max_tokens: Annotated[int, Ge(1), Le(32768)] | None = dx.field(
        default=None, description="Maximum tokens to generate"
    )


class AudioOverrides(dx.Model):
    """Per-request overrides for transcription and diarization."""

    beam_size: Annotated[int, Ge(1), Le(10)] | None = dx.field(
        default=None, description="Decoder beam width"
    )
    compute_type: Literal["float16", "float32", "int8", "int8_float16"] | None = dx.field(
        default=None, description="Transcriber compute precision"
    )
    num_speakers: Annotated[int, Ge(1), Le(20)] | None = dx.field(
        default=None, description="Exact speaker count (skips auto-detect)"
    )
    min_speakers: Annotated[int, Ge(1), Le(20)] | None = None
    max_speakers: Annotated[int, Ge(1), Le(20)] | None = None
    vad_threshold: Annotated[float, Ge(0.0), Le(1.0)] | None = dx.field(
        default=None, description="Voice-activity detection probability threshold"
    )


class SummarizeRequest(dx.Model):
    """Request body for the video summarization endpoint."""

    video_id: NonEmptyStr = dx.field(description="Unique identifier for the video")
    persona_id: NonEmptyStr = dx.field(description="Unique identifier for the persona")
    video_path: str | None = dx.field(default=None, description="Optional full path to video file")
    persona_role: str | None = dx.field(
        default=None, description="Optional persona role for context"
    )
    information_need: str | None = dx.field(
        default=None, description="Optional information need for context"
    )
    frame_sample_rate: Annotated[int, Ge(1), Le(10)] = dx.field(
        default=1, description="Frames to sample per second"
    )
    max_frames: Annotated[int, Ge(1), Le(100)] = dx.field(
        default=30, description="Maximum frames to process"
    )
    enable_audio: bool = dx.field(default=False, description="Enable audio transcription")
    audio_language: str | None = dx.field(
        default=None, description="Audio language code (e.g., 'en')"
    )
    enable_speaker_diarization: bool = dx.field(
        default=False, description="Enable speaker identification"
    )
    fusion_strategy: (
        Literal["sequential", "timestamp_aligned", "native_multimodal", "hybrid"] | None
    ) = dx.field(default="sequential", description="Audio-visual fusion strategy")
    generation_overrides: GenerationOverrides | None = dx.field(
        default=None, description="Per-request VLM sampling overrides"
    )
    audio_overrides: AudioOverrides | None = dx.field(
        default=None, description="Per-request transcription/diarization overrides"
    )


class SummarizeResponse(dx.Model):
    """Response body for the video summarization endpoint."""

    id: NonEmptyStr = dx.field(description="Unique identifier for this summary")
    video_id: NonEmptyStr = dx.field(description="Video identifier")
    persona_id: NonEmptyStr = dx.field(description="Persona identifier")
    summary: str = dx.field(description="Text summary of video content")
    visual_analysis: str | None = dx.field(
        default=None, description="Detailed visual content analysis"
    )
    audio_transcript: str | None = dx.field(default=None, description="Transcribed audio content")
    key_frames: tuple[KeyFrame, ...] = dx.field(
        default_factory=tuple, description="Key frames with descriptions"
    )
    confidence: ConfidenceScore = dx.field(default=0.0, description="Overall confidence score")
    transcript_json: dict[str, JsonValue] | None = dx.field(
        default=None, description="Structured transcript with segments"
    )
    audio_language: str | None = dx.field(default=None, description="Detected audio language code")
    speaker_count: NonNegativeInt | None = dx.field(
        default=None, description="Number of distinct speakers"
    )
    audio_model_used: str | None = dx.field(
        default=None, description="Audio transcription model name"
    )
    visual_model_used: str | None = dx.field(default=None, description="Visual analysis model name")
    fusion_strategy: str | None = dx.field(default=None, description="Fusion strategy used")
    processing_time_audio: ProcessingTime | None = dx.field(
        default=None, description="Audio processing time in seconds"
    )
    processing_time_visual: ProcessingTime | None = dx.field(
        default=None, description="Visual processing time in seconds"
    )
    processing_time_fusion: ProcessingTime | None = dx.field(
        default=None, description="Fusion processing time in seconds"
    )
    thinking: ThinkingTrace | None = dx.field(
        default=None, description="Optional reasoning trace from a thinking-capable model"
    )


# ---------------------------------------------------------------------------
# Claims
# ---------------------------------------------------------------------------


class ExtractedClaim(dx.Model):
    """Single extracted claim with metadata and nested subclaims."""

    text: NonEmptyStr = dx.field(description="Claim text")
    sentence_index: NonNegativeInt | None = dx.field(
        default=None, description="Index of source sentence (if sentence-based)"
    )
    char_start: NonNegativeInt | None = dx.field(
        default=None, description="Character offset in summary text"
    )
    char_end: NonNegativeInt | None = dx.field(
        default=None, description="Character offset end in summary text"
    )
    subclaims: tuple[ExtractedClaim, ...] = dx.field(
        default_factory=tuple, description="Nested subclaims"
    )
    confidence: ConfidenceScore = dx.field(description="Model confidence in claim extraction")
    claim_type: str | None = dx.field(default=None, description="Semantic type of claim")
    thinking: ThinkingTrace | None = dx.field(
        default=None, description="Optional reasoning trace from a thinking-capable model"
    )


class ClaimExtractionRequest(dx.Model):
    """Request body for the claim extraction endpoint."""

    summary_id: NonEmptyStr = dx.field(description="Unique identifier for the summary")
    summary_text: NonEmptyStr = dx.field(description="Full summary text to extract claims from")
    sentences: tuple[str, ...] | None = dx.field(
        default=None, description="Pre-split sentences (optional)"
    )
    annotations: tuple[dict[str, JsonValue], ...] | None = dx.field(
        default=None, description="Annotation data for context"
    )
    ontology_types: tuple[dict[str, JsonValue], ...] | None = dx.field(
        default=None, description="Ontology type definitions for context"
    )
    ontology_glosses: dict[str, str] | None = dx.field(
        default=None, description="Map of type ID to gloss text"
    )
    extraction_strategy: Literal["sentence-based", "semantic-units", "hierarchical"] = dx.field(
        default="sentence-based", description="Strategy for extracting claims"
    )
    max_claims: Annotated[int, Ge(1), Le(200)] = dx.field(
        default=50, description="Maximum number of claims to extract"
    )
    min_confidence: ConfidenceScore = dx.field(
        default=0.5, description="Minimum confidence threshold for claims"
    )


class ClaimExtractionResponse(dx.Model):
    """Response body for the claim extraction endpoint."""

    summary_id: NonEmptyStr = dx.field(description="Summary identifier")
    claims: tuple[ExtractedClaim, ...] = dx.field(
        default_factory=tuple, description="Extracted claims"
    )
    model_used: NonEmptyStr = dx.field(description="LLM model used for extraction")
    processing_time: ProcessingTime = dx.field(description="Processing time in seconds")


class ClaimSource(dx.Model):
    """Source of claims for synthesis (single video or collection)."""

    source_id: NonEmptyStr = dx.field(description="Video ID or collection ID")
    source_type: Literal["video", "collection"] = dx.field(description="Type of source")
    claims: tuple[dict[str, JsonValue], ...] = dx.field(
        default_factory=tuple, description="Hierarchical claim structure"
    )
    metadata: dict[str, JsonValue] | None = dx.field(
        default=None, description="Source metadata (video title, date, etc.)"
    )


class ClaimRelationship(dx.Model):
    """Relationship between claims across sources."""

    source_claim_id: NonEmptyStr = dx.field(description="Source claim ID")
    target_claim_id: NonEmptyStr = dx.field(description="Target claim ID")
    relation_type: Literal[
        "supports",
        "conflicts_with",
        "contradicts",
        "refines",
        "generalizes",
        "duplicates",
    ] = dx.field(description="Type of relationship")
    confidence: ConfidenceScore = dx.field(default=0.8, description="Confidence score")
    notes: str | None = dx.field(default=None, description="Optional notes")


class SummarySynthesisRequest(dx.Model):
    """Request body for the summary synthesis endpoint."""

    summary_id: NonEmptyStr = dx.field(description="Target summary identifier")
    claim_sources: Annotated[tuple[ClaimSource, ...], MinLen(1)] = dx.field(
        description="Claim hierarchies from one or more sources"
    )
    claim_relations: tuple[ClaimRelationship, ...] | None = dx.field(
        default=None, description="Relationships between claims"
    )
    ontology_context: dict[str, JsonValue] | None = dx.field(
        default=None, description="Ontology types and glosses for references"
    )
    persona_context: dict[str, JsonValue] | None = dx.field(
        default=None, description="Persona information for perspective"
    )
    synthesis_strategy: Literal["hierarchical", "chronological", "narrative", "analytical"] = (
        dx.field(default="hierarchical", description="Strategy for organizing summary")
    )
    max_length: Annotated[int, Ge(100), Le(2000)] = dx.field(
        default=500, description="Maximum summary length in words"
    )
    include_conflicts: bool = dx.field(
        default=True, description="Explicitly mention informational conflicts"
    )
    include_citations: bool = dx.field(
        default=False, description="Include inline citations to source claims"
    )


class SummarySynthesisResponse(dx.Model):
    """Response body for the summary synthesis endpoint."""

    summary_id: NonEmptyStr = dx.field(description="Summary identifier")
    summary_gloss: tuple[dict[str, JsonValue], ...] = dx.field(
        default_factory=tuple,
        description="Generated summary as GlossItem array with references",
    )
    model_used: NonEmptyStr = dx.field(description="LLM model used for synthesis")
    processing_time: ProcessingTime = dx.field(description="Processing time in seconds")
    claims_used: NonNegativeInt = dx.field(description="Total claims synthesized")
    synthesis_metadata: dict[str, JsonValue] = dx.field(
        default_factory=dict, description="Metadata about synthesis"
    )
    thinking: ThinkingTrace | None = dx.field(
        default=None, description="Optional reasoning trace from a thinking-capable model"
    )


__all__ = [
    "AudioOverrides",
    "AugmentRequest",
    "AugmentResponse",
    "BoundingBox",
    "ClaimExtractionRequest",
    "ClaimExtractionResponse",
    "ClaimRelationship",
    "ClaimSource",
    "Detection",
    "DetectionRequest",
    "DetectionResponse",
    "ErrorResponse",
    "ExtractedClaim",
    "FrameDetections",
    "GenerationOverrides",
    "JsonValue",
    "KeyFrame",
    "OntologyType",
    "SummarizeRequest",
    "SummarizeResponse",
    "SummarySynthesisRequest",
    "SummarySynthesisResponse",
    "ThinkingStep",
    "ThinkingTrace",
    "ThumbnailGenerateRequest",
    "ThumbnailGenerateResponse",
    "TrackingFrameResult",
    "TrackingMaskData",
    "TrackingRequest",
    "TrackingResponse",
]
