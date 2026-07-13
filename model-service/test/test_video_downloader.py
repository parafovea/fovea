"""Tests for video_downloader module."""

import os
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch

import aiohttp
import pytest

from src.infrastructure.adapters.outbound.video.downloader import (
    _PinnedResolver,
    _preflight_url,
    cleanup_temp_video,
    download_video_if_needed,
)

# Use S3 URLs that match the allowed patterns for SSRF protection. Remote
# hosts must be HTTPS (plain HTTP is only allowed for localhost).
TEST_S3_URL_HTTP = "https://bucket.s3.us-east-1.amazonaws.com/video.mp4"
TEST_S3_URL_HTTPS = "https://bucket.s3.us-east-1.amazonaws.com/video.webm"
TEST_S3_URL_NO_EXT = (
    "https://bucket.s3.us-east-1.amazonaws.com/signed-url-without-extension?signature=abc"
)
TEST_LOCALHOST_URL = "http://localhost:8080/video.mp4"


class TestDownloadVideoIfNeeded:
    """Tests for download_video_if_needed function."""

    @pytest.mark.asyncio
    async def test_local_file_path_no_download(self):
        """Test that local file paths are returned unchanged."""
        local_path = "/videos/test-video.mp4"

        result_path, is_temp = await download_video_if_needed(local_path)

        assert result_path == local_path
        assert is_temp is False

    @pytest.mark.asyncio
    async def test_relative_file_path_no_download(self):
        """Test that relative file paths are returned unchanged."""
        local_path = "videos/test-video.mp4"

        result_path, is_temp = await download_video_if_needed(local_path)

        assert result_path == local_path
        assert is_temp is False

    @pytest.mark.asyncio
    async def test_http_url_download(self):
        """Test downloading video from HTTP URL."""
        url = TEST_S3_URL_HTTP
        fake_content = b"fake video content"

        # Mock aiohttp ClientSession
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.headers = {"Content-Length": str(len(fake_content))}
        mock_response.raise_for_status = MagicMock()

        # Mock content.iter_chunked
        async def mock_iter_chunked(chunk_size):
            yield fake_content

        mock_response.content.iter_chunked = mock_iter_chunked

        with patch("aiohttp.ClientSession") as mock_session_class:
            mock_session = AsyncMock()
            mock_session.__aenter__.return_value = mock_session
            mock_session.__aexit__.return_value = None

            # Create async context manager for get()
            mock_get_cm = AsyncMock()
            mock_get_cm.__aenter__.return_value = mock_response
            mock_get_cm.__aexit__.return_value = None
            # get() itself is NOT async, it returns an async context manager
            mock_session.get = MagicMock(return_value=mock_get_cm)

            mock_session_class.return_value = mock_session

            result_path, is_temp = await download_video_if_needed(url)

            # Verify result
            assert is_temp is True
            # The downloader resolves /tmp (which on macOS is a symlink to
            # /private/tmp) and returns the canonical path. Accept either.
            assert "/video_" in result_path
            assert result_path.endswith(".mp4")
            assert os.path.exists(result_path)

            # Verify content was written
            with open(result_path, "rb") as f:
                content = f.read()
                assert content == fake_content

            # Cleanup
            os.unlink(result_path)

    @pytest.mark.asyncio
    async def test_https_url_download(self):
        """Test downloading video from HTTPS URL."""
        url = TEST_S3_URL_HTTPS
        fake_content = b"fake video content"

        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.headers = {"Content-Length": str(len(fake_content))}
        mock_response.raise_for_status = MagicMock()

        async def mock_iter_chunked(chunk_size):
            yield fake_content

        mock_response.content.iter_chunked = mock_iter_chunked

        with patch("aiohttp.ClientSession") as mock_session_class:
            mock_session = AsyncMock()
            mock_session.__aenter__.return_value = mock_session
            mock_session.__aexit__.return_value = None

            mock_get_cm = AsyncMock()
            mock_get_cm.__aenter__.return_value = mock_response
            mock_get_cm.__aexit__.return_value = None
            # get() itself is NOT async, it returns an async context manager
            mock_session.get = MagicMock(return_value=mock_get_cm)

            mock_session_class.return_value = mock_session

            result_path, is_temp = await download_video_if_needed(url)

            assert is_temp is True
            assert result_path.endswith(".webm")
            assert os.path.exists(result_path)

            # Cleanup
            os.unlink(result_path)

    @pytest.mark.asyncio
    async def test_url_without_extension_uses_mp4(self):
        """Test that URLs without extensions default to .mp4."""
        url = TEST_S3_URL_NO_EXT
        fake_content = b"fake video content"

        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.headers = {"Content-Length": str(len(fake_content))}
        mock_response.raise_for_status = MagicMock()

        async def mock_iter_chunked(chunk_size):
            yield fake_content

        mock_response.content.iter_chunked = mock_iter_chunked

        with patch("aiohttp.ClientSession") as mock_session_class:
            mock_session = AsyncMock()
            mock_session.__aenter__.return_value = mock_session
            mock_session.__aexit__.return_value = None

            mock_get_cm = AsyncMock()
            mock_get_cm.__aenter__.return_value = mock_response
            mock_get_cm.__aexit__.return_value = None
            # get() itself is NOT async, it returns an async context manager
            mock_session.get = MagicMock(return_value=mock_get_cm)

            mock_session_class.return_value = mock_session

            result_path, is_temp = await download_video_if_needed(url)

            assert is_temp is True
            assert result_path.endswith(".mp4")
            assert os.path.exists(result_path)

            # Cleanup
            os.unlink(result_path)

    @pytest.mark.asyncio
    async def test_large_file_chunked_download(self):
        """Test downloading large file in chunks."""
        url = TEST_S3_URL_HTTP
        # Simulate 3 chunks
        chunks = [b"chunk1", b"chunk2", b"chunk3"]
        expected_content = b"".join(chunks)

        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.headers = {"Content-Length": str(len(expected_content))}
        mock_response.raise_for_status = MagicMock()

        async def mock_iter_chunked(chunk_size):
            for chunk in chunks:
                yield chunk

        mock_response.content.iter_chunked = mock_iter_chunked

        with patch("aiohttp.ClientSession") as mock_session_class:
            mock_session = AsyncMock()
            mock_session.__aenter__.return_value = mock_session
            mock_session.__aexit__.return_value = None

            mock_get_cm = AsyncMock()
            mock_get_cm.__aenter__.return_value = mock_response
            mock_get_cm.__aexit__.return_value = None
            # get() itself is NOT async, it returns an async context manager
            mock_session.get = MagicMock(return_value=mock_get_cm)

            mock_session_class.return_value = mock_session

            result_path, is_temp = await download_video_if_needed(url)

            assert is_temp is True
            assert os.path.exists(result_path)

            # Verify all chunks were written
            with open(result_path, "rb") as f:
                content = f.read()
                assert content == expected_content

            # Cleanup
            os.unlink(result_path)

    @pytest.mark.asyncio
    async def test_download_failure_cleans_up_temp_file(self):
        """Test that temp file is cleaned up on download failure."""
        url = TEST_S3_URL_HTTPS

        mock_response = AsyncMock()
        mock_response.raise_for_status = MagicMock(
            side_effect=aiohttp.ClientError("Connection failed")
        )

        with patch("aiohttp.ClientSession") as mock_session_class:
            mock_session = AsyncMock()
            mock_session.__aenter__.return_value = mock_session
            mock_session.__aexit__.return_value = None
            mock_session.get.return_value.__aenter__.return_value = mock_response
            mock_session.get.return_value.__aexit__.return_value = None
            mock_session_class.return_value = mock_session

            with pytest.raises(RuntimeError, match="Failed to download video"):
                await download_video_if_needed(url)

            # Verify no temp files left behind (hard to test, but error was raised)

    @pytest.mark.asyncio
    async def test_http_error_raises_exception(self):
        """Test that HTTP errors raise appropriate exceptions."""
        url = TEST_S3_URL_HTTPS

        mock_response = AsyncMock()
        mock_response.raise_for_status = MagicMock(
            side_effect=aiohttp.ClientResponseError(
                request_info=MagicMock(),
                history=(),
                status=404,
                message="Not Found",
            )
        )

        with patch("aiohttp.ClientSession") as mock_session_class:
            mock_session = AsyncMock()
            mock_session.__aenter__.return_value = mock_session
            mock_session.__aexit__.return_value = None
            mock_session.get.return_value.__aenter__.return_value = mock_response
            mock_session.get.return_value.__aexit__.return_value = None
            mock_session_class.return_value = mock_session

            with pytest.raises(RuntimeError, match="Failed to download video"):
                await download_video_if_needed(url)

    @pytest.mark.asyncio
    async def test_preserves_file_extension_from_url(self):
        """Test that file extension is preserved from URL path."""
        # Use S3 URLs that match allowed patterns
        test_cases = [
            ("https://bucket.s3.us-east-1.amazonaws.com/video.mp4", ".mp4"),
            ("https://bucket.s3.us-east-1.amazonaws.com/video.webm", ".webm"),
            ("https://bucket.s3.us-east-1.amazonaws.com/video.mkv", ".mkv"),
            ("https://bucket.s3.us-east-1.amazonaws.com/video.avi", ".avi"),
            ("https://bucket.s3.us-east-1.amazonaws.com/video.mov", ".mov"),
        ]

        for url, expected_ext in test_cases:
            fake_content = b"fake content"

            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.headers = {"Content-Length": str(len(fake_content))}
            mock_response.raise_for_status = MagicMock()

            async def mock_iter_chunked(chunk_size, content=fake_content):
                yield content

            mock_response.content.iter_chunked = mock_iter_chunked

            with patch("aiohttp.ClientSession") as mock_session_class:
                mock_session = AsyncMock()
                mock_session.__aenter__.return_value = mock_session
                mock_session.__aexit__.return_value = None

                mock_get_cm = AsyncMock()
                mock_get_cm.__aenter__.return_value = mock_response
                mock_get_cm.__aexit__.return_value = None
                # get() itself is NOT async, it returns an async context manager
                mock_session.get = MagicMock(return_value=mock_get_cm)

                mock_session_class.return_value = mock_session

                result_path, is_temp = await download_video_if_needed(url)

                assert result_path.endswith(expected_ext)
                assert os.path.exists(result_path)

                # Cleanup
                os.unlink(result_path)


