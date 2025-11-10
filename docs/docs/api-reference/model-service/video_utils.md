---
sidebar_label: video_utils
title: video_utils
---

Video processing utilities for frame extraction and audio processing.

This module provides functions for extracting frames from videos using OpenCV
and extracting audio using FFmpeg. It supports various sampling strategies and
output formats.

## asyncio

## subprocess

## tempfile

## Path

## Any

## cv2

## np

## NDArray

## trace

#### tracer

## VideoProcessingError Objects

```python
class VideoProcessingError(Exception)
```

Raised when video processing operations fail.

## VideoInfo Objects

```python
class VideoInfo()
```

Container for video metadata.

Attributes
----------
path : str
    Path to the video file.
frame_count : int
    Total number of frames in the video.
fps : float
    Frames per second.
duration : float
    Duration in seconds.
width : int
    Frame width in pixels.
height : int
    Frame height in pixels.

#### \_\_init\_\_

```python
def __init__(path: str, frame_count: int, fps: float, duration: float,
             width: int, height: int) -> None
```

#### get\_video\_info

```python
def get_video_info(video_path: str) -> VideoInfo
```

Extract metadata from a video file.

Parameters
----------
video_path : str
    Path to the video file.

Returns
-------
VideoInfo
    Video metadata object.

Raises
------
VideoProcessingError
    If the video cannot be opened or read.

#### extract\_frame

```python
def extract_frame(video_path: str, frame_number: int) -> NDArray[Any]
```

Extract a single frame from a video.

Parameters
----------
video_path : str
    Path to the video file.
frame_number : int
    Frame index to extract (zero-indexed).

Returns
-------
np.ndarray
    Frame as numpy array in RGB format.

Raises
------
VideoProcessingError
    If frame extraction fails.

#### extract\_frames\_uniform

```python
def extract_frames_uniform(
        video_path: str,
        num_frames: int = 10,
        max_dimension: int | None = None) -> list[tuple[int, NDArray[Any]]]
```

Extract frames uniformly sampled from a video.

Parameters
----------
video_path : str
    Path to the video file.
num_frames : int, default=10
    Number of frames to extract.
max_dimension : int | None, default=None
    Maximum width or height for resizing (maintains aspect ratio).
    If None, frames are not resized.

Returns
-------
list[tuple[int, np.ndarray]]
    List of tuples containing (frame_number, frame_array).

Raises
------
VideoProcessingError
    If frame extraction fails.

#### extract\_frames\_by\_rate

```python
def extract_frames_by_rate(
        video_path: str,
        sample_rate: int = 30,
        max_dimension: int | None = None) -> list[tuple[int, NDArray[Any]]]
```

Extract frames at a specified sampling rate.

Parameters
----------
video_path : str
    Path to the video file.
sample_rate : int, default=30
    Extract one frame every N frames.
max_dimension : int | None, default=None
    Maximum width or height for resizing (maintains aspect ratio).
    If None, frames are not resized.

Returns
-------
list[tuple[int, np.ndarray]]
    List of tuples containing (frame_number, frame_array).

Raises
------
VideoProcessingError
    If frame extraction fails.

#### resize\_frame

```python
def resize_frame(frame: NDArray[Any], max_dimension: int) -> NDArray[Any]
```

Resize a frame maintaining aspect ratio.

Parameters
----------
frame : np.ndarray
    Input frame as numpy array.
max_dimension : int
    Maximum width or height in pixels.

Returns
-------
np.ndarray
    Resized frame.

#### extract\_audio

```python
async def extract_audio(video_path: str,
                        output_path: str | None = None,
                        sample_rate: int = 16000,
                        channels: int = 1) -> str
```

Extract audio from a video file using FFmpeg.

Parameters
----------
video_path : str
    Path to the video file.
output_path : str | None, default=None
    Path for output audio file. If None, creates temp file.
sample_rate : int, default=16000
    Audio sample rate in Hz.
channels : int, default=1
    Number of audio channels (1=mono, 2=stereo).

Returns
-------
str
    Path to the extracted audio file.

Raises
------
VideoProcessingError
    If audio extraction fails.

#### check\_ffmpeg\_available

```python
def check_ffmpeg_available() -> bool
```

Check if FFmpeg is available in the system PATH.

Returns
-------
bool
    True if FFmpeg is available, False otherwise.

