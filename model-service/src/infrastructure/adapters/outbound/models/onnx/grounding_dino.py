"""GroundingDINO ONNX detection loader for CPU inference.

Loads GroundingDINO models exported to ONNX format and runs
text-guided open-vocabulary detection using ONNX Runtime on CPU.
"""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any

import numpy as np

from src.infrastructure.adapters.outbound.models.detection.base import (
    BoundingBox,
    Detection,
    DetectionConfig,
    DetectionModelLoader,
    DetectionResult,
)
from src.infrastructure.adapters.outbound.models.onnx.base import ONNXConfig, ONNXModelLoader
from src.infrastructure.observability.telemetry import instrument_method

if TYPE_CHECKING:
    from PIL import Image

logger = logging.getLogger(__name__)

# ImageNet normalization constants
_IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class GroundingDINOONNXLoader(ONNXModelLoader, DetectionModelLoader):
    """GroundingDINO ONNX loader for text-guided detection on CPU.

    Uses a tokenizer for text prompt encoding and ImageNet normalization
    for image preprocessing before running ONNX inference.

    Parameters
    ----------
    config : DetectionConfig
        Detection model configuration.
    onnx_config : ONNXConfig | None
        ONNX-specific configuration. Created from DetectionConfig if not provided.
    """

    def __init__(
        self,
        config: DetectionConfig,
        onnx_config: ONNXConfig | None = None,
    ) -> None:
        onnx_cfg = onnx_config or ONNXConfig(
            model_id=config.model_id,
            cache_dir=config.cache_dir,
        )
        ONNXModelLoader.__init__(self, onnx_cfg)
        DetectionModelLoader.__init__(self, config)
        self._tokenizer: Any = None
        self._image_size = (800, 800)

    def load(self) -> None:
        """Load GroundingDINO ONNX model and tokenizer.

        Downloads the ONNX model file from HuggingFace Hub and
        initializes the tokenizer. Tries ``model.onnx`` first,
        then falls back to ``grounding_dino.onnx``.

        Raises
        ------
        RuntimeError
            If model download or session creation fails.
        """
        from huggingface_hub import hf_hub_download
        from transformers import AutoTokenizer

        try:
            self._tokenizer = AutoTokenizer.from_pretrained(self.onnx_config.model_id)

            cache_dir = str(self.onnx_config.cache_dir) if self.onnx_config.cache_dir else None

            try:
                model_path: str = hf_hub_download(
                    repo_id=self.onnx_config.model_id,
                    filename="model.onnx",
                    cache_dir=cache_dir,
                )
            except Exception:
                model_path = hf_hub_download(
                    repo_id=self.onnx_config.model_id,
                    filename="grounding_dino.onnx",
                    cache_dir=cache_dir,
                )

            self._session = self._create_session(model_path)
            logger.info("Loaded GroundingDINO ONNX model: %s", self.onnx_config.model_id)
        except Exception as e:
            logger.error("Failed to load GroundingDINO ONNX model: %s", e)
            raise RuntimeError(f"Model loading failed: {e}") from e

    @instrument_method(task="detect")
    def detect(
        self,
        image: Image.Image,
        text_prompt: str,
    ) -> DetectionResult:
        """Detect objects using GroundingDINO ONNX model with text prompts.

        Parameters
        ----------
        image : Image.Image
            PIL Image to process.
        text_prompt : str
            Text description of objects to detect (e.g., "person. car. dog.").

        Returns
        -------
        DetectionResult
            Detection results with bounding boxes in normalized coordinates.

        Raises
        ------
        RuntimeError
            If the model or tokenizer is not loaded.
        """
        if self._session is None or self._tokenizer is None:
            msg = "Model not loaded. Call load() first."
            raise RuntimeError(msg)

        start_time = time.time()

        orig_w, orig_h = image.size
        prompt = text_prompt or "object"

        # Preprocess image: resize, normalize with ImageNet stats, CHW format
        resized = image.resize(self._image_size)
        img_array: Any = np.array(resized, dtype=np.float32) / 255.0
        img_array = (img_array - _IMAGENET_MEAN) / _IMAGENET_STD
        img_array = img_array.transpose(2, 0, 1)  # HWC -> CHW
        img_array = np.expand_dims(img_array, axis=0)  # Add batch dim

        # Tokenize text prompt
        text_inputs: Any = self._tokenizer(
            prompt,
            return_tensors="np",
            padding=True,
            truncation=True,
        )

        # Build feed dict by matching model input names
        feed: dict[str, Any] = {
            "pixel_values": img_array,
            "input_ids": text_inputs["input_ids"],
            "attention_mask": text_inputs["attention_mask"],
        }

        input_names = [inp.name for inp in self._session.get_inputs()]
        mapped_feed: dict[str, Any] = {}
        for name in input_names:
            for key, value in feed.items():
                if key in name:
                    mapped_feed[name] = value
                    break

        outputs = self._session.run(None, mapped_feed)

        # Parse outputs: typically [logits, boxes] where boxes are in cxcywh format
        detections = self._parse_outputs(outputs, prompt, orig_w, orig_h)

        processing_time = time.time() - start_time

        return DetectionResult(
            detections=detections,
            image_width=orig_w,
            image_height=orig_h,
            processing_time=processing_time,
        )

    def _parse_outputs(
        self,
        outputs: list[Any],
        prompt: str,
        orig_w: int,
        orig_h: int,
    ) -> list[Detection]:
        """Parse GroundingDINO ONNX outputs into Detection objects.

        Parameters
        ----------
        outputs : list[Any]
            Raw ONNX model outputs (logits and boxes).
        prompt : str
            Text prompt used for detection.
        orig_w : int
            Original image width (unused; coordinates are normalized).
        orig_h : int
            Original image height (unused; coordinates are normalized).

        Returns
        -------
        list[Detection]
            Parsed detections with normalized coordinates.
        """
        detections: list[Detection] = []

        if len(outputs) < 2:
            return detections

        pred_logits: Any = outputs[0][0]  # [num_queries, num_classes]
        pred_boxes: Any = outputs[1][0]  # [num_queries, 4] in cxcywh normalized

        for i in range(len(pred_logits)):
            # Apply sigmoid to get confidence from logits
            max_logit = float(pred_logits[i].max())
            score = 1.0 / (1.0 + np.exp(-max_logit))

            if score < self.config.confidence_threshold:
                continue

            # Convert from cxcywh (normalized) to xyxy (normalized)
            cx, cy, w, h = pred_boxes[i]
            x1 = float(cx - w / 2)
            y1 = float(cy - h / 2)
            x2 = float(cx + w / 2)
            y2 = float(cy + h / 2)

            bbox = BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2)
            detections.append(Detection(bbox=bbox, confidence=score, label=prompt))

        return detections

    def unload(self) -> None:
        """Unload the ONNX model and tokenizer."""
        self._unload_session()
        self._tokenizer = None
        self.model = None
