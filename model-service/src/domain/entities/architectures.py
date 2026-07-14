"""Model architecture domain entities.

Each architecture is a :class:`didactic.api.TaggedUnion` variant with a
``kind`` literal discriminator. The single :class:`Architecture` root parses
a YAML config like ``architecture: {kind: "smolvlm"}`` into the right
subclass, and a loader factory can dispatch on its concrete type.

Architectures are PURE DATA. They never carry runtime model paths,
session handles, or weights; those live on the loader implementations
the registry resolves them to. They never describe a specific weights
checkpoint either; that is what ``ModelConfig.model_id`` is for. An
architecture only names a family of models that the same loader class
can drive (e.g. every ``yolov8*-worldv2`` weights checkpoint is a
``YOLOWorld`` architecture and is run by ``YOLOWorldLoader``).

Per-architecture hyperparameters belong on their own subclass and ONLY
flow to the loader that consumes them. The default classes carry only
the discriminator. Add fields to a single subclass without touching any
other architecture.

The dispatch flow is:

    yaml -> ModelConfig.architecture -> type(arch) -> registry.lookup -> Loader

No code along that path may match on model-id substrings, on
``model_id`` itself, on weights filenames, or on user-supplied free
text. The Architecture class is the only legitimate dispatch key.

Parsing a YAML architecture block is a single call::

    arch = Architecture.model_validate({"kind": "smolvlm"})

Unknown ``kind`` values and malformed blocks raise loudly, so a
misconfigured catalog fails fast at load time rather than at dispatch.
"""

from __future__ import annotations

from typing import Literal

import didactic.api as dx


class Architecture(dx.TaggedUnion, discriminator="kind"):
    """Discriminated-union root over every architecture family.

    Every concrete architecture below is a variant of this root, keyed by
    its ``kind`` literal. ``Architecture.model_validate({"kind": ...})``
    dispatches to the matching variant regardless of family.
    """


# ---------------------------------------------------------------------------
# Vision-language architectures
#
# Each entry below corresponds to a class of VLMs the model-service can
# load via a single loader implementation. The mapping from architecture
# subclass to loader class is established in the loader module via
# the ``@vlm_registry.register(...)`` decorator.
# ---------------------------------------------------------------------------


class SmolVLM(Architecture):
    """SmolVLM family (HuggingFaceTB), transformers backend, CPU-runnable."""

    kind: Literal["smolvlm"] = "smolvlm"


class Moondream(Architecture):
    """Moondream family (vikhyat), transformers backend, CPU-runnable."""

    kind: Literal["moondream"] = "moondream"


class QwenVL(Architecture):
    """Qwen2.5-VL family, sglang / transformers / llama_cpp depending on quant."""

    kind: Literal["qwen2.5-vl"] = "qwen2.5-vl"


class Qwen3VL(Architecture):
    """Qwen3-VL family, the 2026 successor with 256K-1M context."""

    kind: Literal["qwen3-vl"] = "qwen3-vl"


class Gemma3VL(Architecture):
    """Gemma 3 multimodal family."""

    kind: Literal["gemma-3"] = "gemma-3"


class InternVL3(Architecture):
    """InternVL3 family."""

    kind: Literal["internvl3"] = "internvl3"


class Pixtral(Architecture):
    """Pixtral family (Mistral)."""

    kind: Literal["pixtral"] = "pixtral"


class Llama4Maverick(Architecture):
    """Llama-4 Maverick multimodal family."""

    kind: Literal["llama-4-maverick"] = "llama-4-maverick"


class Tarsier2(Architecture):
    """Tarsier 2 video VLM family."""

    kind: Literal["tarsier-2"] = "tarsier-2"


# External-API VLM architectures. These tag YAML entries that route
# through the external-API adapter layer rather than the local VLM
# registry. No loader registers against them; if one ever reaches
# the registry that is a route bug and the lookup raises
# UnknownArchitectureError with the registered local VLM list.
# Distinct from the LLM external-API architectures because the VLM
# request payload carries images and the API client wraps them
# differently (Anthropic vision messages, OpenAI image content parts,
# Gemini inlineData parts).


class ClaudeVisionAPI(Architecture):
    """Anthropic Claude vision messages API family."""

    kind: Literal["claude-vision-api"] = "claude-vision-api"


class OpenAIVisionAPI(Architecture):
    """OpenAI chat-completions API family with vision-capable models."""

    kind: Literal["openai-vision-api"] = "openai-vision-api"


