"""
Video processing utilities for frame extraction and audio processing.

This module provides functions for extracting frames from videos using OpenCV
and extracting audio using FFmpeg. It supports various sampling strategies and
output formats.
"""

import asyncio
import os
import subprocess
import tempfile
from pathlib import Path
from typing import List, Optional, Tuple

import cv2
import numpy as np
from opentelemetry import trace

tracer = trace.get_tracer(__name__)


class VideoProcessingError(Exception):
    """Raised when video processing operations fail."""

    pass


class VideoInfo:
    """
    Container for video metadata.

    Attributes:
        path: Path to the video file
        frame_count: Total number of frames in the video
        fps: Frames per second
        duration: Duration in seconds
        width: Frame width in pixels
        height: Frame height in pixels
    """

    def __init__(
        self,
        path: str,
        frame_count: int,
        fps: float,
        duration: float,
        width: int,
        height: int,
    ):
        self.path = path
        self.frame_count = frame_count
        self.fps = fps
        self.duration = duration
        self.width = width
        self.height = height


def get_video_info(video_path: str) -> VideoInfo:
    """
    Extract metadata from a video file.

    Args:
        video_path: Path to the video file

    Returns:
        VideoInfo object containing video metadata

    Raises:
        VideoProcessingError: If the video cannot be opened or read
    """
    with tracer.start_as_current_span("get_video_info") as span:
        span.set_attribute("video.path", video_path)

        if not os.path.exists(video_path):
            raise VideoProcessingError(f"Video file not found: {video_path}")

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise VideoProcessingError(f"Could not open video: {video_path}")

        try:
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = float(cap.get(cv2.CAP_PROP_FPS))
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            duration = frame_count / fps if fps > 0 else 0

            span.set_attribute("video.frame_count", frame_count)
            span.set_attribute("video.fps", fps)
            span.set_attribute("video.duration", duration)
            span.set_attribute("video.width", width)
            span.set_attribute("video.height", height)

            return VideoInfo(
                path=video_path,
                frame_count=frame_count,
                fps=fps,
                duration=duration,
                width=width,
                height=height,
            )
        finally:
            cap.release()


def extract_frame(video_path: str, frame_number: int) -> np.ndarray:
    """
    Extract a single frame from a video.

    Args:
        video_path: Path to the video file
        frame_number: Frame index to extract (0-based)

    Returns:
        Frame as a numpy array in RGB format

    Raises:
        VideoProcessingError: If frame extraction fails
    """
    with tracer.start_as_current_span("extract_frame") as span:
        span.set_attribute("video.path", video_path)
        span.set_attribute("video.frame_number", frame_number)

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise VideoProcessingError(f"Could not open video: {video_path}")

        try:
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
            ret, frame = cap.read()

            if not ret:
                raise VideoProcessingError(
                    f"Could not read frame {frame_number} from {video_path}"
                )

            # Convert BGR to RGB
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            return frame_rgb
        finally:
            cap.release()


def extract_frames_uniform(
    video_path: str,
    num_frames: int = 10,
    max_dimension: Optional[int] = None,
) -> List[Tuple[int, np.ndarray]]:
    """
    Extract frames uniformly sampled from a video.

    Args:
        video_path: Path to the video file
        num_frames: Number of frames to extract
        max_dimension: Maximum width or height for resizing (maintains aspect ratio)

    Returns:
        List of tuples containing (frame_number, frame_array)

    Raises:
        VideoProcessingError: If frame extraction fails
    """
    with tracer.start_as_current_span("extract_frames_uniform") as span:
        span.set_attribute("video.path", video_path)
        span.set_attribute("video.num_frames", num_frames)

        info = get_video_info(video_path)

        if num_frames > info.frame_count:
            num_frames = info.frame_count

        # Calculate frame indices for uniform sampling
        frame_indices = np.linspace(
            0, info.frame_count - 1, num_frames, dtype=int
        ).tolist()

        frames = []
        cap = cv2.VideoCapture(video_path)

        try:
            for idx in frame_indices:
                cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
                ret, frame = cap.read()

                if not ret:
                    continue

                # Convert BGR to RGB
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

                # Resize if needed
                if max_dimension is not None:
                    frame_rgb = resize_frame(frame_rgb, max_dimension)

                frames.append((idx, frame_rgb))

            span.set_attribute("video.frames_extracted", len(frames))
            return frames
        finally:
            cap.release()


