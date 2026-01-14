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
    download_video,
    is_remote_url,
)
from src.infrastructure.adapters.outbound.video.processor import (
    VideoInfo,
    VideoProcessingError,
    extract_audio,
    extract_frames,
    extract_frames_at_timestamps,
    get_video_info,
)

__all__ = [
    "VideoInfo",
    "VideoProcessingError",
    "download_video",
    "extract_audio",
    "extract_frames",
    "extract_frames_at_timestamps",
    "get_video_info",
    "is_remote_url",
]