class GeminiVisionAPI(Architecture):
    """Google Gemini generateContent API family with vision-capable models."""

    kind: Literal["gemini-vision-api"] = "gemini-vision-api"


class GrokVisionAPI(Architecture):
    """xAI Grok chat-completions API family with vision-capable models."""

    kind: Literal["grok-vision-api"] = "grok-vision-api"


VLMArchitecture = (
    SmolVLM
    | Moondream
    | QwenVL
    | Qwen3VL
    | Gemma3VL
    | InternVL3
    | Pixtral
    | Llama4Maverick
    | Tarsier2
    | ClaudeVisionAPI
    | OpenAIVisionAPI
    | GeminiVisionAPI
    | GrokVisionAPI
)
"""Type alias for every VLM family the service can load.

Add a new architecture by (a) defining its :class:`Architecture` subclass
above with a unique ``kind`` literal and any hyperparameters it needs,
(b) adding it to this alias, and (c) writing the corresponding loader class
with ``@vlm_registry.register(NewVLM)``.
"""


# ---------------------------------------------------------------------------
# Large-language-model architectures (text-only)
# ---------------------------------------------------------------------------


class QwenLLM(Architecture):
    """Qwen text-only LLM family (Qwen2.5, Qwen3, Qwen3.5)."""

    kind: Literal["qwen-llm"] = "qwen-llm"


class Phi(Architecture):
    """Microsoft Phi-3 / Phi-4 family."""

    kind: Literal["phi"] = "phi"


class DeepSeekR1Distill(Architecture):
    """DeepSeek-R1 distilled student model family."""

    kind: Literal["deepseek-r1-distill"] = "deepseek-r1-distill"


class DeepSeekV3LLM(Architecture):
    """DeepSeek V3 / V3.2 mixture-of-experts text family."""

    kind: Literal["deepseek-v3"] = "deepseek-v3"


class Llama3LLM(Architecture):
    """Llama 3 / 3.1 / 3.2 / 3.3 text-only family."""

    kind: Literal["llama-3"] = "llama-3"


class Llama4LLM(Architecture):
    """Llama-4 (Scout / Maverick) text-mode MoE family.

    Used when the Llama-4 checkpoint is loaded for text-only generation
    (ontology augmentation, claim extraction, claim synthesis); the
    multimodal vision pathway uses :class:`Llama4Maverick` under the
    VLM family.
    """

    kind: Literal["llama-4-llm"] = "llama-4-llm"


class Gemma3LLM(Architecture):
    """Gemma 3 text-mode family (gemma-3-*-it consumed as a text LLM)."""

    kind: Literal["gemma-3-llm"] = "gemma-3-llm"


class KimiK2(Architecture):
    """Moonshot Kimi K2 family."""

    kind: Literal["kimi-k2"] = "kimi-k2"


class GLM4(Architecture):
    """THUDM GLM-4 family."""

    kind: Literal["glm-4"] = "glm-4"


# External-API LLM architectures.
#
# These tag YAML entries that route through ``manager.is_external_api(...)``
# rather than the local loader registry. Carrying an explicit architecture
# on every YAML option keeps the schema uniform and lets the orchestrator
# tighten ``ModelConfig.architecture`` to a required field. No loader
# registers against these classes; if one ever reaches ``llm_registry``
# (a route bug) it raises ``UnknownArchitectureError`` loudly, which is
# the desired fail-loud behaviour.


class ClaudeAPI(Architecture):
    """Anthropic Claude messages API family."""

    kind: Literal["claude-api"] = "claude-api"


class OpenAIChat(Architecture):
    """OpenAI chat-completions API family (GPT-4o, GPT-5.x)."""

    kind: Literal["openai-chat"] = "openai-chat"


class GeminiAPI(Architecture):
    """Google Gemini generateContent API family."""

    kind: Literal["gemini-api"] = "gemini-api"


class GrokAPI(Architecture):
    """xAI Grok chat-completions API family."""

    kind: Literal["grok-api"] = "grok-api"


LLMArchitecture = (
    QwenLLM
    | Phi
    | DeepSeekR1Distill
    | DeepSeekV3LLM
    | Llama3LLM
    | Llama4LLM
    | Gemma3LLM
    | KimiK2
    | GLM4
    | ClaudeAPI
    | OpenAIChat
    | GeminiAPI
    | GrokAPI
)
"""Type alias for every text-only LLM family the service can load."""


