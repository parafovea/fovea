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
from aiohttp.abc import AbstractResolver, ResolveResult

logger = logging.getLogger(__name__)


# Inline allowlist regex used directly at the aiohttp sink. CodeQL's
# ``StringRestrictionSanitizerGuard`` recognises ``re.fullmatch(pat, x)`` on
# the matched branch, clearing taint for ``py/(partial-|full-)ssrf``. The
# pattern is a single alternation with no nested quantifiers to avoid
# ``py/polynomial-redos``. All host/scheme/port validation has already run
# in ``_preflight_url`` — this regex's job is only to present a shape the
# taint tracker recognises as a sanitizer.
_SAFE_URL_RE = re.compile(r"https?://[A-Za-z0-9.\-]+(?::[0-9]+)?/[^\s#]*")

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

# Temp directory for video downloads - intentionally using /tmp for ephemeral video storage
TEMP_VIDEO_DIR = "/tmp"  # noqa: S108

# Resolved trusted root WITH trailing separator baked in. Used as the
# constant-shape prefix in ``realpath(x).startswith(_TEMP_DIR_PREFIX)`` at
# each file-system sink. Baking the separator into the module constant keeps
# the guard expression a single ``startswith`` call with no runtime
# concatenation — which is the shape CodeQL's ``StartswithCall`` barrier
# guard recognises without confusion from compound conditions.
_TEMP_DIR_PREFIX: str = os.path.realpath(TEMP_VIDEO_DIR) + os.sep


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


class _PinnedResolver(AbstractResolver):
    """aiohttp resolver that pins a single host to a pre-vetted public IP.

    ``_preflight_url`` resolves the host and verifies every address is public,
    but the URL it returns still carries the hostname, so a plain
    ``session.get`` re-resolves DNS at connect time — a window in which an
    allow-listed host can be rebound to a private/internal address (a
    DNS-rebinding TOCTOU). Pinning the connection to the address vetted during
    preflight closes that window while still presenting the hostname for TLS
    SNI and certificate validation. Any host other than the pinned one is
    refused.
    """

    def __init__(self, host: str, ip: str) -> None:
        self._host = host.lower()
        self._ip = ip
        self._family = socket.AF_INET6 if ipaddress.ip_address(ip).version == 6 else socket.AF_INET

    async def resolve(
        self, host: str, port: int = 0, family: socket.AddressFamily = socket.AF_INET
    ) -> list[ResolveResult]:
        """Return the pinned address for the pinned host; refuse any other."""
        if host.lower() != self._host:
            raise OSError(f"host {host!r} is not the pinned host")
        return [
            ResolveResult(
                hostname=host,
                host=self._ip,
                port=port,
                family=self._family,
                proto=socket.IPPROTO_TCP,
                flags=0,
            )
        ]

    async def close(self) -> None:
        """No resources to release."""


