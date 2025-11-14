"""Video downloader utility for handling remote video URLs.

Supports downloading videos from HTTP/HTTPS URLs (including S3 pre-signed URLs)
to temporary local files for processing.
"""

import logging
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import aiofiles
import aiohttp

logger = logging.getLogger(__name__)


async def download_video_if_needed(video_path: str) -> tuple[str, bool]:
    """Download video from URL if needed, otherwise return local path.

    Parameters
    ----------
    video_path : str
        Video path - can be local filesystem path or HTTP/HTTPS URL

    Returns
    -------
    Tuple[str, bool]
        Tuple of (local_path, is_temp_file)
        - local_path: Path to the local video file
        - is_temp_file: True if file was downloaded and should be cleaned up

    Raises
    ------
    ValueError
        If URL is invalid or unsupported
    aiohttp.ClientError
        If download fails
    """
    # Check if this is a URL
    if not video_path.startswith(("http://", "https://")):
        # Local file path - return as-is
        return video_path, False

    logger.info(f"Downloading video from URL: {video_path[:100]}...")

    # Parse URL to get file extension
    parsed_url = urlparse(video_path)
    path_obj = Path(parsed_url.path)
    extension = path_obj.suffix or ".mp4"

    # Create temporary file with appropriate extension
    temp_file = tempfile.NamedTemporaryFile(
        delete=False, suffix=extension, prefix="video_", dir="/tmp"
    )
    temp_path = temp_file.name
    temp_file.close()

    try:
        # Download video
        async with aiohttp.ClientSession() as session:
            async with session.get(video_path) as response:
                response.raise_for_status()

                # Get total size for logging
                total_size = response.headers.get("Content-Length")
                if total_size:
                    logger.info(f"Downloading {int(total_size) / (1024 * 1024):.2f} MB...")

                # Write to temporary file
                async with aiofiles.open(temp_path, "wb") as f:
                    bytes_downloaded = 0
                    async for chunk in response.content.iter_chunked(8192):
                        await f.write(chunk)
                        bytes_downloaded += len(chunk)

                logger.info(f"Downloaded {bytes_downloaded / (1024 * 1024):.2f} MB to {temp_path}")

        return temp_path, True

    except Exception as e:
        # Clean up temp file on error
        try:
            Path(temp_path).unlink(missing_ok=True)
        except Exception:
            pass
        raise RuntimeError(f"Failed to download video: {e}") from e


def cleanup_temp_video(video_path: str) -> None:
    """Clean up temporary video file.

    Parameters
    ----------
    video_path : str
        Path to temporary video file to remove
    """
    try:
        Path(video_path).unlink(missing_ok=True)
        logger.info(f"Cleaned up temporary video: {video_path}")
    except Exception as e:
        logger.warning(f"Failed to clean up temporary video {video_path}: {e}")
