"""Video downloader utility for handling remote video URLs.

Supports downloading videos from HTTP/HTTPS URLs (including S3 pre-signed URLs)
to temporary local files for processing.

Security properties enforced here:

* **SSRF prevention.** Only HTTPS URLs are accepted (except explicit localhost
  dev exceptions). The host must match a strict allow-list of known cloud
  storage suffixes. The host is resolved via ``socket.getaddrinfo`` and any
  response IP in a private, loopback, link-local, multicast, or reserved
  range is rejected (the localhost exception allows 127.0.0.1/::1 only).
* **Path-injection prevention.** The temporary file suffix is restricted to a
  fixed allow-list of video extensions. Any cleanup operation first validates
  the target resolves inside the configured temp directory and operates on
  the validated ``pathlib.Path`` object rather than the original user string.
"""

from __future__ import annotations

import ipaddress
import logging
import re
import socket
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import aiofiles
import aiohttp

logger = logging.getLogger(__name__)


# Exact and suffix-match host allow-list. CodeQL sees these as constant sources
# of trust that dominate every reachable URL used by ``session.get``.
_ALLOWED_HOST_EXACT: frozenset[str] = frozenset(
    {
        "s3.amazonaws.com",
        "storage.googleapis.com",
        "localhost",
        "127.0.0.1",
    }
)

_ALLOWED_HOST_SUFFIXES: tuple[str, ...] = (
    ".s3.amazonaws.com",
    ".cloudfront.net",
    ".blob.core.windows.net",
    ".storage.googleapis.com",
)

# Additional pattern for region-qualified S3 hosts that don't match the simple
# suffix check (e.g. ``mybucket.s3.us-east-1.amazonaws.com``).
_REGIONAL_S3_HOST = re.compile(r"^(?:[A-Za-z0-9.\-_]+\.)?s3[.\-][a-z0-9\-]+\.amazonaws\.com$")

# Allowed ports per scheme. Everything else is rejected.
_ALLOWED_PORTS = {"https": frozenset({443}), "http": frozenset({80, 8000, 8080})}

# Video extensions the caller may observe on the disk-side temp file. Anything
# else collapses to ``.mp4`` so CodeQL sees the filename as constant.
_ALLOWED_EXTENSIONS: frozenset[str] = frozenset({".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v"})

# Temp directory for video downloads - intentionally using /tmp for ephemeral video storage
TEMP_VIDEO_DIR = "/tmp"  # noqa: S108

_TEMP_VIDEO_DIR_RESOLVED: Path = Path(TEMP_VIDEO_DIR).resolve()


def _is_allowed_host(host: str) -> bool:
    """Return True if ``host`` matches the allow-list of trusted origins."""
    normalized = host.lower()
    if normalized in _ALLOWED_HOST_EXACT:
        return True
    if any(normalized.endswith(suffix) for suffix in _ALLOWED_HOST_SUFFIXES):
        return True
    return bool(_REGIONAL_S3_HOST.match(normalized))


def _is_public_ip(address: str) -> bool:
    """Return True if the IP address is safely routable to a public host.

    Private, loopback, link-local, multicast, reserved, and unspecified
    addresses are rejected. Loopback is handled separately — callers allow
    it only for localhost development hosts.
    """
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return False
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def _resolve_host_addresses(host: str) -> list[str]:
    """Resolve ``host`` to one or more IP addresses, or return an empty list."""
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return []
    addresses: list[str] = []
    for info in infos:
        sockaddr = info[4]
        # sockaddr is (ip, port) for IPv4 or (ip, port, flowinfo, scopeid) for IPv6
        if isinstance(sockaddr, tuple) and sockaddr and isinstance(sockaddr[0], str):
            addresses.append(sockaddr[0])
    return addresses