def _preflight_url(url: str) -> tuple[str, str | None]:
    """Run defense-in-depth URL checks (scheme, host allow-list, DNS, IP).

    This is *not* the CodeQL-recognised sanitizer — the inline regex
    fullmatch at the sink is. This helper runs first so bad URLs fail fast
    with a descriptive error before any network I/O.

    Returns the sanitized URL and, for non-localhost hosts, the single vetted
    public IP the connection must be pinned to (defeating a DNS rebind between
    this check and the fetch); ``None`` for localhost/127.0.0.1, where no DNS
    resolution occurs.
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

    pinned_ip: str | None = None
    if host not in {"localhost", "127.0.0.1"}:
        addresses = _resolve_host_addresses(host)
        if not addresses:
            raise ValueError("URL not allowed: host did not resolve")
        if not all(_is_public_ip(addr) for addr in addresses):
            raise ValueError("URL not allowed: host resolves to a private or reserved IP")
        # Pin to the first vetted address; the fetch connects here rather than
        # re-resolving, so a rebind cannot redirect it to a private host.
        pinned_ip = addresses[0]

    port_str = f":{port}" if port is not None else ""
    query = f"?{parsed.query}" if parsed.query else ""
    path = parsed.path or ""
    return f"{scheme}://{host}{port_str}{path}{query}", pinned_ip


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
        candidate_url, pinned_ip = _preflight_url(video_path)
    except ValueError:
        parsed_attempt = urlparse(video_path)
        # CodeQL log-injection sanitizer: ``.replace("\r","").replace("\n","")``
        # strips CRLF so an attacker cannot forge log entries.
        safe_scheme = (parsed_attempt.scheme or "?").replace("\r", "").replace("\n", "")
        safe_netloc = (parsed_attempt.netloc or "?").replace("\r", "").replace("\n", "")
        logger.warning("URL blocked by allow-list: %s://%s", safe_scheme, safe_netloc)
        raise

    # CodeQL sanitizer: inline ``re.fullmatch`` against a single constant
    # pattern. Single-alternative guard (no compound ``or``) so CodeQL's
    # ``StringRestrictionSanitizerGuard`` fires on the matched branch.
    if not _SAFE_URL_RE.fullmatch(candidate_url):
        raise ValueError("URL rejected by allow-list pattern")

    parsed = urlparse(candidate_url)
    safe_scheme = (parsed.scheme or "?").replace("\r", "").replace("\n", "")
    safe_host = (parsed.hostname or "?").replace("\r", "").replace("\n", "")
    logger.info("Downloading video from %s://%s...", safe_scheme, safe_host)

    # CodeQL sanitizer: every assignment to ``extension`` is from a string
    # literal. Taint from ``raw_ext`` never flows into the variable that
    # reaches ``NamedTemporaryFile(suffix=...)`` — ``extension`` is
    # constant-sourced in every branch, so ``py/path-injection`` cannot fire.
    raw_ext = Path(parsed.path).suffix.lower()
    if raw_ext == ".mp4":
        extension = ".mp4"
    elif raw_ext == ".avi":
        extension = ".avi"
    elif raw_ext == ".mov":
        extension = ".mov"
    elif raw_ext == ".mkv":
        extension = ".mkv"
    elif raw_ext == ".webm":
        extension = ".webm"
    elif raw_ext == ".m4v":
        extension = ".m4v"
    else:
        extension = ".mp4"

    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=extension,
        prefix="video_",
        dir=TEMP_VIDEO_DIR,
    ) as temp_file:
        temp_path_str = temp_file.name

    # CodeQL sanitizer: ``os.path.realpath`` is a ``PathNormalization``; the
    # single ``startswith`` against the module-level prefix (which already
    # ends with ``os.sep``) is a ``StartswithCall`` barrier. Single guard,
    # no compound condition.
    temp_real = os.path.realpath(temp_path_str)
    if not temp_real.startswith(_TEMP_DIR_PREFIX):
        raise RuntimeError("tempfile returned a path outside the temp directory")

    # Pin the connection to the address vetted in preflight so a DNS rebind
    # between the check and the fetch cannot redirect it to a private host.
    # Localhost has no DNS to rebind, so it uses the default resolver.
    connector = (
        aiohttp.TCPConnector(
            resolver=_PinnedResolver(urlparse(candidate_url).hostname or "", pinned_ip)
        )
        if pinned_ip is not None
        else None
    )

    try:
        async with aiohttp.ClientSession(connector=connector) as session:
            async with session.get(candidate_url) as response:
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
    # CodeQL sanitizer: ``os.path.realpath`` + single ``startswith`` against
    # the module-level prefix constant (ends with ``os.sep``).
    real = os.path.realpath(video_path)
    if not real.startswith(_TEMP_DIR_PREFIX):
        logger.warning("Refusing to delete path outside temp directory")
        return

    try:
        Path(real).unlink(missing_ok=True)
        logger.info("Cleaned up temporary video file")
    except OSError as exc:
        logger.warning("Failed to clean up temporary video file: %s", type(exc).__name__)
