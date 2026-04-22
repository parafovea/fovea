"""Adapter exposing :class:`VLMLoader` via the :class:`IVisionLanguageModel` port."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from PIL import Image

from src.application.ports.outbound.vlm import IVisionLanguageModel
from src.infrastructure.observability.telemetry import record_inference

if TYPE_CHECKING:
    import numpy as np
    from numpy.typing import NDArray

    from src.infrastructure.adapters.outbound.models.vlm.loader import VLMLoader


class VLMLoaderAdapter(IVisionLanguageModel):
    """Adapts an existing :class:`VLMLoader` to the vision-language port."""

    def __init__(self, loader: VLMLoader, *, vram_gb: float = 0.0) -> None:
        """Initialize with a loader instance."""
        self._loader = loader
        self._loaded = False
        self._vram_gb = float(vram_gb)

    def generate(
        self,
        images: list[NDArray[np.uint8]],
        prompt: str,
        max_tokens: int = 512,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> str:
        """Generate text from images and a prompt."""
        pil_images = [Image.fromarray(arr) for arr in images]
        with record_inference(task="vlm_generate", model_id=self.model_id):
            result = self._loader.generate(
                images=pil_images,
                prompt=prompt,
                max_new_tokens=max_tokens,
                temperature=temperature,
            )
        return str(result)

    def load(self) -> None:
        """Load the model into memory."""
        if self._loaded:
            return
        self._loader.load()
        self._loaded = True

    def unload(self) -> None:
        """Unload the model from memory."""
        if not self._loaded:
            return
        self._loader.unload()
        self._loaded = False

    @property
    def is_loaded(self) -> bool:
        """Return True if the model is currently loaded."""
        return self._loaded

    @property
    def model_id(self) -> str:
        """Return the model identifier."""
        return str(self._loader.config.model_id)

    @property
    def vram_gb(self) -> float:
        """Return the advertised VRAM requirement."""
        return self._vram_gb