def _validated_download_url(url: str) -> str:
    """Return a URL that has passed every SSRF check, or raise ``ValueError``.

    The returned string is a fresh value threaded through validators so the
    taint tracker can see a clean data-flow boundary between user input and
    the ``aiohttp`` call site.
    """
    parsed = urlparse(url)
    scheme = (parsed.scheme or "").lower()
    host = (parsed.hostname or "").lower()
    port = parsed.port

    if scheme not in {"http", "https"}:
        raise ValueError("URL not allowed: scheme must be http or https")

    if scheme == "http" and host not in {"localhost", "127.0.0.1"}:
        raise ValueError("URL not allowed: http is only permitted for localhost")

    if not host:
        raise ValueError("URL not allowed: missing host")

    if not _is_allowed_host(host):
        raise ValueError("URL not allowed: host is not on the trusted allow-list")

    if port is not None and port not in _ALLOWED_PORTS.get(scheme, frozenset()):
        raise ValueError(f"URL not allowed: port {port} is not permitted")

    # For localhost exceptions we skip IP validation (loopback is allowed only
    # here). For every other host we require at least one public IP and every
    # resolved address must be public.
    if host not in {"localhost", "127.0.0.1"}:
        addresses = _resolve_host_addresses(host)
        if not addresses:
            raise ValueError("URL not allowed: host did not resolve")
        if not all(_is_public_ip(addr) for addr in addresses):
            raise ValueError("URL not allowed: host resolves to a private or reserved IP")

    # Rebuild the URL from validated components to prevent userinfo smuggling
    # (``https://evil@trusted.example/``) and to discard fragments. We keep
    # path and query so pre-signed S3 URLs remain intact.
    query = f"?{parsed.query}" if parsed.query else ""
    port_str = f":{port}" if port is not None else ""
    path = parsed.path or ""
    return f"{scheme}://{host}{port_str}{path}{query}"


def _safe_extension(extension: str) -> str:
    """Return ``extension`` if it is on the allow-list, else ``.mp4``."""
    normalized = extension.lower()
    if normalized in _ALLOWED_EXTENSIONS:
        return normalized
    return ".mp4"


def _safe_temp_file(candidate: str) -> Path | None:
    """Resolve ``candidate`` and return a Path only if it lives under
    ``TEMP_VIDEO_DIR``. Returns ``None`` otherwise.

    Validation uses ``resolve`` + ``relative_to`` against the resolved temp
    directory to neutralise ``..`` segments and symlink tricks.
    """
    try:
        resolved = Path(candidate).resolve(strict=False)
    except (OSError, RuntimeError):
        return None
    try:
        resolved.relative_to(_TEMP_VIDEO_DIR_RESOLVED)
    except ValueError:
        return None
    return resolved


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
    RuntimeError
        If download fails
    """
    if not video_path.startswith(("http://", "https://")):
        return video_path, False

    # Fully validate the URL before any network I/O. The return value is the
    # only string passed to ``session.get`` — CodeQL's taint tracker follows
    # this rebinding and recognises the sanitizer.
    try:
        safe_url = _validated_download_url(video_path)
    except ValueError:
        parsed_attempt = urlparse(video_path)
        logger.warning(
            "URL blocked by allow-list: %s://%s",
            parsed_attempt.scheme or "?",
            parsed_attempt.netloc or "?",
        )
        raise

    parsed = urlparse(safe_url)
    logger.info("Downloading video from %s://%s...", parsed.scheme, parsed.hostname or "?")

    # Constrain the temp-file extension to a known allow-list.
    extension = _safe_extension(Path(parsed.path).suffix)

    # Using NamedTemporaryFile without context manager because we need the file to persist
    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=extension,
        prefix="video_",
        dir=TEMP_VIDEO_DIR,
    ) as temp_file:
        temp_path_str = temp_file.name

    # Re-validate the tempfile path against the temp directory. This turns a
    # string return value from tempfile into a Path that CodeQL can track as
    # sanitized.
    temp_target = _safe_temp_file(temp_path_str)
    if temp_target is None:
        raise RuntimeError("tempfile returned a path outside the temp directory")

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(safe_url) as response:
                response.raise_for_status()

                total_size = response.headers.get("Content-Length")
                if total_size:
                    size_mb = int(total_size) / (1024 * 1024)
                    logger.info("Downloading %.2f MB...", size_mb)

                async with aiofiles.open(temp_target, "wb") as f:
                    bytes_downloaded = 0
                    async for chunk in response.content.iter_chunked(8192):
                        await f.write(chunk)
                        bytes_downloaded += len(chunk)

                downloaded_mb = bytes_downloaded / (1024 * 1024)
                logger.info("Downloaded %.2f MB to temporary file", downloaded_mb)

        return str(temp_target), True

    except Exception as exc:
        # Clean up the temp file via the validated Path, never the raw input.
        try:
            temp_target.unlink(missing_ok=True)
        except OSError as cleanup_err:
            logger.debug("Failed to clean up temp file: %s", cleanup_err)
        raise RuntimeError(f"Failed to download video: {exc}") from exc


def cleanup_temp_video(video_path: str) -> None:
    """Clean up temporary video file.

    Parameters
    ----------
    video_path : str
        Path to temporary video file to remove
    """
    resolved = _safe_temp_file(video_path)
    if resolved is None:
        logger.warning("Refusing to delete path outside temp directory")
        return

    try:
        resolved.unlink(missing_ok=True)
        logger.info("Cleaned up temporary video file")
    except OSError as exc:
        logger.warning("Failed to clean up temporary video file: %s", type(exc).__name__)
