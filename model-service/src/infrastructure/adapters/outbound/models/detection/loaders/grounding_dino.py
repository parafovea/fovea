"""Grounding DINO 1.5 open-vocabulary detection loader."""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

import numpy as np
import torch

from src.domain.entities.architectures import GroundingDINO
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


@detection_pytorch_registry.register(GroundingDINO)
class GroundingDINOLoader(DetectionModelLoader):
    """Loader for Grounding DINO 1.5 open-vocabulary detection model.

    Grounding DINO 1.5 achieves 52.5 AP on COCO with zero-shot open-world
    object detection capabilities.
    """

    def load(self) -> None:
        """Load Grounding DINO 1.5 model with configured settings."""
        try:
            from groundingdino.util.inference import load_model

            logger.info(f"Loading Grounding DINO 1.5 from {self.config.model_id}")

            config_path = "GroundingDINO/groundingdino/config/GroundingDINO_SwinT_OGC.py"
            weights_path = self.config.model_id

            self.model = load_model(config_path, weights_path)

            if torch.cuda.is_available():
                self.model.to(self.config.device)

            logger.info("Grounding DINO 1.5 loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Grounding DINO 1.5: {e}")
            raise RuntimeError(f"Model loading failed: {e}") from e

    @instrument_method(task="detect")
    def detect(
        self,
        image: Image.Image,
        text_prompt: str,
    ) -> DetectionResult:
        """Detect objects using Grounding DINO 1.5 with text prompts."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        try:
            from groundingdino.util.inference import predict

            start_time = time.time()

            image_array = np.array(image)
            height, width = image_array.shape[:2]

            boxes, logits, phrases = predict(
                model=self.model,
                image=image,
                caption=text_prompt,
                box_threshold=self.config.confidence_threshold,
                text_threshold=0.25,
            )

            detections = []
            for box, conf, phrase in zip(boxes, logits, phrases, strict=False):
                x_center, y_center, w, h = box.cpu().numpy()

                x1 = float(x_center - w / 2)
                y1 = float(y_center - h / 2)
                x2 = float(x_center + w / 2)
                y2 = float(y_center + h / 2)

                bbox = BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2)

                detections.append(Detection(bbox=bbox, confidence=float(conf), label=phrase))

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