class TestCleanupTempVideo:
    """Tests for cleanup_temp_video function."""

    def test_cleanup_existing_file(self):
        """Test cleanup of existing temporary file."""
        # Create a temp file in /tmp to match TEMP_VIDEO_DIR
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=".mp4", prefix="video_", dir="/tmp"
        ) as f:
            temp_path = f.name
            f.write(b"fake content")

        assert os.path.exists(temp_path)

        cleanup_temp_video(temp_path)

        assert not os.path.exists(temp_path)

    def test_cleanup_missing_file_no_error(self):
        """Test cleanup of non-existent file doesn't raise error."""
        non_existent_path = "/tmp/video_does_not_exist.mp4"

        # Should not raise exception
        cleanup_temp_video(non_existent_path)

    def test_cleanup_with_permission_error(self):
        """Test cleanup handles permission errors gracefully."""
        # Create a temp file in /tmp to match TEMP_VIDEO_DIR
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=".mp4", prefix="video_", dir="/tmp"
        ) as f:
            temp_path = f.name

        # Mock Path.unlink to raise PermissionError
        with patch("pathlib.Path.unlink", side_effect=PermissionError("Access denied")):
            # Should not raise exception, just log warning
            cleanup_temp_video(temp_path)

        # Cleanup for real
        if os.path.exists(temp_path):
            os.unlink(temp_path)


