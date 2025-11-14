"""Audio processing utilities for transcription and analysis.

This module provides functions for extracting, resampling, and chunking audio from
video files using FFmpeg. Supports multi-track selection, segment extraction, and
audio format conversions for model input preparation.
"""

import asyncio
import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from numpy.typing import NDArray
from opentelemetry import trace

tracer = trace.get_tracer(__name__)
logger = logging.getLogger(__name__)


class AudioProcessingError(Exception):
    """Raised when audio processing operations fail."""


async def has_audio_stream(video_path: str) -> bool:
    """Check if video file contains audio streams.

    Parameters
    ----------
    video_path : str
        Path to the video file.

    Returns
    -------
    bool
        True if video has at least one audio stream, False otherwise.
    """
    with tracer.start_as_current_span("has_audio_stream") as span:
        span.set_attribute("video.path", video_path)

        try:
            process = await asyncio.create_subprocess_exec(
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-show_entries",
                "stream=codec_type",
                "-of",
                "csv=p=0",
                video_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await process.communicate()

            has_audio = stdout.decode().strip() == "audio"
            span.set_attribute("audio.has_stream", has_audio)
            return has_audio

        except Exception as e:
            logger.warning(f"Failed to check audio stream: {e}")
            return False


async def get_audio_info(video_path: str) -> dict[str, str | int | float]:
    """Get audio stream metadata from video file.

    Parameters
    ----------
    video_path : str
        Path to the video file.

    Returns
    -------
    dict[str, str | int | float]
        Dictionary containing audio stream metadata with keys:
        - codec (str): Audio codec name
        - sample_rate (int): Sample rate in Hz
        - channels (int): Number of audio channels
        - duration (float): Duration in seconds
        - bitrate (int): Bitrate in bits per second

    Raises
    ------
    AudioProcessingError
        If video has no audio stream or ffprobe fails.
    """
    with tracer.start_as_current_span("get_audio_info") as span:
        span.set_attribute("video.path", video_path)

        try:
            process = await asyncio.create_subprocess_exec(
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-show_entries",
                "stream=codec_name,sample_rate,channels,duration,bit_rate",
                "-of",
                "json",
                video_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown error"
                raise AudioProcessingError(f"ffprobe failed: {error_msg}")

            data = json.loads(stdout.decode())

            if not data.get("streams"):
                raise AudioProcessingError(f"No audio stream found in {video_path}")

            stream = data["streams"][0]
            audio_info = {
                "codec": stream.get("codec_name", "unknown"),
                "sample_rate": int(stream.get("sample_rate", 0)),
                "channels": int(stream.get("channels", 0)),
                "duration": float(stream.get("duration", 0)),
                "bitrate": int(stream.get("bit_rate", 0)),
            }

            span.set_attribute("audio.codec", audio_info["codec"])
            span.set_attribute("audio.sample_rate", audio_info["sample_rate"])
            span.set_attribute("audio.channels", audio_info["channels"])
            span.set_attribute("audio.duration", audio_info["duration"])

            return audio_info

        except json.JSONDecodeError as e:
            raise AudioProcessingError(f"Failed to parse audio info: {e}") from e
        except Exception as e:
            raise AudioProcessingError(f"Failed to get audio info: {e}") from e


async def extract_audio_segment(
    video_path: str,
    start_time: float,
    duration: float,
    output_path: str | None = None,
    sample_rate: int = 16000,
    channels: int = 1,
) -> str:
    """Extract audio segment from video file.

    Parameters
    ----------
    video_path : str
        Path to the input video file.
    start_time : float
        Start time in seconds.
    duration : float
        Duration of segment in seconds.
    output_path : str | None, default=None
        Path for output audio file. If None, creates temporary file.
    sample_rate : int, default=16000
        Target sample rate in Hz.
    channels : int, default=1
        Number of audio channels (1=mono, 2=stereo).

    Returns
    -------
    str
        Path to the extracted audio segment.

    Raises
    ------
    AudioProcessingError
        If extraction fails or video has no audio.
    """
    with tracer.start_as_current_span("extract_audio_segment") as span:
        span.set_attribute("video.path", video_path)
        span.set_attribute("audio.start_time", start_time)
        span.set_attribute("audio.duration", duration)

        if not await has_audio_stream(video_path):
            raise AudioProcessingError(f"Video {video_path} has no audio stream")

        if output_path is None:
            temp_dir = Path(tempfile.gettempdir())
            output_filename = f"{Path(video_path).stem}_segment_{start_time}_{duration}.wav"
            output_path = str(temp_dir / output_filename)

        try:
            process = await asyncio.create_subprocess_exec(
                "ffmpeg",
                "-y",
                "-ss",
                str(start_time),
                "-t",
                str(duration),
                "-i",
                video_path,
                "-ar",
                str(sample_rate),
                "-ac",
                str(channels),
                "-c:a",
                "pcm_s16le",
                "-vn",
                output_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=60)

            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown error"
                raise AudioProcessingError(f"FFmpeg segment extraction failed: {error_msg}")

            if not Path(output_path).exists():
                raise AudioProcessingError(f"Output file not created: {output_path}")

            span.set_attribute("audio.output_path", output_path)
            logger.info(
                f"Extracted audio segment: {start_time}s-{start_time + duration}s from {video_path}"
            )

            return output_path

        except TimeoutError as e:
            raise AudioProcessingError("Segment extraction timed out after 60s") from e
        except Exception as e:
            raise AudioProcessingError(f"Segment extraction failed: {e}") from e


async def chunk_audio_file(
    audio_path: str, chunk_duration: float = 30.0, overlap: float = 1.0
) -> list[tuple[float, float]]:
    """Calculate chunk boundaries for audio file processing.

    Parameters
    ----------
    audio_path : str
        Path to the audio file.
    chunk_duration : float, default=30.0
        Duration of each chunk in seconds.
    overlap : float, default=1.0
        Overlap between chunks in seconds to avoid boundary effects.

    Returns
    -------
    list[tuple[float, float]]
        List of (start_time, duration) tuples for each chunk.

    Raises
    ------
    AudioProcessingError
        If audio duration extraction fails.
    """
    with tracer.start_as_current_span("chunk_audio_file") as span:
        span.set_attribute("audio.path", audio_path)
        span.set_attribute("audio.chunk_duration", chunk_duration)
        span.set_attribute("audio.overlap", overlap)

        try:
            process = await asyncio.create_subprocess_exec(
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "csv=p=0",
                audio_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown error"
                raise AudioProcessingError(f"ffprobe failed: {error_msg}")

            total_duration = float(stdout.decode().strip())

            chunks = []
            current_time = 0.0

            while current_time < total_duration:
                remaining = total_duration - current_time
                duration = min(chunk_duration, remaining)
                chunks.append((current_time, duration))
                current_time += chunk_duration - overlap

            span.set_attribute("audio.chunk_count", len(chunks))
            span.set_attribute("audio.total_duration", total_duration)

            return chunks

        except ValueError as e:
            raise AudioProcessingError(f"Failed to parse audio duration: {e}") from e
        except Exception as e:
            raise AudioProcessingError(f"Failed to chunk audio: {e}") from e


async def load_audio_array(
    audio_path: str, sample_rate: int = 16000
) -> tuple[NDArray[np.float32], int]:
    """Load audio file into numpy array for model input.

    Parameters
    ----------
    audio_path : str
        Path to the audio file (WAV format).
    sample_rate : int, default=16000
        Expected sample rate in Hz.

    Returns
    -------
    tuple[NDArray[np.float32], int]
        Tuple containing:
        - audio_array: Float32 array normalized to [-1.0, 1.0]
        - sample_rate: Actual sample rate in Hz

    Raises
    ------
    AudioProcessingError
        If loading or decoding fails.
    """
    with tracer.start_as_current_span("load_audio_array") as span:
        span.set_attribute("audio.path", audio_path)
        span.set_attribute("audio.sample_rate", sample_rate)

        try:
            process = await asyncio.create_subprocess_exec(
                "ffmpeg",
                "-i",
                audio_path,
                "-f",
                "s16le",
                "-acodec",
                "pcm_s16le",
                "-ar",
                str(sample_rate),
                "-ac",
                "1",
                "-",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown error"
                raise AudioProcessingError(f"FFmpeg failed: {error_msg}")

            audio_int16 = np.frombuffer(stdout, dtype=np.int16)
            audio_array: NDArray[np.float32] = audio_int16.astype(np.float32) / 32768.0

            span.set_attribute("audio.array_length", len(audio_array))

            return audio_array, sample_rate

        except Exception as e:
            raise AudioProcessingError(f"Failed to load audio array: {e}") from e


async def get_audio_duration(audio_path: str) -> float:
    """Get audio file duration in seconds.

    Parameters
    ----------
    audio_path : str
        Path to the audio file.

    Returns
    -------
    float
        Duration in seconds.

    Raises
    ------
    AudioProcessingError
        If duration extraction fails.
    """
    with tracer.start_as_current_span("get_audio_duration") as span:
        span.set_attribute("audio.path", audio_path)

        try:
            process = await asyncio.create_subprocess_exec(
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "csv=p=0",
                audio_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown error"
                raise AudioProcessingError(f"ffprobe failed: {error_msg}")

            duration = float(stdout.decode().strip())
            span.set_attribute("audio.duration", duration)

            return duration

        except ValueError as e:
            raise AudioProcessingError(f"Failed to parse duration: {e}") from e
        except Exception as e:
            raise AudioProcessingError(f"Failed to get duration: {e}") from e


async def extract_audio_track(
    video_path: str,
    track_index: int = 0,
    output_path: str | None = None,
    sample_rate: int = 16000,
    channels: int = 1,
) -> str:
    """Extract specific audio track from video file.

    Parameters
    ----------
    video_path : str
        Path to the video file.
    track_index : int, default=0
        Audio track index to extract (0-indexed).
    output_path : str | None, default=None
        Path for output audio file. If None, creates temporary file.
    sample_rate : int, default=16000
        Target sample rate in Hz.
    channels : int, default=1
        Number of audio channels (1=mono, 2=stereo).

    Returns
    -------
    str
        Path to the extracted audio file.

    Raises
    ------
    AudioProcessingError
        If extraction fails or track does not exist.
    """
    with tracer.start_as_current_span("extract_audio_track") as span:
        span.set_attribute("video.path", video_path)
        span.set_attribute("audio.track_index", track_index)

        if not await has_audio_stream(video_path):
            raise AudioProcessingError(f"Video {video_path} has no audio streams")

        if output_path is None:
            temp_dir = Path(tempfile.gettempdir()).resolve()
            output_filename = f"{Path(video_path).stem}_track{track_index}.wav"
            output_path = str(temp_dir / output_filename)
        else:
            # Validate output_path is within temp directory to prevent path traversal
            output_path_resolved = Path(output_path).resolve()
            temp_dir_resolved = Path(tempfile.gettempdir()).resolve()
            try:
                if os.path.commonpath([str(output_path_resolved), str(temp_dir_resolved)]) != str(
                    temp_dir_resolved
                ):
                    raise AudioProcessingError(
                        f"Output path must be within temp directory: {output_path}"
                    )
            except ValueError:
                # commonpath raises ValueError if paths are on different drives
                raise AudioProcessingError(
                    f"Output path must be within temp directory: {output_path}"
                ) from None

        try:
            process = await asyncio.create_subprocess_exec(
                "ffmpeg",
                "-y",
                "-i",
                video_path,
                "-map",
                f"0:a:{track_index}",
                "-ar",
                str(sample_rate),
                "-ac",
                str(channels),
                "-c:a",
                "pcm_s16le",
                "-vn",
                output_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=300)

            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown error"
                raise AudioProcessingError(f"FFmpeg extraction failed: {error_msg}")

            if not Path(output_path).exists():
                raise AudioProcessingError(f"Output file not created: {output_path}")

            span.set_attribute("audio.output_path", output_path)
            safe_video_path = str(video_path).replace("\r", "").replace("\n", "")
            logger.info(f"Extracted audio track {track_index} from {safe_video_path}")

            return output_path

        except TimeoutError as e:
            raise AudioProcessingError("Audio extraction timed out after 300s") from e
        except Exception as e:
            raise AudioProcessingError(f"Audio extraction failed: {e}") from e


def check_ffmpeg_available() -> bool:
    """Check if FFmpeg is available in the system PATH.

    Returns
    -------
    bool
        True if FFmpeg is available, False otherwise.
    """
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            timeout=5,
            check=False,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def check_ffprobe_available() -> bool:
    """Check if FFprobe is available in the system PATH.

    Returns
    -------
    bool
        True if FFprobe is available, False otherwise.
    """
    try:
        result = subprocess.run(
            ["ffprobe", "-version"],
            capture_output=True,
            timeout=5,
            check=False,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False
