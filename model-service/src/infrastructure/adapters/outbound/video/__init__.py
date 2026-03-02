"""Video processing adapters.

This package contains adapters for video processing operations that
implement the IVideoProcessor outbound port interface.

Modules
-------
processor
    OpenCV/FFmpeg-based video processing adapter.
downloader
    Video downloader for S3/HTTP URLs.
"""

from src.infrastructure.adapters.outbound.video.downloader import (
    cleanup_temp_video,
    download_video_if_needed,
)
from src.infrastructure.adapters.outbound.video.processor import (
    VideoInfo,
    VideoProcessingError,
    extract_audio,
    extract_frames_uniform,
    get_video_info,
)

__all__ = [
    "VideoInfo",
    "VideoProcessingError",
    "cleanup_temp_video",
    "download_video_if_needed",
    "extract_audio",
    "extract_frames_uniform",
    "get_video_info",
]
