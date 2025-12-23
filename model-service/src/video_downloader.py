"""Video downloader utility for handling remote video URLs.

Supports downloading videos from HTTP/HTTPS URLs (including S3 pre-signed URLs)
to temporary local files for processing.
"""

import logging
import os
import re
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import aiofiles
import aiohttp

logger = logging.getLogger(__name__)


def _sanitize_for_log(value: str, max_length: int = 200) -> str:
    """Sanitize a string for safe logging to prevent log injection.

    Parameters
    ----------
    value : str
        String to sanitize
    max_length : int
        Maximum length of output string

    Returns
    -------
    str
        Sanitized string safe for logging
    """
    # Remove newlines, carriage returns, and other control characters
    sanitized = re.sub(r"[\r\n\t\x00-\x1f\x7f-\x9f]", " ", value)
    # Truncate to max length
    if len(sanitized) > max_length:
        sanitized = sanitized[:max_length] + "..."
    return sanitized

# Allowed URL patterns for video downloads (S3, common CDNs)
# This helps mitigate SSRF by restricting to expected video sources
ALLOWED_URL_PATTERNS = [
    r"^https?://.*\.s3\..*\.amazonaws\.com/",  # AWS S3
    r"^https?://.*\.s3\.amazonaws\.com/",  # AWS S3 (legacy)
    r"^https?://s3\..*\.amazonaws\.com/",  # AWS S3 (path style)
    r"^https?://.*\.cloudfront\.net/",  # CloudFront CDN
    r"^https?://storage\.googleapis\.com/",  # GCS
    r"^https?://.*\.blob\.core\.windows\.net/",  # Azure Blob
    r"^https?://localhost[:/]",  # Local development
    r"^https?://127\.0\.0\.1[:/]",  # Local development
]

# Temp directory for video downloads - intentionally using /tmp for ephemeral video storage
TEMP_VIDEO_DIR = "/tmp"  # noqa: S108


def _is_url_allowed(url: str) -> bool:
    """Check if URL matches allowed patterns for SSRF mitigation.

    Parameters
    ----------
    url : str
        URL to validate

    Returns
    -------
    bool
        True if URL matches an allowed pattern
    """
    return any(re.match(pattern, url, re.IGNORECASE) for pattern in ALLOWED_URL_PATTERNS)


def _is_safe_temp_path(path: str) -> bool:
    """Validate path is within temp directory to prevent path injection.

    Parameters
    ----------
    path : str
        Path to validate

    Returns
    -------
    bool
        True if path is safely within temp directory
    """
    try:
        # Resolve to absolute path and check it's under temp dir
        resolved = os.path.realpath(path)
        return resolved.startswith(TEMP_VIDEO_DIR + os.sep) or resolved == TEMP_VIDEO_DIR
    except (OSError, ValueError):
        return False


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

    # Validate URL against allowed patterns (SSRF mitigation)
    if not _is_url_allowed(video_path):
        # Log only URL scheme and host for security (avoid log injection)
        parsed = urlparse(video_path)
        logger.warning("URL does not match allowed patterns: %s://%s", parsed.scheme, parsed.netloc)
        raise ValueError("URL not allowed: must be from a trusted video source")

    # Log only scheme and host for security (avoid log injection from full URL)
    parsed_url = urlparse(video_path)
    logger.info("Downloading video from %s://%s...", parsed_url.scheme, parsed_url.netloc)

    # Parse URL to get file extension (parsed_url already set above for logging)
    path_obj = Path(parsed_url.path)
    extension = path_obj.suffix or ".mp4"

    # Create temporary file with appropriate extension
    # Using NamedTemporaryFile without context manager because we need the file to persist
    temp_file = tempfile.NamedTemporaryFile(
        delete=False, suffix=extension, prefix="video_", dir=TEMP_VIDEO_DIR
    )
    temp_path = temp_file.name
    temp_file.close()

    try:
        # Download video (URL already validated against allowed patterns)
        async with aiohttp.ClientSession() as session:
            async with session.get(video_path) as response:
                response.raise_for_status()

                # Get total size for logging
                total_size = response.headers.get("Content-Length")
                if total_size:
                    size_mb = int(total_size) / (1024 * 1024)
                    logger.info("Downloading %.2f MB...", size_mb)

                # Write to temporary file
                async with aiofiles.open(temp_path, "wb") as f:
                    bytes_downloaded = 0
                    async for chunk in response.content.iter_chunked(8192):
                        await f.write(chunk)
                        bytes_downloaded += len(chunk)

                downloaded_mb = bytes_downloaded / (1024 * 1024)
                logger.info("Downloaded %.2f MB to %s", downloaded_mb, temp_path)

        return temp_path, True

    except Exception as e:
        # Clean up temp file on error
        try:
            if _is_safe_temp_path(temp_path):
                Path(temp_path).unlink(missing_ok=True)
        except OSError as cleanup_err:
            logger.debug("Failed to clean up temp file: %s", cleanup_err)
        raise RuntimeError(f"Failed to download video: {e}") from e


def cleanup_temp_video(video_path: str) -> None:
    """Clean up temporary video file.

    Parameters
    ----------
    video_path : str
        Path to temporary video file to remove
    """
    # Validate path is within temp directory (path injection mitigation)
    if not _is_safe_temp_path(video_path):
        logger.warning("Refusing to delete path outside temp directory")
        return

    try:
        Path(video_path).unlink(missing_ok=True)
        logger.info("Cleaned up temporary video file")
    except OSError as e:
        logger.warning("Failed to clean up temporary video file: %s", type(e).__name__)
