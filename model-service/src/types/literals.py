"""Literal type definitions for the model service.

This module defines Literal types that constrain string values to specific
enumerated options, providing compile-time type safety for configuration
values, API parameters, and framework identifiers.
"""

from typing import Literal

# Task types supported by the model service
TaskType = Literal[
    "video_summarization",
    "ontology_augmentation",
    "object_detection",
    "video_tracking",
    "audio_transcription",
    "speaker_diarization",
    "voice_activity_detection",
    "claim_extraction",
    "claim_synthesis",
]

# Inference frameworks for local model loading
InferenceFramework = Literal[
    "sglang",
    "vllm",
    "pytorch",
    "transformers",
    "ultralytics",
    "whisper",
    "faster_whisper",
    "pyannote",
    "onnx",
    "openvino",
    "external_api",
]

# Quantization methods for model compression
Quantization = Literal[
    "none",
    "4bit",
    "8bit",
    "int4",
    "int8",
    "awq",
    "gptq",
    "bnb_4bit",
    "bnb_8bit",
]

# External API providers
ExternalAPIProvider = Literal[
    "anthropic",
    "openai",
    "google",
    "assemblyai",
    "deepgram",
    "revai",
    "gladia",
    "aws",
    "azure",
]

# Ontology category types for augmentation
OntologyCategory = Literal[
    "entity",
    "event",
    "role",
    "relation",
]

# Audio-visual fusion strategies
FusionStrategy = Literal[
    "sequential",
    "timestamp_aligned",
    "native_multimodal",
    "hybrid",
]

# Claim extraction strategies
ClaimExtractionStrategy = Literal[
    "sentence-based",
    "semantic-units",
    "hierarchical",
]

# Summary synthesis strategies
SynthesisStrategy = Literal[
    "hierarchical",
    "chronological",
    "narrative",
    "analytical",
]

# Claim relationship types
ClaimRelationType = Literal[
    "supports",
    "conflicts_with",
    "contradicts",
    "refines",
    "generalizes",
    "duplicates",
]

# Model speed categories
SpeedCategory = Literal[
    "real_time",
    "very_fast",
    "fast",
    "moderate",
    "medium",
    "slow",
]

# Thumbnail size presets
ThumbnailSize = Literal[
    "small",
    "medium",
    "large",
]

# Device types for inference
DeviceType = Literal[
    "cpu",
    "cuda",
    "mps",
]

# Claim source types
ClaimSourceType = Literal[
    "video",
    "collection",
]
