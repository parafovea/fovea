"""YOLO-World v2.1 open-vocabulary detection loader."""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

import numpy as np
import torch

from src.domain.entities.architectures import YOLOWorld
from src.infrastructure.adapters.outbound.models.detection.base import (
    BoundingBox,
    Detection,
    DetectionModelLoader,
    DetectionResult,
)
from src.infrastructure.adapters.outbound.models.detection.loaders.base import (
    detection_pytorch_registry,
)
from src.infrastructure.observability.telemetry import instrument_method

if TYPE_CHECKING:
    from PIL import Image

logger = logging.getLogger(__name__)


@detection_pytorch_registry.register(YOLOWorld)
class YOLOWorldLoader(DetectionModelLoader):
    """Loader for YOLO-World v2.1 open-vocabulary detection model.

    YOLO-World v2.1 achieves real-time performance (52 FPS) with strong
    accuracy on open-vocabulary object detection tasks.
    """

    def load(self) -> None:
        """Load YOLO-World v2.1 model with configured settings."""
        try:
            from ultralytics import YOLO  # type: ignore[attr-defined]

            logger.info(f"Loading YOLO-World v2.1 from {self.config.model_id}")

            self.model = YOLO(self.config.model_id)

            if torch.cuda.is_available():
                self.model.to(self.config.device)

            logger.info("YOLO-World v2.1 loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load YOLO-World v2.1: {e}")
            raise RuntimeError(f"Model loading failed: {e}") from e

    @instrument_method(task="detect")
    def detect(
        self,
        image: Image.Image,
        text_prompt: str,
    ) -> DetectionResult:
        """Detect objects using YOLO-World v2.1 with text prompts."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        try:
            start_time = time.time()

            image_array = np.array(image)
            height, width = image_array.shape[:2]

            self.model.set_classes([c.strip() for c in text_prompt.split(".")])

            results = self.model(image_array, verbose=False)[0]

            detections = []
            if results.boxes is not None:
                for box in results.boxes:
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    conf = float(box.conf[0].cpu().numpy())

                    if conf >= self.config.confidence_threshold:
                        cls_id = int(box.cls[0].cpu().numpy())
                        label = self.model.names[cls_id]

                        bbox = BoundingBox(
                            x1=float(x1) / width,
                            y1=float(y1) / height,
                            x2=float(x2) / width,
                            y2=float(y2) / height,
                        )

                        detections.append(Detection(bbox=bbox, confidence=conf, label=label))

            processing_time = time.time() - start_time

            return DetectionResult(
                detections=detections,
                image_width=width,
                image_height=height,
                processing_time=processing_time,
            )

        except Exception as e:
            logger.error(f"Detection failed: {e}")
            raise RuntimeError(f"Object detection failed: {e}") from e
