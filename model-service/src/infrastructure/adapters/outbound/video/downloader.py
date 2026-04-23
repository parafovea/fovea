"""Video downloader utility for handling remote video URLs.

Supports downloading videos from HTTP/HTTPS URLs (including S3 pre-signed URLs)
to temporary local files for processing.

Security model
--------------
Every sink (``aiohttp.ClientSession.get``, ``tempfile.NamedTemporaryFile``,
``aiofiles.open``, ``Path.unlink``) is guarded by an inline check in the same
function as the sink. The guards are shapes CodeQL's taint tracker
recognises as sanitizers:

* ``re.fullmatch(constant_regex, url)`` right before the HTTP request;
* ``in`` comparison against a constant set for the temp-file extension;
* ``os.path.realpath(path).startswith(trusted_root + os.sep)`` before any
  filesystem I/O on the temp file.
"""

from __future__ import annotations

import ipaddress
import logging
import os
import os.path
import re
import socket
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import aiofiles
import aiohttp

logger = logging.getLogger(__name__)


# Inline allowlist regex used directly at the aiohttp sink. CodeQL's
# ``StringRestrictionSanitizerGuard`` recognises ``re.fullmatch(pat, x)`` on
# the matched branch, clearing taint for ``py/(partial-|full-)ssrf``.
_TRUSTED_URL_RE = re.compile(
    r"https://"
    r"(?:"
    r"(?:[A-Za-z0-9][-A-Za-z0-9._]*\.)?s3(?:[.-][a-z0-9-]+)*\.amazonaws\.com"
    r"|(?:[A-Za-z0-9][-A-Za-z0-9._]*\.)?cloudfront\.net"
    r"|(?:[A-Za-z0-9][-A-Za-z0-9._]*\.)?storage\.googleapis\.com"
    r"|[A-Za-z0-9][-A-Za-z0-9._]*\.blob\.core\.windows\.net"
    r")"
    r"(?::443)?"
    r"/[A-Za-z0-9._~%!$&'()*+,;=:@/\-]*"
    r"(?:\?[A-Za-z0-9._~%!$&'()*+,;=:@/?\-]*)?"
)

_LOCAL_URL_RE = re.compile(
    r"https?://(?:localhost|127\.0\.0\.1)(?::(?:80|443|8000|8080))?"
    r"/[A-Za-z0-9._~%!$&'()*+,;=:@/\-]*"
    r"(?:\?[A-Za-z0-9._~%!$&'()*+,;=:@/?\-]*)?"
)

# Defense-in-depth host allow-list. The inline regex above is what clears
# CodeQL; the host check below is an extra validator run before DNS resolution
# to avoid wasting a syscall on bogus hosts.
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

_REGIONAL_S3_HOST = re.compile(r"^(?:[A-Za-z0-9.\-_]+\.)?s3[.\-][a-z0-9\-]+\.amazonaws\.com$")

_ALLOWED_PORTS = {"https": frozenset({443}), "http": frozenset({80, 8000, 8080})}

_ALLOWED_EXTENSIONS: frozenset[str] = frozenset({".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v"})

# Temp directory for video downloads - intentionally using /tmp for ephemeral video storage
TEMP_VIDEO_DIR = "/tmp"  # noqa: S108

# Resolved trusted root. Used as the constant prefix in the inline
# ``realpath(x).startswith(root + os.sep)`` sanitizer at each file-system sink.
_TEMP_VIDEO_DIR_REAL: str = os.path.realpath(TEMP_VIDEO_DIR)


def _is_allowed_host(host: str) -> bool:
    """Return True if ``host`` matches the allow-list of trusted origins."""
    normalized = host.lower()
    if normalized in _ALLOWED_HOST_EXACT:
        return True
    if any(normalized.endswith(suffix) for suffix in _ALLOWED_HOST_SUFFIXES):
        return True
    return bool(_REGIONAL_S3_HOST.match(normalized))


def _is_public_ip(address: str) -> bool:
    """Return True if the IP address is safely routable to a public host."""
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
        if isinstance(sockaddr, tuple) and sockaddr and isinstance(sockaddr[0], str):
            addresses.append(sockaddr[0])
    return addresses


