"""Florence-2 unified vision model detection loader."""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

import torch

from src.domain.entities.architectures import Florence2Detection
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


@detection_pytorch_registry.register(Florence2Detection)
class Florence2Loader(DetectionModelLoader):
    """Loader for Florence-2 unified vision model.

    Florence-2 is a 230M parameter model that supports multiple vision tasks
    including object detection, captioning, and grounding.
    """

    def load(self) -> None:
        """Load Florence-2 model with configured settings."""
        try:
            from transformers import (
                AutoModelForCausalLM,
                AutoProcessor,
            )

            logger.info(f"Loading Florence-2 from {self.config.model_id}")

            self.processor = AutoProcessor.from_pretrained(
                self.config.model_id,
                cache_dir=str(self.config.cache_dir) if self.config.cache_dir else None,
                trust_remote_code=True,
            )

            self.model = AutoModelForCausalLM.from_pretrained(
                self.config.model_id,
                cache_dir=str(self.config.cache_dir) if self.config.cache_dir else None,
                trust_remote_code=True,
                torch_dtype=torch.float16,
            )

            if torch.cuda.is_available():
                self.model.to(self.config.device)

            self.model.eval()

            logger.info("Florence-2 loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Florence-2: {e}")
            raise RuntimeError(f"Model loading failed: {e}") from e

    @instrument_method(task="detect")
    def detect(
        self,
        image: Image.Image,
        text_prompt: str,
    ) -> DetectionResult:
        """Detect objects using Florence-2 with text prompts."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        try:
            start_time = time.time()

            width, height = image.size

            task_prompt = f"<CAPTION_TO_PHRASE_GROUNDING>{text_prompt}"

            inputs = self.processor(text=task_prompt, images=image, return_tensors="pt")
            inputs = {k: v.to(self.config.device) for k, v in inputs.items()}

            with torch.no_grad():
                outputs = self.model.generate(
                    **inputs,
                    max_new_tokens=1024,
                    num_beams=3,
                )

            result = self.processor.batch_decode(outputs, skip_special_tokens=True)[0]

            detections = self._parse_florence_output(result, width, height)

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

    def _parse_florence_output(self, result: str, width: int, height: int) -> list[Detection]:
        """Parse Florence-2 output format into Detection objects.

        Parameters
        ----------
        result : str
            Model output string containing bounding boxes and labels.
        width : int
            Image width for normalization.
        height : int
            Image height for normalization.

        Returns
        -------
        list[Detection]
            Parsed detections with normalized coordinates.
        """
        detections = []

        try:
            import json

            data = json.loads(result)

            if "bboxes" in data and "labels" in data:
                for bbox, label in zip(data["bboxes"], data["labels"], strict=False):
                    x1, y1, x2, y2 = bbox

                    normalized_bbox = BoundingBox(
                        x1=float(x1) / width,
                        y1=float(y1) / height,
                        x2=float(x2) / width,
                        y2=float(y2) / height,
                    )

                    detections.append(
                        Detection(
                            bbox=normalized_bbox,
                            confidence=1.0,
                            label=label,
                        )
                    )
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            logger.warning(f"Failed to parse Florence-2 output: {e}")

        return detections
