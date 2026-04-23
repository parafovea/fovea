"""Open-vocabulary object detection with multiple model architectures.

This module provides a unified interface for loading and running inference with
various open-vocabulary object detection models including YOLO-World v2.1,
Grounding DINO 1.5, OWLv2, and Florence-2. Models support text-based prompts
for detecting objects without pre-defined class vocabularies.
"""

import logging
from typing import Any

import numpy as np
import torch
from PIL import Image

from src.infrastructure.adapters.outbound.models.detection.base import (
    BoundingBox,
    Detection,
    DetectionConfig,
    DetectionFramework,
    DetectionModelLoader,
    DetectionResult,
)
from src.infrastructure.observability.telemetry import instrument_method

__all__ = [
    "BoundingBox",
    "Detection",
    "DetectionConfig",
    "DetectionFramework",
    "DetectionModelLoader",
    "DetectionResult",
    "create_detection_loader",
]

logger = logging.getLogger(__name__)


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

        import time

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

        import time

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

        import time

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

        import time

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


YOLOE_INSTALL_HINT = "YOLOE (open-vocab YOLO) required; install with: pip install ultralytics"
RFDETR_INSTALL_HINT = "rfdetr package required; install with: pip install rfdetr"


class YOLOv12Loader(DetectionModelLoader):
    """Loader for YOLOv12 closed-set detection via Ultralytics."""

    def load(self) -> None:
        """Load the YOLOv12 weights using ``ultralytics.YOLO``."""
        try:
            from ultralytics import YOLO  # type: ignore[attr-defined]
        except ImportError as exc:
            raise ImportError(
                "ultralytics required for YOLOv12; install with: pip install ultralytics"
            ) from exc

        logger.info("Loading YOLOv12 from %s", self.config.model_id)
        self.model = YOLO(self.config.model_id)
        if torch.cuda.is_available():
            self.model.to(self.config.device)

    @instrument_method(task="detect")
    def detect(
        self,
        image: Image.Image,
        text_prompt: str,
    ) -> DetectionResult:
        """Run YOLOv12 detection on a single image."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        import time

        start_time = time.time()
        image_array = np.array(image)
        height, width = image_array.shape[:2]

        results = self.model(image_array, verbose=False)[0]
        detections: list[Detection] = []
        if results.boxes is not None:
            for box in results.boxes:
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                conf = float(box.conf[0].cpu().numpy())
                if conf < self.config.confidence_threshold:
                    continue
                cls_id = int(box.cls[0].cpu().numpy())
                label = self.model.names[cls_id]
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


class YOLOE26Loader(DetectionModelLoader):
    """Loader for YOLOE-26 open-vocabulary detection."""

    def load(self) -> None:
        """Load YOLOE-26 via ``ultralytics.YOLOE``."""
        try:
            import ultralytics
        except ImportError as exc:
            raise ImportError(YOLOE_INSTALL_HINT) from exc

        yoloe_cls = getattr(ultralytics, "YOLOE", None)
        if yoloe_cls is None:
            raise ImportError(YOLOE_INSTALL_HINT)

        logger.info("Loading YOLOE-26 from %s", self.config.model_id)
        self.model = yoloe_cls(self.config.model_id)
        if torch.cuda.is_available():
            self.model.to(self.config.device)

    @instrument_method(task="detect")
    def detect(
        self,
        image: Image.Image,
        text_prompt: str,
    ) -> DetectionResult:
        """Run YOLOE-26 open-vocabulary detection."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        import time

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

        import time

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


def _create_onnx_loader(config: DetectionConfig) -> DetectionModelLoader:
    """Create an ONNX detection loader based on the model ID.

    Parameters
    ----------
    config : DetectionConfig
        Configuration with model_id used to select the ONNX loader.

    Returns
    -------
    DetectionModelLoader
        ONNX loader instance for the specified model.

    Raises
    ------
    ValueError
        If no ONNX loader is available for the model ID.
    """
    onnx_model_name = config.model_id.lower().replace("-", "").replace("_", "")
    if "yoloworld" in onnx_model_name:
        from src.infrastructure.adapters.outbound.models.onnx.yolo_world import (
            YOLOWorldONNXLoader,
        )

        return YOLOWorldONNXLoader(config)
    if "florence" in onnx_model_name:
        from src.infrastructure.adapters.outbound.models.onnx.florence import (
            Florence2ONNXLoader,
        )

        return Florence2ONNXLoader(config)
    if "groundingdino" in onnx_model_name:
        from src.infrastructure.adapters.outbound.models.onnx.grounding_dino import (
            GroundingDINOONNXLoader,
        )

        return GroundingDINOONNXLoader(config)
    msg = f"No ONNX loader available for model: {config.model_id}"
    raise ValueError(msg)


def create_detection_loader(model_name: str, config: DetectionConfig) -> DetectionModelLoader:
    """Factory function to create appropriate detection loader based on model name.

    Parameters
    ----------
    model_name : str
        Name of the model to load. Supported values:
        - "yolo-world-v2" or "yoloworld"
        - "grounding-dino-1-5" or "groundingdino"
        - "owlv2" or "owl-v2"
        - "florence-2" or "florence2"
    config : DetectionConfig
        Configuration for model loading and inference.

    Returns
    -------
    DetectionModelLoader
        Appropriate loader instance for the specified model.

    Raises
    ------
    ValueError
        If model_name is not recognized.
    """
    if config.framework == DetectionFramework.ONNX:
        return _create_onnx_loader(config)

    model_name_lower = model_name.lower().replace("_", "-")

    if "yolo-world" in model_name_lower or "yoloworld" in model_name_lower:
        return YOLOWorldLoader(config)
    if "yoloe" in model_name_lower:
        return YOLOE26Loader(config)
    if "yolov12" in model_name_lower or "yolo12" in model_name_lower:
        return YOLOv12Loader(config)
    if "rf-detr" in model_name_lower or "rfdetr" in model_name_lower:
        return RFDETRLoader(config)
    if "grounding-dino" in model_name_lower or "groundingdino" in model_name_lower:
        return GroundingDINOLoader(config)
    if "owl" in model_name_lower:
        return OWLv2Loader(config)
    if "florence" in model_name_lower:
        return Florence2Loader(config)

    raise ValueError(
        f"Unknown model name: {model_name}. Supported models: "
        "yolo-world-v2, yolov12, yoloe-26, rf-detr, grounding-dino-1-5, owlv2, florence-2"
    )