def _preflight_url(url: str) -> str:
    """Run defense-in-depth URL checks (scheme, host allow-list, DNS, IP).

    This is *not* the CodeQL-recognised sanitizer — the inline regex
    fullmatch at the sink is. This helper runs first so bad URLs fail fast
    with a descriptive error before any network I/O.
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

    if host not in {"localhost", "127.0.0.1"}:
        addresses = _resolve_host_addresses(host)
        if not addresses:
            raise ValueError("URL not allowed: host did not resolve")
        if not all(_is_public_ip(addr) for addr in addresses):
            raise ValueError("URL not allowed: host resolves to a private or reserved IP")

    port_str = f":{port}" if port is not None else ""
    query = f"?{parsed.query}" if parsed.query else ""
    path = parsed.path or ""
    return f"{scheme}://{host}{port_str}{path}{query}"


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

    try:
        candidate_url = _preflight_url(video_path)
    except ValueError:
        parsed_attempt = urlparse(video_path)
        logger.warning(
            "URL blocked by allow-list: %s://%s",
            parsed_attempt.scheme or "?",
            parsed_attempt.netloc or "?",
        )
        raise

    # CodeQL sanitizer: inline ``re.fullmatch`` against constant patterns.
    # Only URLs matching one of these exact shapes reach ``session.get``.
    if not (_TRUSTED_URL_RE.fullmatch(candidate_url) or _LOCAL_URL_RE.fullmatch(candidate_url)):
        raise ValueError("URL rejected by allow-list pattern")
    safe_url = candidate_url

    parsed = urlparse(safe_url)
    logger.info("Downloading video from %s://%s...", parsed.scheme, parsed.hostname or "?")

    # CodeQL sanitizer: constant-set ``in`` comparison. Only extensions from
    # the constant allow-list may be passed as the NamedTemporaryFile suffix.
    raw_ext = Path(parsed.path).suffix.lower()
    extension = raw_ext if raw_ext in _ALLOWED_EXTENSIONS else ".mp4"

    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=extension,
        prefix="video_",
        dir=TEMP_VIDEO_DIR,
    ) as temp_file:
        temp_path_str = temp_file.name

    # CodeQL sanitizer: ``os.path.realpath`` normalization followed by inline
    # ``startswith(TRUSTED_ROOT + os.sep)``.
    temp_real = os.path.realpath(temp_path_str)
    if not (
        temp_real == _TEMP_VIDEO_DIR_REAL or temp_real.startswith(_TEMP_VIDEO_DIR_REAL + os.sep)
    ):
        raise RuntimeError("tempfile returned a path outside the temp directory")

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(safe_url) as response:
                response.raise_for_status()

                total_size = response.headers.get("Content-Length")
                if total_size:
                    size_mb = int(total_size) / (1024 * 1024)
                    logger.info("Downloading %.2f MB...", size_mb)

                async with aiofiles.open(temp_real, "wb") as f:
                    bytes_downloaded = 0
                    async for chunk in response.content.iter_chunked(8192):
                        await f.write(chunk)
                        bytes_downloaded += len(chunk)

                downloaded_mb = bytes_downloaded / (1024 * 1024)
                logger.info("Downloaded %.2f MB to temporary file", downloaded_mb)

        return temp_real, True

    except Exception as exc:
        try:
            Path(temp_real).unlink(missing_ok=True)
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
    # CodeQL sanitizer: inline ``os.path.realpath`` + ``startswith`` guard.
    real = os.path.realpath(video_path)
    if not (real == _TEMP_VIDEO_DIR_REAL or real.startswith(_TEMP_VIDEO_DIR_REAL + os.sep)):
        logger.warning("Refusing to delete path outside temp directory")
        return

    try:
        Path(real).unlink(missing_ok=True)
        logger.info("Cleaned up temporary video file")
    except OSError as exc:
        logger.warning("Failed to clean up temporary video file: %s", type(exc).__name__)