# ---------------------------------------------------------------------------
# Object-detection architectures
# ---------------------------------------------------------------------------


class YOLOWorld(Architecture):
    """YOLO-World open-vocabulary detection family.

    Covers every yolov8*-worldv2 weights checkpoint regardless of which
    size suffix the checkpoint uses. Per-architecture hyperparameters
    (confidence threshold, IoU threshold, image size) can be added here
    without touching any other architecture or its loader.
    """

    kind: Literal["yolo-world"] = "yolo-world"


class YOLOE(Architecture):
    """YOLOE early-fusion detection family."""

    kind: Literal["yoloe"] = "yoloe"


class YOLOv12(Architecture):
    """YOLOv12 family."""

    kind: Literal["yolov12"] = "yolov12"


class RFDETR(Architecture):
    """Roboflow DETR (RF-DETR) family."""

    kind: Literal["rf-detr"] = "rf-detr"


class GroundingDINO(Architecture):
    """Grounding DINO open-vocabulary detection family."""

    kind: Literal["grounding-dino"] = "grounding-dino"


class OWLv2(Architecture):
    """OWL-v2 open-vocabulary detection family."""

    kind: Literal["owl-v2"] = "owl-v2"


class Florence2Detection(Architecture):
    """Florence-2 detection-mode family."""

    kind: Literal["florence-2"] = "florence-2"


class SAM3Detection(Architecture):
    """Meta SAM 3.1 detection-mode family.

    SAM 3.1 doubles as a detection and tracking architecture; the
    detection adapter lives outside the detection-loader registry
    because its API surface (Object Multiplex prompts, shared memory)
    differs from open-vocabulary detection. The architecture is
    declared here so every YAML entry carries an ``architecture:``
    block; no loader in the local detection registries registers
    against it (a framework-level pre-dispatch selects the SAM 3.1
    adapter before the architecture-keyed registry is consulted).
    """

    kind: Literal["sam-3-1-detection"] = "sam-3-1-detection"


DetectionArchitecture = (
    YOLOWorld
    | YOLOE
    | YOLOv12
    | RFDETR
    | GroundingDINO
    | OWLv2
    | Florence2Detection
    | SAM3Detection
)
"""Type alias for every object-detection family the service can load."""


# ---------------------------------------------------------------------------
# Tracking architectures
# ---------------------------------------------------------------------------


class SAMURAI(Architecture):
    """SAMURAI tracking family."""

    kind: Literal["samurai"] = "samurai"


class SAM2Long(Architecture):
    """SAM2-Long tracking family."""

    kind: Literal["sam2-long"] = "sam2-long"


class SAM2(Architecture):
    """SAM2 tracking family."""

    kind: Literal["sam2"] = "sam2"


class YOLO11Seg(Architecture):
    """Ultralytics YOLO11 segmentation family used as a tracking head."""

    kind: Literal["yolo11-seg"] = "yolo11-seg"


class SAM3Tracking(Architecture):
    """Meta SAM 3.1 tracking family (Object Multiplex, shared memory).

    The SAM 3.1 loader lives outside the tracking-family registry because
    its loading conventions are independent (shared-memory multi-object
    state, dedicated adapter); it is selected by a framework-level
    pre-dispatch on ``framework == "sam3"`` in the task factory, before
    the architecture-keyed registry is consulted. The architecture is
    nonetheless declared here so every YAML entry carries an
    ``architecture:`` block; no loader registers against it.
    """

    kind: Literal["sam-3-1"] = "sam-3-1"


TrackingArchitecture = SAMURAI | SAM2Long | SAM2 | YOLO11Seg | SAM3Tracking
"""Type alias for every tracking family the service can load."""


# ---------------------------------------------------------------------------
# Audio (transcription / diarization) architectures
# ---------------------------------------------------------------------------


class Whisper(Architecture):
    """OpenAI Whisper family (openai-whisper backend)."""

    kind: Literal["whisper"] = "whisper"


class FasterWhisper(Architecture):
    """faster-whisper backend over Whisper checkpoints."""

    kind: Literal["faster-whisper"] = "faster-whisper"


class WhisperX(Architecture):
    """WhisperX backend over Whisper checkpoints."""

    kind: Literal["whisperx"] = "whisperx"


class NemoCanary(Architecture):
    """NVIDIA NeMo Canary-Qwen family."""

    kind: Literal["nemo-canary"] = "nemo-canary"


