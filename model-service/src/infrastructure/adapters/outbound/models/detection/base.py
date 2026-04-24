"""Shared base types for detection model loaders.

Extracted from ``loader.py`` so that implementation modules (yolo_world,
florence, grounding_dino, owlv2) can import ``DetectionModelLoader`` and the
shared DTOs without creating a runtime cycle with the factory functions
defined in ``loader.py``.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING, Any

import torch

if TYPE_CHECKING:
    from pathlib import Path

    from PIL import Image

logger = logging.getLogger(__name__)


class DetectionFramework(StrEnum):
    """Supported detection frameworks for model execution."""

    PYTORCH = "pytorch"
    ULTRALYTICS = "ultralytics"
    TRANSFORMERS = "transformers"
    ONNX = "onnx"


@dataclass
class DetectionConfig:
    """Configuration for object detection model loading and inference."""

    model_id: str
    framework: DetectionFramework = DetectionFramework.PYTORCH
    confidence_threshold: float = 0.25
    device: str = "cuda"
    cache_dir: Path | None = None


@dataclass
class BoundingBox:
    """Bounding box in normalized coordinates."""

    x1: float
    y1: float
    x2: float
    y2: float

    def to_absolute(self, width: int, height: int) -> tuple[int, int, int, int]:
        """Convert normalized coordinates to absolute pixel coordinates."""
        return (
            int(self.x1 * width),
            int(self.y1 * height),
            int(self.x2 * width),
            int(self.y2 * height),
        )


@dataclass
class Detection:
    """Single object detection result."""

    bbox: BoundingBox
    confidence: float
    label: str


@dataclass
class DetectionResult:
    """Detection results for a single image."""

    detections: list[Detection]
    image_width: int
    image_height: int
    processing_time: float


class DetectionModelLoader(ABC):
    """Abstract base class for object detection model loaders."""

    def __init__(self, config: DetectionConfig) -> None:
        self.config = config
        self.model: Any = None

    @abstractmethod
    def load(self) -> None:
        """Load the detection model into memory."""

    @abstractmethod
    def detect(self, image: Image.Image, text_prompt: str) -> DetectionResult:
        """Detect objects in an image based on text prompt."""

    def unload(self) -> None:
        """Unload the model from memory to free GPU resources."""
        if self.model is not None:
            del self.model
            self.model = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("Detection model unloaded and memory cleared")
