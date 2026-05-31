"""Model architecture domain entities.

Each architecture is a Pydantic model with a ``kind`` literal discriminator.
Family-level :class:`Annotated` unions tag those discriminators so a YAML
config like ``architecture: {kind: "smolvlm"}`` parses into the right
subclass and a loader factory can dispatch on its concrete type.

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
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field


class _ArchitectureBase(BaseModel):
    """Shared base for every architecture model.

    Pydantic config is locked down so a typo in YAML
    (e.g. ``kindd: "smolvlm"``) raises rather than silently parsing as
    an empty model, and so each architecture's hyperparameters are
    typed and validated end-to-end.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)


# ---------------------------------------------------------------------------
# Vision-language architectures
#
# Each entry below corresponds to a class of VLMs the model-service can
# load via a single loader implementation. The mapping from architecture
# subclass to loader class is established in the loader module via
# the ``@vlm_registry.register(...)`` decorator.
# ---------------------------------------------------------------------------


class SmolVLM(_ArchitectureBase):
    """SmolVLM family (HuggingFaceTB), transformers backend, CPU-runnable."""

    kind: Literal["smolvlm"] = "smolvlm"


class Moondream(_ArchitectureBase):
    """Moondream family (vikhyat), transformers backend, CPU-runnable."""

    kind: Literal["moondream"] = "moondream"


class QwenVL(_ArchitectureBase):
    """Qwen2.5-VL family, sglang / transformers / llama_cpp depending on quant."""

    kind: Literal["qwen2.5-vl"] = "qwen2.5-vl"


class Qwen3VL(_ArchitectureBase):
    """Qwen3-VL family, the 2026 successor with 256K-1M context."""

    kind: Literal["qwen3-vl"] = "qwen3-vl"


class Gemma3VL(_ArchitectureBase):
    """Gemma 3 multimodal family."""

    kind: Literal["gemma-3"] = "gemma-3"


class InternVL3(_ArchitectureBase):
    """InternVL3 family."""

    kind: Literal["internvl3"] = "internvl3"


class Pixtral(_ArchitectureBase):
    """Pixtral family (Mistral)."""

    kind: Literal["pixtral"] = "pixtral"


class Llama4Maverick(_ArchitectureBase):
    """Llama-4 Maverick multimodal family."""

    kind: Literal["llama-4-maverick"] = "llama-4-maverick"


class Tarsier2(_ArchitectureBase):
    """Tarsier 2 video VLM family."""

    kind: Literal["tarsier-2"] = "tarsier-2"


VLMArchitecture = Annotated[
    Union[  # noqa: UP007 (Pydantic Annotated unions on 3.12 still need explicit Union)
        SmolVLM,
        Moondream,
        QwenVL,
        Qwen3VL,
        Gemma3VL,
        InternVL3,
        Pixtral,
        Llama4Maverick,
        Tarsier2,
    ],
    Field(discriminator="kind"),
]
"""Discriminated union of every VLM family the service can load.

Add a new architecture by (a) defining its Pydantic subclass above with
a unique ``kind`` literal and any hyperparameters it needs, (b) adding
it to this union, and (c) writing the corresponding loader class with
``@vlm_registry.register(NewVLM)``.
"""


# ---------------------------------------------------------------------------
# Large-language-model architectures (text-only)
# ---------------------------------------------------------------------------


class QwenLLM(_ArchitectureBase):
    """Qwen text-only LLM family (Qwen2.5, Qwen3)."""

    kind: Literal["qwen-llm"] = "qwen-llm"


class Phi(_ArchitectureBase):
    """Microsoft Phi-3 / Phi-4 family."""

    kind: Literal["phi"] = "phi"


class DeepSeekR1Distill(_ArchitectureBase):
    """DeepSeek-R1 distilled student model family."""

    kind: Literal["deepseek-r1-distill"] = "deepseek-r1-distill"


class Llama3LLM(_ArchitectureBase):
    """Llama 3 / 3.1 / 3.2 text-only family."""

    kind: Literal["llama-3"] = "llama-3"


LLMArchitecture = Annotated[
    Union[QwenLLM, Phi, DeepSeekR1Distill, Llama3LLM],  # noqa: UP007
    Field(discriminator="kind"),
]


# ---------------------------------------------------------------------------
# Object-detection architectures
# ---------------------------------------------------------------------------


class YOLOWorld(_ArchitectureBase):
    """YOLO-World open-vocabulary detection family.

    Covers every yolov8*-worldv2 weights checkpoint regardless of which
    size suffix the checkpoint uses. Per-architecture hyperparameters
    (confidence threshold, IoU threshold, image size) can be added here
    without touching any other architecture or its loader.
    """

    kind: Literal["yolo-world"] = "yolo-world"


