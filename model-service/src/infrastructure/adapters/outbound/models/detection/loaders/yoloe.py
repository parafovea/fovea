"""YOLOE open-vocabulary detection loader."""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

import numpy as np
import torch

from src.domain.entities.architectures import YOLOE
from src.infrastructure.adapters.outbound.models.detection.base import (
    BoundingBox,
    Detection,
    DetectionModelLoader,
    DetectionResult,
)
from src.infrastructure.adapters.outbound.models.detection.loaders.base import (
    YOLOE_INSTALL_HINT,
    detection_pytorch_registry,
)
from src.infrastructure.observability.telemetry import instrument_method

if TYPE_CHECKING:
    from PIL import Image

logger = logging.getLogger(__name__)


@detection_pytorch_registry.register(YOLOE)
class YOLOELoader(DetectionModelLoader):
    """Loader for YOLOE open-vocabulary detection via Ultralytics."""

    def load(self) -> None:
        """Load YOLOE via ``ultralytics.YOLOE``."""
        try:
            import ultralytics
        except ImportError as exc:
            raise ImportError(YOLOE_INSTALL_HINT) from exc

        yoloe_cls = getattr(ultralytics, "YOLOE", None)
        if yoloe_cls is None:
            raise ImportError(YOLOE_INSTALL_HINT)

        logger.info("Loading YOLOE from %s", self.config.model_id)
        self.model = yoloe_cls(self.config.model_id)
        if torch.cuda.is_available():
            self.model.to(self.config.device)

    @instrument_method(task="detect")
    def detect(
        self,
        image: Image.Image,
        text_prompt: str,
    ) -> DetectionResult:
        """Run YOLOE open-vocabulary detection."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        start_time = time.time()
        image_array = np.array(image)
        height, width = image_array.shape[:2]

        classes = [c.strip() for c in text_prompt.split(".") if c.strip()]
        if classes and hasattr(self.model, "set_classes"):
            self.model.set_classes(classes)

        results = self.model(image_array, verbose=False)[0]
        detections: list[Detection] = []
        if results.boxes is not None:
            for box in results.boxes:
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                conf = float(box.conf[0].cpu().numpy())
                if conf < self.config.confidence_threshold:
                    continue
                cls_id = int(box.cls[0].cpu().numpy())
                label = (
                    classes[cls_id]
                    if classes and 0 <= cls_id < len(classes)
                    else str(self.model.names.get(cls_id, cls_id))
                )
                bbox = BoundingBox(
                    x1=float(x1) / width,
                    y1=float(y1) / height,
                    x2=float(x2) / width,
                    y2=float(y2) / height,
                )
                detections.append(Detection(bbox=bbox, confidence=conf, label=label))

        return DetectionResult(
            detections=detections,
            image_width=width,
            image_height=height,
            processing_time=time.time() - start_time,
        )
