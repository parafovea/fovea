"""YOLO-World ONNX detection loader for CPU inference.

Loads YOLO-World models exported to ONNX format and runs
open-vocabulary object detection using ONNX Runtime on CPU.
"""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any

from src.domain.entities.architectures import YOLOWorld
from src.infrastructure.adapters.outbound.models.detection.base import (
    BoundingBox,
    Detection,
    DetectionConfig,
    DetectionModelLoader,
    DetectionResult,
)
from src.infrastructure.adapters.outbound.models.onnx.base import ONNXConfig, ONNXModelLoader
from src.infrastructure.adapters.outbound.models.onnx.registry import detection_onnx_registry
from src.infrastructure.observability.telemetry import instrument_method

if TYPE_CHECKING:
    from PIL import Image

logger = logging.getLogger(__name__)


@detection_onnx_registry.register(YOLOWorld)
class YOLOWorldONNXLoader(ONNXModelLoader, DetectionModelLoader):
    """YOLO-World ONNX loader for open-vocabulary detection on CPU.

    Combines the ONNX Runtime base loader with the detection model
    interface to provide CPU-based YOLO-World inference.

    Parameters
    ----------
    arch : YOLOWorld
        Architecture model the loader is registered against.
    config : DetectionConfig
        Detection model configuration.
    onnx_config : ONNXConfig | None
        ONNX-specific configuration. Created from DetectionConfig if not provided.
    """

    def __init__(
        self,
        arch: YOLOWorld,
        config: DetectionConfig,
        onnx_config: ONNXConfig | None = None,
    ) -> None:
        onnx_cfg = onnx_config or ONNXConfig(
            model_id=config.model_id,
            onnx_filename="yolov8s-worldv2.onnx",
            cache_dir=config.cache_dir,
        )
        ONNXModelLoader.__init__(self, onnx_cfg)
        DetectionModelLoader.__init__(self, arch, config)
        self._input_size = (640, 640)

    def load(self) -> None:
        """Load YOLO-World ONNX model from HuggingFace Hub.

        Downloads ``yolov8s-worldv2.onnx`` from the configured repo and
        creates an inference session. The filename is the canonical
        artifact name published in the Ultralytics-derived community
        exports (Instemic, jquadrino) for the small-variant weights;
        deployments wanting the large variant point ``model_id`` at a
        repo that ships ``yolov8l-worldv2.onnx`` and override
        ``onnx_filename`` accordingly.

        Raises
        ------
        RuntimeError
            If model download or session creation fails.
        """
        from huggingface_hub import hf_hub_download

        try:
            cache_dir = str(self.onnx_config.cache_dir) if self.onnx_config.cache_dir else None
            model_path = hf_hub_download(
                repo_id=self.onnx_config.model_id,
                filename=self.onnx_config.onnx_filename,
                cache_dir=cache_dir,
            )
            self._session = self._create_session(model_path)
            logger.info("Loaded YOLO-World ONNX model: %s", self.onnx_config.model_id)
        except Exception as e:
            logger.error("Failed to load YOLO-World ONNX model: %s", e)
            raise RuntimeError(f"Model loading failed: {e}") from e

    @instrument_method(task="detect")
    def detect(
        self,
        image: Image.Image,
        text_prompt: str,
    ) -> DetectionResult:
        """Detect objects using YOLO-World ONNX model with text prompts.

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
            If the model is not loaded.
        """
        import numpy as np

        if self._session is None:
            msg = "Model not loaded. Call load() first."
            raise RuntimeError(msg)

        start_time = time.time()

        orig_w, orig_h = image.size

        # Preprocess: resize and normalize to CHW float32
        resized = image.resize(self._input_size)
        img_array: Any = np.array(resized, dtype=np.float32) / 255.0
        img_array = img_array.transpose(2, 0, 1)  # HWC -> CHW
        img_array = np.expand_dims(img_array, axis=0)  # Add batch dim

        # Run inference
        input_name = self._session.get_inputs()[0].name
        outputs = self._session.run(None, {input_name: img_array})

        # Parse outputs (YOLO format: [batch, num_detections, 5+num_classes])
        predictions: Any = outputs[0][0] if len(outputs) > 0 else np.array([])

        detections: list[Detection] = []
        prompt_labels = [c.strip() for c in text_prompt.split(".") if c.strip()]

        if len(predictions) > 0:
            for pred in predictions:
                score = float(pred[4]) if len(pred) > 4 else 0.0
                if score < self.config.confidence_threshold:
                    continue

                # Convert from center format to normalized corner format
                cx, cy, w, h = pred[0], pred[1], pred[2], pred[3]
                x1 = float(cx - w / 2) / self._input_size[0]
                y1 = float(cy - h / 2) / self._input_size[1]
                x2 = float(cx + w / 2) / self._input_size[0]
                y2 = float(cy + h / 2) / self._input_size[1]

                # Determine label from class scores if available
                label = prompt_labels[0] if prompt_labels else "object"
                if len(pred) > 5 and prompt_labels:
                    class_scores: Any = pred[5:]
                    class_idx = int(np.argmax(class_scores))
                    if class_idx < len(prompt_labels):
                        label = prompt_labels[class_idx]

                bbox = BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2)
                detections.append(Detection(bbox=bbox, confidence=score, label=label))

        processing_time = time.time() - start_time

        return DetectionResult(
            detections=detections,
            image_width=orig_w,
            image_height=orig_h,
            processing_time=processing_time,
        )

    def unload(self) -> None:
        """Unload the ONNX model and free resources."""
        self._unload_session()
        self.model = None
