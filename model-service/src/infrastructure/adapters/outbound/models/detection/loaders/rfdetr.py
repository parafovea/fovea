"""Roboflow RF-DETR detection loader."""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any

import torch

from src.domain.entities.architectures import RFDETR
from src.infrastructure.adapters.outbound.models.detection.base import (
    BoundingBox,
    Detection,
    DetectionModelLoader,
    DetectionResult,
)
from src.infrastructure.adapters.outbound.models.detection.loaders.base import (
    RFDETR_INSTALL_HINT,
    detection_pytorch_registry,
)
from src.infrastructure.observability.telemetry import instrument_method

if TYPE_CHECKING:
    from PIL import Image

logger = logging.getLogger(__name__)


@detection_pytorch_registry.register(RFDETR)
class RFDETRLoader(DetectionModelLoader):
    """Loader for Roboflow RF-DETR detection models."""

    def load(self) -> None:
        """Load an RF-DETR model from the ``rfdetr`` package."""
        try:
            import rfdetr
        except ImportError as exc:
            raise ImportError(RFDETR_INSTALL_HINT) from exc

        logger.info("Loading RF-DETR from %s", self.config.model_id)
        model_cls = getattr(rfdetr, "RFDETR", None) or getattr(rfdetr, "Model", None)
        if model_cls is None:
            raise ImportError(RFDETR_INSTALL_HINT)
        self.model = model_cls(self.config.model_id)
        if hasattr(self.model, "to") and torch.cuda.is_available():
            self.model.to(self.config.device)

    @instrument_method(task="detect")
    def detect(
        self,
        image: Image.Image,
        text_prompt: str,
    ) -> DetectionResult:
        """Run RF-DETR detection on a single image."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        start_time = time.time()
        width, height = image.size
        raw = self.model.predict(
            image,
            confidence=self.config.confidence_threshold,
        )

        detections: list[Detection] = []
        for item in _iter_rfdetr_detections(raw):
            x1, y1, x2, y2 = item["bbox"]
            conf = float(item.get("confidence", item.get("score", 0.0)))
            if conf < self.config.confidence_threshold:
                continue
            bbox = BoundingBox(
                x1=float(x1) / width,
                y1=float(y1) / height,
                x2=float(x2) / width,
                y2=float(y2) / height,
            )
            detections.append(
                Detection(
                    bbox=bbox,
                    confidence=conf,
                    label=str(item.get("label", "")),
                )
            )

        return DetectionResult(
            detections=detections,
            image_width=width,
            image_height=height,
            processing_time=time.time() - start_time,
        )


def _iter_rfdetr_detections(raw: Any) -> list[dict[str, Any]]:
    """Normalize an RF-DETR prediction payload into a list of dicts."""
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    if isinstance(raw, dict):
        inner = raw.get("detections") or raw.get("predictions") or []
        if isinstance(inner, list):
            return [item for item in inner if isinstance(item, dict)]
    return []
