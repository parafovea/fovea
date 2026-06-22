"""OWLv2 open-vocabulary detection loader."""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

import torch

from src.domain.entities.architectures import OWLv2
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


@detection_pytorch_registry.register(OWLv2)
class OWLv2Loader(DetectionModelLoader):
    """Loader for OWLv2 open-vocabulary detection model.

    OWLv2 uses scaled training data and achieves strong performance
    on rare and novel object classes.
    """

    def load(self) -> None:
        """Load OWLv2 model with configured settings."""
        try:
            from transformers import Owlv2ForObjectDetection, Owlv2Processor

            logger.info(f"Loading OWLv2 from {self.config.model_id}")

            self.processor = Owlv2Processor.from_pretrained(
                self.config.model_id,
                cache_dir=str(self.config.cache_dir) if self.config.cache_dir else None,
            )

            self.model = Owlv2ForObjectDetection.from_pretrained(
                self.config.model_id,
                cache_dir=str(self.config.cache_dir) if self.config.cache_dir else None,
            )

            if torch.cuda.is_available():
                self.model.to(self.config.device)

            self.model.eval()

            logger.info("OWLv2 loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load OWLv2: {e}")
            raise RuntimeError(f"Model loading failed: {e}") from e

    @instrument_method(task="detect")
    def detect(
        self,
        image: Image.Image,
        text_prompt: str,
    ) -> DetectionResult:
        """Detect objects using OWLv2 with text prompts."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        try:
            start_time = time.time()

            width, height = image.size

            text_queries = [c.strip() for c in text_prompt.split(".") if c.strip()]

            inputs = self.processor(text=text_queries, images=image, return_tensors="pt")
            inputs = {k: v.to(self.config.device) for k, v in inputs.items()}

            with torch.no_grad():
                outputs = self.model(**inputs)

            target_sizes = torch.tensor([[height, width]]).to(self.config.device)
            results = self.processor.post_process_object_detection(
                outputs=outputs,
                threshold=self.config.confidence_threshold,
                target_sizes=target_sizes,
            )[0]

            detections = []
            for box, score, label_idx in zip(
                results["boxes"], results["scores"], results["labels"], strict=False
            ):
                x1, y1, x2, y2 = box.cpu().numpy()

                bbox = BoundingBox(
                    x1=float(x1) / width,
                    y1=float(y1) / height,
                    x2=float(x2) / width,
                    y2=float(y2) / height,
                )

                label = text_queries[int(label_idx)]

                detections.append(Detection(bbox=bbox, confidence=float(score), label=label))

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
