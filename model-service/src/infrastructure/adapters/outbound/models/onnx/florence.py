"""Florence-2 ONNX detection loader for CPU inference.

Loads Florence-2 models exported to ONNX format and runs
object detection and grounding using ONNX Runtime on CPU.
Florence-2 uses an encoder-decoder architecture, so it may
require separate encoder and decoder ONNX sessions.
"""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any

from src.infrastructure.adapters.outbound.models.detection.loader import (
    BoundingBox,
    Detection,
    DetectionConfig,
    DetectionModelLoader,
    DetectionResult,
)
from src.infrastructure.adapters.outbound.models.onnx.base import ONNXConfig, ONNXModelLoader
from src.infrastructure.observability.telemetry import instrument_method

if TYPE_CHECKING:
    import onnxruntime as ort
    from PIL import Image

logger = logging.getLogger(__name__)


class Florence2ONNXLoader(ONNXModelLoader, DetectionModelLoader):
    """Florence-2 ONNX loader for detection and grounding on CPU.

    Supports both split encoder/decoder ONNX files and a single
    combined model file. Uses the HuggingFace processor for
    tokenization and output parsing.

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
        self._processor: Any = None
        self._encoder_session: ort.InferenceSession | None = None
        self._decoder_session: ort.InferenceSession | None = None

    def load(self) -> None:
        """Load Florence-2 ONNX model components.

        Downloads and initializes the processor and ONNX sessions.
        Tries separate encoder/decoder files first, then falls back
        to a single combined model file.

        Raises
        ------
        RuntimeError
            If model download or session creation fails.
        """
        from huggingface_hub import hf_hub_download
        from transformers import AutoProcessor

        try:
            self._processor = AutoProcessor.from_pretrained(
                self.onnx_config.model_id,
                trust_remote_code=True,
            )

            cache_dir = str(self.onnx_config.cache_dir) if self.onnx_config.cache_dir else None

            # Try split encoder/decoder first, then fall back to combined model
            try:
                encoder_path: str = hf_hub_download(
                    repo_id=self.onnx_config.model_id,
                    filename="encoder_model.onnx",
                    cache_dir=cache_dir,
                )
                decoder_path: str = hf_hub_download(
                    repo_id=self.onnx_config.model_id,
                    filename="decoder_model.onnx",
                    cache_dir=cache_dir,
                )
                self._encoder_session = self._create_session(encoder_path)
                self._decoder_session = self._create_session(decoder_path)
            except Exception:
                model_path: str = hf_hub_download(
                    repo_id=self.onnx_config.model_id,
                    filename="model.onnx",
                    cache_dir=cache_dir,
                )
                self._session = self._create_session(model_path)

            logger.info("Loaded Florence-2 ONNX model: %s", self.onnx_config.model_id)
        except Exception as e:
            logger.error("Failed to load Florence-2 ONNX model: %s", e)
            raise RuntimeError(f"Model loading failed: {e}") from e

    @instrument_method(task="detect")
    def detect(
        self,
        image: Image.Image,
        text_prompt: str,
    ) -> DetectionResult:
        """Detect objects using Florence-2 ONNX model with text prompts.

        Parameters
        ----------
        image : Image.Image
            PIL Image to process.
        text_prompt : str
            Text description of objects to detect. Used as an
            open-vocabulary grounding prompt.

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

        if self._processor is None:
            msg = "Model not loaded. Call load() first."
            raise RuntimeError(msg)

        start_time = time.time()

        width, height = image.size
        task_prompt = "<OD>" if not text_prompt else f"<OPEN_VOCABULARY_DETECTION> {text_prompt}"

        inputs: Any = self._processor(
            text=task_prompt,
            images=image,
            return_tensors="np",
        )

        # Run through encoder-decoder or single model
        if self._encoder_session is not None and self._decoder_session is not None:
            encoder_outputs = self._encoder_session.run(
                None,
                {
                    "input_ids": inputs["input_ids"],
                    "pixel_values": inputs["pixel_values"],
                },
            )
            decoder_outputs = self._decoder_session.run(
                None,
                {"encoder_hidden_states": encoder_outputs[0]},
            )
            output_ids: Any = decoder_outputs[0]
        elif self._session is not None:
            feed: dict[str, Any] = {}
            for key, value in inputs.items():
                if isinstance(value, np.ndarray):
                    feed[key] = value
            outputs = self._session.run(None, feed)
            output_ids = outputs[0]
        else:
            msg = "No model session available."
            raise RuntimeError(msg)

        # Decode and parse structured output
        generated_text: str = self._processor.batch_decode(output_ids, skip_special_tokens=False)[0]
        task_token = task_prompt.split(maxsplit=1)[0] if task_prompt else "<OD>"
        parsed: dict[str, Any] = self._processor.post_process_generation(
            generated_text,
            task=task_token,
            image_size=(width, height),
        )

        detections = self._parse_florence_output(parsed, width, height)

        processing_time = time.time() - start_time

        return DetectionResult(
            detections=detections,
            image_width=width,
            image_height=height,
            processing_time=processing_time,
        )

    def _parse_florence_output(
        self,
        parsed: dict[str, Any],
        width: int,
        height: int,
    ) -> list[Detection]:
        """Parse Florence-2 structured output into Detection objects.

        Parameters
        ----------
        parsed : dict[str, Any]
            Parsed model output from the processor.
        width : int
            Image width for coordinate normalization.
        height : int
            Image height for coordinate normalization.

        Returns
        -------
        list[Detection]
            Parsed detections with normalized coordinates.
        """
        detections: list[Detection] = []

        result_key = next(iter(parsed), None)
        if result_key and isinstance(parsed[result_key], dict):
            result_data: dict[str, Any] = parsed[result_key]
            bbox_list: list[list[float]] = result_data.get("bboxes", [])
            label_list: list[str] = result_data.get("labels", [])

            for i, raw_bbox in enumerate(bbox_list):
                # Florence-2 returns absolute pixel coordinates
                x1 = float(raw_bbox[0]) / width
                y1 = float(raw_bbox[1]) / height
                x2 = float(raw_bbox[2]) / width
                y2 = float(raw_bbox[3]) / height

                bbox = BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2)
                label = label_list[i] if i < len(label_list) else "object"
                # Florence-2 does not provide per-box confidence scores
                detections.append(Detection(bbox=bbox, confidence=1.0, label=label))

        return detections

    def unload(self) -> None:
        """Unload all model components and free resources."""
        self._session = None
        self._encoder_session = None
        self._decoder_session = None
        self._processor = None
        self.model = None
        logger.info("Unloaded Florence-2 ONNX model: %s", self.onnx_config.model_id)