_RESOLVE = "src.infrastructure.adapters.outbound.video.downloader._resolve_host_addresses"


class TestPreflightPinning:
    """Preflight returns the vetted address the fetch pins to (DNS-rebind defense)."""

    def test_preflight_returns_pinned_public_ip(self):
        """A public host resolves to a vetted IP the fetch will pin to."""
        with patch(_RESOLVE, return_value=["8.8.8.8"]):
            url, pinned = _preflight_url(TEST_S3_URL_HTTPS)
        assert pinned == "8.8.8.8"
        assert url == TEST_S3_URL_HTTPS

    def test_preflight_localhost_is_not_pinned(self):
        """Localhost has no DNS to rebind, so no pin is returned."""
        _url, pinned = _preflight_url(TEST_LOCALHOST_URL)
        assert pinned is None

    def test_preflight_rejects_private_resolution(self):
        """A host that resolves to a private IP is refused."""
        with patch(_RESOLVE, return_value=["10.0.0.5"]):
            with pytest.raises(ValueError, match="private or reserved"):
                _preflight_url(TEST_S3_URL_HTTPS)


class TestPinnedResolver:
    """The connection resolver pins to the vetted IP and refuses a rebound host."""

    @pytest.mark.asyncio
    async def test_resolves_pinned_host_to_vetted_ip(self):
        resolver = _PinnedResolver("bucket.s3.us-east-1.amazonaws.com", "8.8.8.8")
        results = await resolver.resolve("bucket.s3.us-east-1.amazonaws.com", 443)
        assert results[0]["host"] == "8.8.8.8"
        assert results[0]["port"] == 443
        await resolver.close()

    @pytest.mark.asyncio
    async def test_refuses_a_rebound_host(self):
        """A different host at connect time (a rebind) is refused."""
        resolver = _PinnedResolver("bucket.s3.us-east-1.amazonaws.com", "8.8.8.8")
        with pytest.raises(OSError, match="not the pinned host"):
            await resolver.resolve("evil.internal.example", 443)
        await resolver.close()
