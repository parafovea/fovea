"""TypedDict definitions for application data transfer objects.

Defines TypedDict classes for dictionaries with known key structures,
enabling type checking for configuration data, API responses, and
internal data transfer objects.
"""

from typing import Any, TypedDict


class ModelConfigDict(TypedDict, total=False):
    """Configuration dictionary for a single model variant."""

    model_id: str
    framework: str
    vram_gb: float
    cpu_memory_gb: float
    cpu_compatible: bool
    quantization: str | None
    speed: str
    description: str
    fps: int | None
    provider: str | None
    api_endpoint: str | None
    requires_api_key: bool


class TaskConfigDict(TypedDict):
    """Configuration dictionary for a task type."""

    selected: str
    options: dict[str, ModelConfigDict]


class InferenceConfigDict(TypedDict, total=False):
    """Global inference configuration dictionary."""

    max_memory_per_model: str
    offload_threshold: float
    warmup_on_startup: bool
    default_batch_size: int
    max_batch_size: int


class MemoryValidationDict(TypedDict):
    """Memory validation result dictionary."""

    valid: bool
    total_vram_gb: float
    total_ram_gb: float | None
    total_required_gb: float
    threshold: float
    max_allowed_gb: float
    model_requirements: dict[str, "ModelRequirementDict"]
    cpu_only_mode: bool
    device: str


class ModelRequirementDict(TypedDict):
    """Model memory requirement dictionary."""

    model_id: str
    memory_gb: float
    cpu_compatible: bool


class LoadedModelInfoDict(TypedDict):
    """Information about a loaded model."""

    model_id: str
    memory_usage_gb: float
    load_time: float


class BoundingBoxDict(TypedDict):
    """Bounding box coordinates dictionary."""

    x: float
    y: float
    width: float
    height: float


class DetectionDict(TypedDict):
    """Single detection result dictionary."""

    label: str
    bounding_box: BoundingBoxDict
    confidence: float
    track_id: str | None


class KeyFrameDict(TypedDict, total=False):
    """Key frame information dictionary."""

    frame_number: int
    timestamp: float
    description: str
    confidence: float


class TranscriptSegmentDict(TypedDict, total=False):
    """Audio transcript segment dictionary."""

    text: str
    start: float
    end: float
    speaker: str | None
    confidence: float


class MaskRLEDict(TypedDict):
    """RLE-encoded mask dictionary."""

    size: list[int]
    counts: str | bytes


class TrackingMaskDict(TypedDict):
    """Tracking mask data dictionary."""

    object_id: int
    mask_rle: MaskRLEDict
    confidence: float
    is_occluded: bool


class OntologyTypeDict(TypedDict, total=False):
    """Ontology type suggestion dictionary."""

    name: str
    description: str
    parent: str | None
    confidence: float
    examples: list[str]


class ClaimDict(TypedDict, total=False):
    """Extracted claim dictionary."""

    text: str
    sentence_index: int | None
    char_start: int | None
    char_end: int | None
    subclaims: list["ClaimDict"]
    confidence: float
    claim_type: str | None


class ClaimSourceDict(TypedDict):
    """Claim source dictionary for synthesis."""

    source_id: str
    source_type: str
    claims: list[dict[str, Any]]
    metadata: dict[str, Any] | None


class ClaimRelationDict(TypedDict, total=False):
    """Claim relationship dictionary."""

    source_claim_id: str
    target_claim_id: str
    relation_type: str
    confidence: float
    notes: str | None


class APIUsageDict(TypedDict, total=False):
    """API usage statistics dictionary."""

    input_tokens: int
    output_tokens: int
    total_tokens: int
    model: str
    latency_ms: float


class ExternalAPIResponseDict(TypedDict):
    """External API response dictionary."""

    content: str
    usage: APIUsageDict
    model: str
    provider: str


class DeviceConfigDict(TypedDict, total=False):
    """Device configuration dictionary."""

    device: str
    cpu_threads: int
    memory_limit_gb: float | None
    use_onnx: bool
    use_openvino: bool
