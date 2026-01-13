"""ML model adapters.

This package contains outbound adapters for ML model inference.
Each subpackage implements the corresponding outbound port interface
for a specific model type.

Subpackages
-----------
vlm
    Vision-language model adapters (Qwen, Llama, Gemma, InternVL, etc.).
llm
    Language model adapters for text generation.
detection
    Object detection model adapters (YOLO-World, GroundingDINO, etc.).
tracking
    Video tracking model adapters (SAM2, SAMURAI, etc.).
audio
    Audio transcription model adapters (Whisper, faster-whisper).
onnx
    ONNX Runtime model adapters for CPU inference.
ctranslate2
    CTranslate2 model adapters for optimized CPU inference.
"""

from src.infrastructure.adapters.outbound.models import (
    audio,
    detection,
    llm,
    tracking,
    vlm,
)

__all__ = [
    "vlm",
    "llm",
    "detection",
    "tracking",
    "audio",
]
