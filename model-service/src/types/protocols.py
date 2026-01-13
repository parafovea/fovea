"""Protocol definitions for structural subtyping.

This module defines Protocol classes that specify interfaces for models,
loaders, and services using Python's structural subtyping system. Protocols
enable duck typing with static type checking support.
"""

from typing import Any, Protocol, runtime_checkable

import numpy as np
from numpy.typing import NDArray


@runtime_checkable
class TextGenerator(Protocol):
    """Protocol for text generation models (LLMs)."""

    def generate(
        self,
        prompt: str,
        max_tokens: int = 512,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> str:
        """Generate text from a prompt.

        Parameters
        ----------
        prompt : str
            Input prompt for generation.
        max_tokens : int, default=512
            Maximum tokens to generate.
        temperature : float, default=0.7
            Sampling temperature.
        **kwargs : Any
            Additional generation parameters.

        Returns
        -------
        str
            Generated text.
        """
        ...


@runtime_checkable
class VisionLanguageModel(Protocol):
    """Protocol for vision-language models (VLMs)."""

    def generate(
        self,
        images: list[NDArray[np.uint8]],
        prompt: str,
        max_tokens: int = 512,
        **kwargs: Any,
    ) -> str:
        """Generate text from images and a prompt.

        Parameters
        ----------
        images : list[NDArray[np.uint8]]
            List of images as numpy arrays.
        prompt : str
            Text prompt for generation.
        max_tokens : int, default=512
            Maximum tokens to generate.
        **kwargs : Any
            Additional generation parameters.

        Returns
        -------
        str
            Generated text describing the images.
        """
        ...


@runtime_checkable
class ObjectDetector(Protocol):
    """Protocol for object detection models."""

    def detect(
        self,
        image: NDArray[np.uint8],
        query: str,
        confidence_threshold: float = 0.3,
    ) -> list[dict[str, Any]]:
        """Detect objects in an image.

        Parameters
        ----------
        image : NDArray[np.uint8]
            Input image as numpy array.
        query : str
            Text query describing objects to detect.
        confidence_threshold : float, default=0.3
            Minimum confidence for detections.

        Returns
        -------
        list[dict[str, Any]]
            List of detection results with bounding boxes and labels.
        """
        ...


@runtime_checkable
class VideoTracker(Protocol):
    """Protocol for video object tracking models."""

    def initialize(
        self,
        frame: NDArray[np.uint8],
        masks: list[NDArray[np.bool_]],
        object_ids: list[int],
    ) -> None:
        """Initialize tracking with first frame and masks.

        Parameters
        ----------
        frame : NDArray[np.uint8]
            First frame as numpy array.
        masks : list[NDArray[np.bool_]]
            Initial segmentation masks.
        object_ids : list[int]
            IDs for tracked objects.
        """
        ...

    def track(
        self,
        frame: NDArray[np.uint8],
    ) -> dict[int, dict[str, Any]]:
        """Track objects in a frame.

        Parameters
        ----------
        frame : NDArray[np.uint8]
            Current frame as numpy array.

        Returns
        -------
        dict[int, dict[str, Any]]
            Mapping of object IDs to tracking results with masks.
        """
        ...


@runtime_checkable
class AudioTranscriber(Protocol):
    """Protocol for audio transcription models."""

    def transcribe(
        self,
        audio_path: str,
        language: str | None = None,
    ) -> dict[str, Any]:
        """Transcribe audio to text.

        Parameters
        ----------
        audio_path : str
            Path to audio file.
        language : str | None, default=None
            Language code for transcription.

        Returns
        -------
        dict[str, Any]
            Transcription result with text and segments.
        """
        ...


@runtime_checkable
class SpeakerDiarizer(Protocol):
    """Protocol for speaker diarization models."""

    def diarize(
        self,
        audio_path: str,
        num_speakers: int | None = None,
    ) -> list[dict[str, Any]]:
        """Identify speakers in audio.

        Parameters
        ----------
        audio_path : str
            Path to audio file.
        num_speakers : int | None, default=None
            Expected number of speakers.

        Returns
        -------
        list[dict[str, Any]]
            List of speaker segments with timestamps.
        """
        ...


@runtime_checkable
class VoiceActivityDetector(Protocol):
    """Protocol for voice activity detection models."""

    def detect_speech(
        self,
        audio_path: str,
    ) -> list[tuple[float, float]]:
        """Detect speech segments in audio.

        Parameters
        ----------
        audio_path : str
            Path to audio file.

        Returns
        -------
        list[tuple[float, float]]
            List of (start, end) timestamps for speech segments.
        """
        ...


@runtime_checkable
class ModelLoader(Protocol):
    """Protocol for model loaders that manage lifecycle."""

    def load(self) -> None:
        """Load the model into memory."""
        ...

    def unload(self) -> None:
        """Unload the model from memory."""
        ...

    @property
    def is_loaded(self) -> bool:
        """Check if model is currently loaded."""
        ...


@runtime_checkable
class AsyncModelLoader(Protocol):
    """Protocol for async model loaders."""

    async def load(self) -> None:
        """Load the model into memory asynchronously."""
        ...

    async def unload(self) -> None:
        """Unload the model from memory asynchronously."""
        ...

    @property
    def is_loaded(self) -> bool:
        """Check if model is currently loaded."""
        ...


@runtime_checkable
class ExternalAPIClient(Protocol):
    """Protocol for external API clients."""

    async def generate(
        self,
        prompt: str,
        images: list[str] | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Generate response from external API.

        Parameters
        ----------
        prompt : str
            Text prompt.
        images : list[str] | None, default=None
            Base64-encoded images for vision APIs.
        **kwargs : Any
            Additional API parameters.

        Returns
        -------
        dict[str, Any]
            API response with content and usage.
        """
        ...


@runtime_checkable
class VideoProcessor(Protocol):
    """Protocol for video processing utilities."""

    def extract_frames(
        self,
        video_path: str,
        frame_indices: list[int] | None = None,
        sample_rate: int = 1,
        max_frames: int = 30,
    ) -> list[NDArray[np.uint8]]:
        """Extract frames from a video.

        Parameters
        ----------
        video_path : str
            Path to video file.
        frame_indices : list[int] | None, default=None
            Specific frame indices to extract.
        sample_rate : int, default=1
            Frames to sample per second.
        max_frames : int, default=30
            Maximum frames to extract.

        Returns
        -------
        list[NDArray[np.uint8]]
            List of extracted frames as numpy arrays.
        """
        ...

    def get_video_info(
        self,
        video_path: str,
    ) -> dict[str, Any]:
        """Get video metadata.

        Parameters
        ----------
        video_path : str
            Path to video file.

        Returns
        -------
        dict[str, Any]
            Video metadata (fps, duration, width, height, etc.).
        """
        ...
