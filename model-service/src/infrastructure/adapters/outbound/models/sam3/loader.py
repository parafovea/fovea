"""SAM 3.1 model loader.

Loads the SAM 3.1 model lazily, exposing a text-promptable detection API
and a mask-tracking API. Heavy dependencies are imported inside the
methods that require them so the service can boot without the ``sam3``
package installed.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from src.domain.entities import Detection, TrackingMask
from src.domain.value_objects import ConfidenceScore, NormalizedBBox
from src.infrastructure.observability.telemetry import record_inference

if TYPE_CHECKING:
    import numpy as np
    from numpy.typing import NDArray

logger = logging.getLogger(__name__)

SAM3_INSTALL_HINT = "sam3 package required for SAM 3.1; install with: pip install sam3"


class SAM3Loader:
    """Lazy loader for SAM 3.1 detection and tracking.

    Parameters
    ----------
    model_id : str
        Model identifier used when constructing the underlying model.
    device : str
        Torch device string (``"cuda"`` or ``"cpu"``).
    checkpoint_path : str | None
        Optional local checkpoint override.
    """

    def __init__(
        self,
        model_id: str = "facebook/sam3",
        device: str = "cuda",
        checkpoint_path: str | None = None,
    ) -> None:
        self._model_id = model_id
        self._device = device
        self._checkpoint_path = checkpoint_path
        self._model: Any = None
        self._tracking_state: Any = None

    @property
    def model_id(self) -> str:
        """Return the configured model identifier."""
        return self._model_id

    @property
    def device(self) -> str:
        """Return the configured torch device."""
        return self._device

    @property
    def is_loaded(self) -> bool:
        """Return True when the underlying model has been constructed."""
        return self._model is not None

    def load(self) -> None:
        """Build and cache the underlying SAM 3.1 model."""
        if self._model is not None:
            return
        try:
            import sam3  # noqa: F401
        except ImportError as exc:
            raise ImportError(SAM3_INSTALL_HINT) from exc

        from sam3 import build_sam3_model  # type: ignore[import-not-found]

        self._model = build_sam3_model(
            model_id=self._model_id,
            device=self._device,
            checkpoint_path=self._checkpoint_path,
        )
        logger.info("SAM 3.1 loaded: %s", self._model_id)

    def unload(self) -> None:
        """Release the model reference."""
        self._model = None
        self._tracking_state = None

    def detect(
        self,
        image: NDArray[np.uint8],
        text_prompts: list[str],
        confidence_threshold: float = 0.3,
    ) -> list[Detection]:
        """Run open-vocabulary detection with text prompts.

        Parameters
        ----------
        image : NDArray[np.uint8]
            Input image as ``(H, W, C)`` uint8 array.
        text_prompts : list[str]
            Free-form text prompts describing target objects.
        confidence_threshold : float
            Minimum confidence for a detection to be returned.

        Returns
        -------
        list[Detection]
            Detected objects in normalized coordinates.
        """
        self.load()
        with record_inference(task="detect", model_id=self._model_id):
            raw = self._model.detect(
                image=image,
                prompts=list(text_prompts),
                threshold=confidence_threshold,
            )
        return _convert_raw_detections(raw, image.shape[0], image.shape[1])

    def track(
        self,
        frames: list[NDArray[np.uint8]],
        initial_prompt: str,
    ) -> list[TrackingMask]:
        """Track masks across frames from a text prompt anchored on frame 0.

        Parameters
        ----------
        frames : list[NDArray[np.uint8]]
            Video frames as ``(H, W, C)`` uint8 arrays.
        initial_prompt : str
            Text prompt describing the object to track.

        Returns
        -------
        list[TrackingMask]
            One mask per frame (domain ``TrackingMask`` with RLE payload).
        """
        self.load()
        with record_inference(task="track", model_id=self._model_id):
            raw_masks = self._model.track(frames=list(frames), prompt=initial_prompt)
        return [_convert_raw_mask(m, index=i) for i, m in enumerate(raw_masks)]


def _convert_raw_detections(
    raw: list[dict[str, Any]],
    height: int,
    width: int,
) -> list[Detection]:
    """Translate raw SAM 3.1 detection dicts into domain ``Detection`` objects."""
    detections: list[Detection] = []
    for item in raw:
        bbox = item["bbox"]
        x1 = float(bbox[0]) / float(width)
        y1 = float(bbox[1]) / float(height)
        x2 = float(bbox[2]) / float(width)
        y2 = float(bbox[3]) / float(height)
        normalized = NormalizedBBox.from_xyxy(
            x1=max(0.0, min(1.0, x1)),
            y1=max(0.0, min(1.0, y1)),
            x2=max(0.0, min(1.0, x2)),
            y2=max(0.0, min(1.0, y2)),
        )
        detections.append(
            Detection(
                label=str(item.get("label", "")),
                bounding_box=normalized,
                confidence=ConfidenceScore(float(item.get("score", 0.0))),
            )
        )
    return detections


def _convert_raw_mask(raw: dict[str, Any], *, index: int) -> TrackingMask:
    """Translate a raw SAM 3.1 mask payload into a domain ``TrackingMask``."""
    rle = raw.get("rle")
    if not isinstance(rle, dict):
        rle = {"size": raw.get("size", [0, 0]), "counts": raw.get("counts", "")}
    return TrackingMask(
        object_id=int(raw.get("object_id", index)),
        mask_rle=rle,
        confidence=ConfidenceScore(float(raw.get("score", 1.0))),
        is_occluded=bool(raw.get("is_occluded", False)),
    )
