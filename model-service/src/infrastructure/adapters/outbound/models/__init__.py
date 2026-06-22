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

Model subpackages are imported by their concrete paths rather than
re-exported here, so importing one model adapter (for example
``models.detection.loader``) does not force-load every sibling model
subpackage and its heavy ML dependencies.
"""

__all__: list[str] = []
