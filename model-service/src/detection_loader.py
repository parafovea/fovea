"""Open-vocabulary object detection with multiple model architectures.

This module provides a unified interface for loading and running inference with
various open-vocabulary object detection models including YOLO-World v2.1,
Grounding DINO 1.5, OWLv2, and Florence-2. Models support text-based prompts
for detecting objects without pre-defined class vocabularies.
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any

import numpy as np
import torch
from PIL import Image

logger = logging.getLogger(__name__)


class DetectionFramework(str, Enum):
    """Supported detection frameworks for model execution."""

    PYTORCH = "pytorch"
    ULTRALYTICS = "ultralytics"
    TRANSFORMERS = "transformers"


@dataclass
class DetectionConfig:
    """Configuration for object detection model loading and inference.

    Parameters
    ----------
    model_id : str
        HuggingFace model identifier or Ultralytics model name.
    framework : DetectionFramework
        Framework to use for model execution.
    confidence_threshold : float, default=0.25
        Minimum confidence score for detections (0.0 to 1.0).
    device : str, default="cuda"
        Device to load the model on.
    cache_dir : Path | None, default=None
        Directory for caching model weights.
    """

    model_id: str
    framework: DetectionFramework = DetectionFramework.PYTORCH
    confidence_threshold: float = 0.25
    device: str = "cuda"
    cache_dir: Path | None = None


@dataclass
class BoundingBox:
    """Bounding box in normalized coordinates.

    Parameters
    ----------
    x1 : float
        Left coordinate (0.0 to 1.0, normalized by image width).
    y1 : float
        Top coordinate (0.0 to 1.0, normalized by image height).
    x2 : float
        Right coordinate (0.0 to 1.0, normalized by image width).
    y2 : float
        Bottom coordinate (0.0 to 1.0, normalized by image height).
    """

    x1: float
    y1: float
    x2: float
    y2: float

    def to_absolute(self, width: int, height: int) -> tuple[int, int, int, int]:
        """Convert normalized coordinates to absolute pixel coordinates.

        Parameters
        ----------
        width : int
            Image width in pixels.
        height : int
            Image height in pixels.

        Returns
        -------
        tuple[int, int, int, int]
            Bounding box in absolute coordinates (x1, y1, x2, y2).
        """
        return (
            int(self.x1 * width),
            int(self.y1 * height),
            int(self.x2 * width),
            int(self.y2 * height),
        )


@dataclass
class Detection:
    """Single object detection result.

    Parameters
    ----------
    bbox : BoundingBox
        Bounding box in normalized coordinates.
    confidence : float
        Detection confidence score (0.0 to 1.0).
    label : str
        Detected object class or description.
    """

    bbox: BoundingBox
    confidence: float
    label: str


@dataclass
class DetectionResult:
    """Detection results for a single image.

    Parameters
    ----------
    detections : list[Detection]
        List of detected objects with bounding boxes and scores.
    image_width : int
        Original image width in pixels.
    image_height : int
        Original image height in pixels.
    processing_time : float
        Processing time in seconds.
    """

    detections: list[Detection]
    image_width: int
    image_height: int
    processing_time: float


class DetectionModelLoader(ABC):
    """Abstract base class for object detection model loaders.

    All detection loaders must implement the load and detect methods.
    """

    def __init__(self, config: DetectionConfig) -> None:
        """Initialize the detection model loader with configuration.

        Parameters
        ----------
        config : DetectionConfig
            Configuration for model loading and inference.
        """
        self.config = config
        self.model: Any = None

    @abstractmethod
    def load(self) -> None:
        """Load the detection model into memory with configured settings.

        Raises
        ------
        RuntimeError
            If model loading fails.
        """

    @abstractmethod
    def detect(
        self,
        image: Image.Image,
        text_prompt: str,
    ) -> DetectionResult:
        """Detect objects in an image based on text prompt.

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
            If detection fails or model is not loaded.
        """

    def unload(self) -> None:
        """Unload the model from memory to free GPU resources."""
        if self.model is not None:
            del self.model
            self.model = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("Detection model unloaded and memory cleared")


class YOLOWorldLoader(DetectionModelLoader):
    """Loader for YOLO-World v2.1 open-vocabulary detection model.

    YOLO-World v2.1 achieves real-time performance (52 FPS) with strong
    accuracy on open-vocabulary object detection tasks.
    """

    def load(self) -> None:
        """Load YOLO-World v2.1 model with configured settings."""
        try:
            from ultralytics import YOLO

            logger.info(f"Loading YOLO-World v2.1 from {self.config.model_id}")

            self.model = YOLO(self.config.model_id)

            if torch.cuda.is_available():
                self.model.to(self.config.device)

            logger.info("YOLO-World v2.1 loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load YOLO-World v2.1: {e}")
            raise RuntimeError(f"Model loading failed: {e}") from e

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
    model_name_lower = model_name.lower().replace("_", "-")

    if "yolo-world" in model_name_lower or "yoloworld" in model_name_lower:
        return YOLOWorldLoader(config)
    if "grounding-dino" in model_name_lower or "groundingdino" in model_name_lower:
        return GroundingDINOLoader(config)
    if "owl" in model_name_lower:
        return OWLv2Loader(config)
    if "florence" in model_name_lower:
        return Florence2Loader(config)

    raise ValueError(
        f"Unknown model name: {model_name}. Supported models: "
        "yolo-world-v2, grounding-dino-1-5, owlv2, florence-2"
    )
