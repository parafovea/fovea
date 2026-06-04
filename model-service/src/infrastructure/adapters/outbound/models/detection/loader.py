"""Open-vocabulary object detection loaders dispatched by architecture.

This module owns two architecture-keyed registries:

* :data:`detection_pytorch_registry` — loaders that drive a PyTorch /
  Ultralytics / Transformers backend.
* :data:`detection_onnx_registry` — loaders that drive an ONNX Runtime
  session for CPU inference.

A loader class registers itself against the architecture Pydantic
subclass it implements via the appropriate registry's ``@register``
decorator. The :func:`create_detection_loader` factory inspects the
framework on the :class:`DetectionConfig`, picks the matching registry,
and instantiates the loader through it. No code in this module matches
on model-id substrings, weights filenames, or free-text labels; the
architecture Pydantic class is the only legitimate dispatch key.

The two-registry design reflects the fact that the same architecture
(for example :class:`YOLOWorld`) is driven by two distinct loader
classes depending on the backend: a pytorch / ultralytics
:class:`YOLOWorldLoader` and an ONNX :class:`YOLOWorldONNXLoader` with a
different inheritance chain. Collapsing both into one registry would
either force a synthetic ``(framework, architecture)`` lookup key or
overwrite one entry with the other; keeping the registries separate
matches the natural fiber of the loader hierarchy.
"""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any

import numpy as np
import torch

from src.domain.entities.architectures import (
    RFDETR,
    YOLOE,
    Florence2Detection,
    GroundingDINO,
    OWLv2,
    YOLOv12,
    YOLOWorld,
)
from src.infrastructure.adapters.outbound.models.detection.base import (
    BoundingBox,
    Detection,
    DetectionConfig,
    DetectionFramework,
    DetectionModelLoader,
    DetectionResult,
)
from src.infrastructure.adapters.outbound.models.onnx.registry import detection_onnx_registry
from src.infrastructure.adapters.outbound.models.registry import LoaderRegistry
from src.infrastructure.observability.telemetry import instrument_method

if TYPE_CHECKING:
    from PIL import Image

    from src.domain.entities.architectures import DetectionArchitecture

__all__ = [
    "BoundingBox",
    "Detection",
    "DetectionConfig",
    "DetectionFramework",
    "DetectionModelLoader",
    "DetectionResult",
    "Florence2Loader",
    "GroundingDINOLoader",
    "OWLv2Loader",
    "RFDETRLoader",
    "YOLOELoader",
    "YOLOWorldLoader",
    "YOLOv12Loader",
    "create_detection_loader",
    "detection_onnx_registry",
    "detection_pytorch_registry",
]

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Registries.
#
# Two independent registries because the same architecture maps to two
# distinct loader classes depending on the backend (pytorch / ultralytics
# / transformers vs. ONNX Runtime). The registries do not share state.
# ---------------------------------------------------------------------------

detection_pytorch_registry: LoaderRegistry[DetectionArchitecture, DetectionModelLoader] = (
    LoaderRegistry(family="detection_pytorch")
)
"""Loaders for PyTorch, Ultralytics, and Transformers detection backends."""


# ---------------------------------------------------------------------------
# Install hints for optional backend dependencies.
# ---------------------------------------------------------------------------

YOLOE_INSTALL_HINT = "YOLOE (open-vocab YOLO) required; install with: pip install ultralytics"
RFDETR_INSTALL_HINT = "rfdetr package required; install with: pip install rfdetr"


# ---------------------------------------------------------------------------
# PyTorch / Ultralytics / Transformers loaders.
# ---------------------------------------------------------------------------


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


@detection_pytorch_registry.register(YOLOv12)
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


# ---------------------------------------------------------------------------
# ONNX loader registration.
#
# The ONNX loader classes live in sibling modules (``onnx/yolo_world.py``,
# ``onnx/florence.py``, ``onnx/grounding_dino.py``) so the heavy ONNX
# Runtime imports stay isolated from the pytorch path. We import them
# here only to attach the architecture registration to the ONNX registry;
# the loader bodies themselves live in those modules and use the
# registry's ``@register`` decorator at their definition site.
# ---------------------------------------------------------------------------

# Importing these modules executes their ``@detection_onnx_registry.register(...)``
# decorators and is the only way they enter the registry. The imports are
# intentionally placed at the bottom of this module to keep the registry
# definitions above any decorator that closes over them.
from src.infrastructure.adapters.outbound.models.onnx.florence import (  # noqa: E402,F401
    Florence2ONNXLoader,
)
from src.infrastructure.adapters.outbound.models.onnx.grounding_dino import (  # noqa: E402,F401
    GroundingDINOONNXLoader,
)
from src.infrastructure.adapters.outbound.models.onnx.yolo_world import (  # noqa: E402,F401
    YOLOWorldONNXLoader,
)

# ---------------------------------------------------------------------------
# Factory.
# ---------------------------------------------------------------------------


def create_detection_loader(
    architecture: DetectionArchitecture,
    config: DetectionConfig,
) -> DetectionModelLoader:
    """Instantiate the detection loader registered for an architecture.

    The framework on the :class:`DetectionConfig` selects the
    pytorch-backed registry or the ONNX-backed registry; the architecture
    instance then selects the concrete loader class within that registry.
    No model-id, weights filename, or free-text label is inspected on
    this path.

    Parameters
    ----------
    architecture : DetectionArchitecture
        Parsed architecture model (a member of the discriminated union
        defined in :mod:`src.domain.entities.architectures`).
    config : DetectionConfig
        Framework-level configuration including the model id, device,
        and confidence threshold.

    Returns
    -------
    DetectionModelLoader
        A fresh loader instance bound to the supplied architecture and
        config. The loader is NOT loaded; the caller must invoke
        ``load()`` before ``detect()``.

    Raises
    ------
    src.infrastructure.adapters.outbound.models.registry.UnknownArchitectureError
        When no loader has registered against ``type(architecture)`` in
        the selected registry. The error message lists every registered
        architecture so a misconfigured YAML fails loudly.
    """
    registry = (
        detection_onnx_registry
        if config.framework == DetectionFramework.ONNX
        else detection_pytorch_registry
    )
    return registry.create(architecture, config)