class YOLOE(_ArchitectureBase):
    """YOLOE early-fusion detection family."""

    kind: Literal["yoloe"] = "yoloe"


class YOLOv12(_ArchitectureBase):
    """YOLOv12 family."""

    kind: Literal["yolov12"] = "yolov12"


class RFDETR(_ArchitectureBase):
    """Roboflow DETR (RF-DETR) family."""

    kind: Literal["rf-detr"] = "rf-detr"


class GroundingDINO(_ArchitectureBase):
    """Grounding DINO open-vocabulary detection family."""

    kind: Literal["grounding-dino"] = "grounding-dino"


class OWLv2(_ArchitectureBase):
    """OWL-v2 open-vocabulary detection family."""

    kind: Literal["owl-v2"] = "owl-v2"


class Florence2Detection(_ArchitectureBase):
    """Florence-2 detection-mode family."""

    kind: Literal["florence-2"] = "florence-2"


DetectionArchitecture = Annotated[
    Union[  # noqa: UP007
        YOLOWorld,
        YOLOE,
        YOLOv12,
        RFDETR,
        GroundingDINO,
        OWLv2,
        Florence2Detection,
    ],
    Field(discriminator="kind"),
]


# ---------------------------------------------------------------------------
# Tracking architectures
# ---------------------------------------------------------------------------


class SAMURAI(_ArchitectureBase):
    """SAMURAI tracking family."""

    kind: Literal["samurai"] = "samurai"


class SAM2Long(_ArchitectureBase):
    """SAM2-Long tracking family."""

    kind: Literal["sam2-long"] = "sam2-long"


class SAM2(_ArchitectureBase):
    """SAM2 tracking family."""

    kind: Literal["sam2"] = "sam2"


class YOLO11Seg(_ArchitectureBase):
    """Ultralytics YOLO11 segmentation family used as a tracking head."""

    kind: Literal["yolo11-seg"] = "yolo11-seg"


TrackingArchitecture = Annotated[
    Union[SAMURAI, SAM2Long, SAM2, YOLO11Seg],  # noqa: UP007
    Field(discriminator="kind"),
]


# ---------------------------------------------------------------------------
# Audio (transcription / diarization) architectures
# ---------------------------------------------------------------------------


class Whisper(_ArchitectureBase):
    """OpenAI Whisper family (openai-whisper backend)."""

    kind: Literal["whisper"] = "whisper"


class FasterWhisper(_ArchitectureBase):
    """faster-whisper backend over Whisper checkpoints."""

    kind: Literal["faster-whisper"] = "faster-whisper"


class WhisperX(_ArchitectureBase):
    """WhisperX backend over Whisper checkpoints."""

    kind: Literal["whisperx"] = "whisperx"


class NemoCanary(_ArchitectureBase):
    """NVIDIA NeMo Canary-Qwen family."""

    kind: Literal["nemo-canary"] = "nemo-canary"


class NemoParakeet(_ArchitectureBase):
    """NVIDIA NeMo Parakeet-TDT family."""

    kind: Literal["nemo-parakeet"] = "nemo-parakeet"


AudioArchitecture = Annotated[
    Union[Whisper, FasterWhisper, WhisperX, NemoCanary, NemoParakeet],  # noqa: UP007
    Field(discriminator="kind"),
]


# ---------------------------------------------------------------------------
# Family-tagged top-level alias.
#
# Convenience union for code that needs to talk about "an architecture
# from any family" without naming the family up-front (e.g. logging,
# config validation, generic dispatch).
# ---------------------------------------------------------------------------

Architecture = Annotated[
    Union[  # noqa: UP007
        VLMArchitecture,
        LLMArchitecture,
        DetectionArchitecture,
        TrackingArchitecture,
        AudioArchitecture,
    ],
    Field(discriminator="kind"),
]


__all__ = [
    "Architecture",
    "AudioArchitecture",
    "DeepSeekR1Distill",
    "DetectionArchitecture",
    "FasterWhisper",
    "Florence2Detection",
    "Gemma3VL",
    "GroundingDINO",
    "InternVL3",
    "LLMArchitecture",
    "Llama3LLM",
    "Llama4Maverick",
    "Moondream",
    "NemoCanary",
    "NemoParakeet",
    "OWLv2",
    "Phi",
    "Pixtral",
    "Qwen3VL",
    "QwenLLM",
    "QwenVL",
    "RFDETR",
    "SAM2",
    "SAM2Long",
    "SAMURAI",
    "SmolVLM",
    "Tarsier2",
    "TrackingArchitecture",
    "VLMArchitecture",
    "Whisper",
    "WhisperX",
    "YOLO11Seg",
    "YOLOE",
    "YOLOWorld",
    "YOLOv12",
]