def extract_frames_by_rate(
    video_path: str,
    sample_rate: int = 30,
    max_dimension: Optional[int] = None,
) -> List[Tuple[int, np.ndarray]]:
    """
    Extract frames at a specified sampling rate.

    Args:
        video_path: Path to the video file
        sample_rate: Extract one frame every N frames
        max_dimension: Maximum width or height for resizing (maintains aspect ratio)

    Returns:
        List of tuples containing (frame_number, frame_array)

    Raises:
        VideoProcessingError: If frame extraction fails
    """
    with tracer.start_as_current_span("extract_frames_by_rate") as span:
        span.set_attribute("video.path", video_path)
        span.set_attribute("video.sample_rate", sample_rate)

        info = get_video_info(video_path)
        frame_indices = list(range(0, info.frame_count, sample_rate))

        frames = []
        cap = cv2.VideoCapture(video_path)

        try:
            for idx in frame_indices:
                cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
                ret, frame = cap.read()

                if not ret:
                    continue

                # Convert BGR to RGB
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

                # Resize if needed
                if max_dimension is not None:
                    frame_rgb = resize_frame(frame_rgb, max_dimension)

                frames.append((idx, frame_rgb))

            span.set_attribute("video.frames_extracted", len(frames))
            return frames
        finally:
            cap.release()


def resize_frame(frame: np.ndarray, max_dimension: int) -> np.ndarray:
    """
    Resize a frame maintaining aspect ratio.

    Args:
        frame: Input frame as numpy array
        max_dimension: Maximum width or height

    Returns:
        Resized frame
    """
    height, width = frame.shape[:2]

    if height > width:
        if height > max_dimension:
            ratio = max_dimension / height
            new_height = max_dimension
            new_width = int(width * ratio)
        else:
            return frame
    else:
        if width > max_dimension:
            ratio = max_dimension / width
            new_width = max_dimension
            new_height = int(height * ratio)
        else:
            return frame

    return cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_AREA)


async def extract_audio(
    video_path: str,
    output_path: Optional[str] = None,
    sample_rate: int = 16000,
    channels: int = 1,
) -> str:
    """
    Extract audio from a video file using FFmpeg.

    Args:
        video_path: Path to the video file
        output_path: Path for output audio file (defaults to temp file)
        sample_rate: Audio sample rate in Hz
        channels: Number of audio channels (1=mono, 2=stereo)

    Returns:
        Path to the extracted audio file

    Raises:
        VideoProcessingError: If audio extraction fails
    """
    with tracer.start_as_current_span("extract_audio") as span:
        span.set_attribute("video.path", video_path)
        span.set_attribute("audio.sample_rate", sample_rate)
        span.set_attribute("audio.channels", channels)

        if not os.path.exists(video_path):
            raise VideoProcessingError(f"Video file not found: {video_path}")

        # Create output path if not provided
        if output_path is None:
            temp_dir = tempfile.gettempdir()
            output_filename = f"{Path(video_path).stem}_audio.wav"
            output_path = os.path.join(temp_dir, output_filename)

        span.set_attribute("audio.output_path", output_path)

        # Build FFmpeg command
        cmd = [
            "ffmpeg",
            "-i",
            video_path,
            "-vn",  # No video
            "-acodec",
            "pcm_s16le",  # PCM 16-bit little-endian
            "-ar",
            str(sample_rate),
            "-ac",
            str(channels),
            "-y",  # Overwrite output file
            output_path,
        ]

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown error"
                raise VideoProcessingError(
                    f"FFmpeg failed with return code {process.returncode}: {error_msg}"
                )

            if not os.path.exists(output_path):
                raise VideoProcessingError(f"Output audio file not created: {output_path}")

            span.set_attribute("audio.success", True)
            return output_path

        except FileNotFoundError:
            raise VideoProcessingError(
                "FFmpeg not found. Please install FFmpeg and ensure it's in your PATH."
            )
        except Exception as e:
            raise VideoProcessingError(f"Audio extraction failed: {str(e)}")


def check_ffmpeg_available() -> bool:
    """
    Check if FFmpeg is available in the system PATH.

    Returns:
        True if FFmpeg is available, False otherwise
    """
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=5,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False
