"""Fake VLM loader for testing.

This module provides a fake VLM loader that returns configurable
canned responses without loading actual models.
"""

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import numpy as np
    from numpy.typing import NDArray


@dataclass
class FakeVLMConfig:
    """Configuration for fake VLM loader.

    Parameters
    ----------
    default_summary : str
        Default summary text to return.
    default_confidence : float
        Default confidence score.
    fail_on_generate : bool
        Whether to raise an error on generate().
    error_message : str
        Error message to raise when fail_on_generate is True.
    """

    default_summary: str = "Test video summary. This is a fake response."
    default_confidence: float = 0.85
    fail_on_generate: bool = False
    error_message: str = "Simulated VLM failure"


@dataclass
class FakeVLMLoader:
    """Fake VLM loader for testing.

    Returns configurable canned responses without loading actual models.
    Tracks call history for assertion in tests.

    Parameters
    ----------
    config : FakeVLMConfig | None
        Configuration for the fake loader.

    Examples
    --------
    >>> config = FakeVLMConfig(default_summary="Custom summary")
    >>> loader = FakeVLMLoader(config)
    >>> loader.load()
    >>> result = loader.generate([frame], "Summarize this video")
    >>> assert result == "Custom summary"
    """

    config: FakeVLMConfig | None = None
    _is_loaded: bool = field(default=False, init=False, repr=False)
    _call_history: list[dict[str, Any]] = field(default_factory=list, init=False, repr=False)

    def __post_init__(self) -> None:
        """Initialize default config if not provided."""
        if self.config is None:
            self.config = FakeVLMConfig()

    @property
    def is_loaded(self) -> bool:
        """Check if the model is loaded.

        Returns
        -------
        bool
            True if model is loaded.
        """
        return self._is_loaded

    @property
    def call_history(self) -> list[dict[str, Any]]:
        """Get the call history for assertions.

        Returns
        -------
        list[dict[str, Any]]
            List of calls made to generate().
        """
        return self._call_history

    def load(self) -> None:
        """Simulate loading the model."""
        self._is_loaded = True

    def unload(self) -> None:
        """Simulate unloading the model."""
        self._is_loaded = False
        self._call_history.clear()

    def generate(
        self,
        images: list[NDArray[np.uint8]],
        prompt: str,
        max_tokens: int = 512,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> str:
        """Generate summary from images.

        Parameters
        ----------
        images : list[NDArray[np.uint8]]
            List of image frames.
        prompt : str
            Prompt for the model.
        max_tokens : int
            Maximum tokens to generate.
        temperature : float
            Sampling temperature.
        **kwargs
            Additional generation parameters.

        Returns
        -------
        str
            Generated summary text.

        Raises
        ------
        RuntimeError
            If fail_on_generate is True.
        """
        assert self.config is not None

        self._call_history.append(
            {
                "num_images": len(images),
                "prompt": prompt,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "kwargs": kwargs,
            }
        )

        if self.config.fail_on_generate:
            raise RuntimeError(self.config.error_message)

        return self.config.default_summary

    def reset(self) -> None:
        """Reset the fake loader state."""
        self._call_history.clear()