class NemoParakeet(Architecture):
    """NVIDIA NeMo Parakeet-TDT family."""

    kind: Literal["nemo-parakeet"] = "nemo-parakeet"


# External-API audio architectures.
#
# These marker architectures describe audio transcription services that
# live behind a vendor HTTP API rather than a local loader. They are part
# of the discriminated union so YAML entries with ``framework: external_api``
# still carry a typed architecture block, but they are intentionally NOT
# registered with ``audio_registry``; their dispatch flows through the
# external API router at the application layer (which short-circuits on
# ``ModelConfig.is_external_api`` before any loader factory is consulted).
# Asking the audio loader registry to resolve one of these raises
# :class:`UnknownArchitectureError` with a clear "registered architectures"
# list so a misconfiguration that bypasses the external-API path fails
# loudly instead of silently falling back to a local Whisper run.


class AssemblyAI(Architecture):
    """AssemblyAI Universal cloud transcription family."""

    kind: Literal["assemblyai"] = "assemblyai"


class Deepgram(Architecture):
    """Deepgram Nova cloud transcription family."""

    kind: Literal["deepgram"] = "deepgram"


class RevAI(Architecture):
    """Rev AI cloud speech-to-text family."""

    kind: Literal["revai"] = "revai"


class Gladia(Architecture):
    """Gladia cloud transcription family."""

    kind: Literal["gladia"] = "gladia"


class AWSTranscribe(Architecture):
    """AWS Transcribe cloud speech-to-text family."""

    kind: Literal["aws-transcribe"] = "aws-transcribe"


class GoogleSpeech(Architecture):
    """Google Cloud Speech-to-Text family."""

    kind: Literal["google-speech"] = "google-speech"


class AzureSpeech(Architecture):
    """Azure Cognitive Services Speech family."""

    kind: Literal["azure-speech"] = "azure-speech"


# Diarization / voice-activity architectures are tracked alongside the
# transcription architectures because they share the audio-task surface
# of the model-service. Diarization and VAD use entirely different
# adapter classes (PyannoteLoader / SileroVADLoader) than the transcription
# loaders and are routed through task-specific factories rather than
# audio_registry; carrying their architectures here keeps every YAML
# entry across the audio task sections schema-uniform.


class PyannoteDiarization(Architecture):
    """pyannote.audio speaker diarization family."""

    kind: Literal["pyannote-diarization"] = "pyannote-diarization"


class SileroVAD(Architecture):
    """Silero voice-activity-detection family."""

    kind: Literal["silero-vad"] = "silero-vad"


AudioArchitecture = (
    Whisper
    | FasterWhisper
    | WhisperX
    | NemoCanary
    | NemoParakeet
    | AssemblyAI
    | Deepgram
    | RevAI
    | Gladia
    | AWSTranscribe
    | GoogleSpeech
    | AzureSpeech
    | PyannoteDiarization
    | SileroVAD
)
"""Type alias for every audio family the service can load."""


__all__ = [
    "GLM4",
    "RFDETR",
    "SAM2",
    "SAMURAI",
    "YOLOE",
    "AWSTranscribe",
    "Architecture",
    "AssemblyAI",
    "AudioArchitecture",
    "AzureSpeech",
    "ClaudeAPI",
    "DeepSeekR1Distill",
    "DeepSeekV3LLM",
    "Deepgram",
    "DetectionArchitecture",
    "FasterWhisper",
    "Florence2Detection",
    "GeminiAPI",
    "Gemma3LLM",
    "Gemma3VL",
    "Gladia",
    "GoogleSpeech",
    "GrokAPI",
    "GroundingDINO",
    "InternVL3",
    "KimiK2",
    "LLMArchitecture",
    "Llama3LLM",
    "Llama4LLM",
    "Llama4Maverick",
    "Moondream",
    "NemoCanary",
    "NemoParakeet",
    "OWLv2",
    "OpenAIChat",
    "Phi",
    "Pixtral",
    "Qwen3VL",
    "QwenLLM",
    "QwenVL",
    "RevAI",
    "SAM2Long",
    "SAM3Tracking",
    "SmolVLM",
    "Tarsier2",
    "TrackingArchitecture",
    "VLMArchitecture",
    "Whisper",
    "WhisperX",
    "YOLO11Seg",
    "YOLOWorld",
    "YOLOv12",
]
