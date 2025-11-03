"""Tests for Google Gemini API client."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from src.external_apis.base import ExternalAPIConfig
from src.external_apis.google_client import GoogleClient


@pytest.fixture
def google_config() -> ExternalAPIConfig:
    """Create test configuration for Google client."""
    return ExternalAPIConfig(
        api_key="test-google-key",
        api_endpoint="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        model_id="gemini-2.5-flash",
        timeout=30,
        max_retries=3,
    )


@pytest.fixture
def google_client(google_config: ExternalAPIConfig) -> GoogleClient:
    """Create Google client instance."""
    return GoogleClient(google_config)


@pytest.mark.asyncio
async def test_generate_text_success(google_client: GoogleClient) -> None:
    """Test successful text generation."""
    mock_response_data = {
        "candidates": [{"content": {"parts": [{"text": "Generated response"}]}}],
        "usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 5, "totalTokenCount": 15},
    }

    with patch.object(google_client.client, "post", new_callable=AsyncMock) as mock_post:
        mock_response = MagicMock()
        mock_response.json.return_value = mock_response_data
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        result = await google_client.generate_text("Test prompt", max_tokens=100)

        assert result["text"] == "Generated response"
        assert result["model"] == "gemini-2.5-flash"
        assert result["usage"]["promptTokenCount"] == 10


@pytest.mark.asyncio
async def test_generate_from_images_success(google_client: GoogleClient) -> None:
    """Test successful image generation."""
    mock_image = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"

    mock_response_data = {
        "candidates": [{"content": {"parts": [{"text": "Image analysis result"}]}}],
        "usageMetadata": {
            "promptTokenCount": 100,
            "candidatesTokenCount": 20,
            "totalTokenCount": 120,
        },
    }

    with patch.object(google_client.client, "post", new_callable=AsyncMock) as mock_post:
        mock_response = MagicMock()
        mock_response.json.return_value = mock_response_data
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        result = await google_client.generate_from_images(
            [mock_image], "Describe this image", max_tokens=100
        )

        assert result["text"] == "Image analysis result"


@pytest.mark.asyncio
async def test_generate_text_auth_error(google_client: GoogleClient) -> None:
    """Test authentication error handling."""
    from tenacity import RetryError

    with patch.object(google_client.client, "post", new_callable=AsyncMock) as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Unauthorized", request=MagicMock(), response=mock_response
        )
        mock_post.return_value = mock_response

        with pytest.raises(RetryError):
            await google_client.generate_text("Test")


@pytest.mark.asyncio
async def test_validate_key_success(google_client: GoogleClient) -> None:
    """Test API key validation."""
    mock_response_data = {
        "candidates": [{"content": {"parts": [{"text": "Test"}]}}],
        "usageMetadata": {"promptTokenCount": 1, "candidatesTokenCount": 1, "totalTokenCount": 2},
    }

    with patch.object(google_client.client, "post", new_callable=AsyncMock) as mock_post:
        mock_response = MagicMock()
        mock_response.json.return_value = mock_response_data
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        result = await google_client.validate_key()
        assert result is True


@pytest.mark.asyncio
async def test_validate_key_invalid(google_client: GoogleClient) -> None:
    """Test invalid API key detection."""
    with patch.object(google_client.client, "post", new_callable=AsyncMock) as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Unauthorized", request=MagicMock(), response=mock_response
        )
        mock_post.return_value = mock_response

        result = await google_client.validate_key()
        assert result is False


@pytest.mark.asyncio
async def test_generate_from_images_webp(google_client: GoogleClient) -> None:
    """Test image generation with WebP format."""
    mock_image = b"RIFF\x00\x00\x00\x00WEBP"

    mock_response_data = {
        "candidates": [{"content": {"parts": [{"text": "WebP analysis"}]}}],
        "usageMetadata": {
            "promptTokenCount": 100,
            "candidatesTokenCount": 20,
            "totalTokenCount": 120,
        },
    }

    with patch.object(google_client.client, "post", new_callable=AsyncMock) as mock_post:
        mock_response = MagicMock()
        mock_response.json.return_value = mock_response_data
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        result = await google_client.generate_from_images([mock_image], "Describe", max_tokens=100)

        assert result["text"] == "WebP analysis"


@pytest.mark.asyncio
async def test_generate_text_with_temperature(google_client: GoogleClient) -> None:
    """Test text generation with custom temperature."""
    mock_response_data = {
        "candidates": [{"content": {"parts": [{"text": "Creative response"}]}}],
        "usageMetadata": {
            "promptTokenCount": 10,
            "candidatesTokenCount": 15,
            "totalTokenCount": 25,
        },
    }

    with patch.object(google_client.client, "post", new_callable=AsyncMock) as mock_post:
        mock_response = MagicMock()
        mock_response.json.return_value = mock_response_data
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        result = await google_client.generate_text("Test prompt", max_tokens=100, temperature=0.9)

        assert result["text"] == "Creative response"
        call_kwargs = mock_post.call_args[1]
        assert call_kwargs["json"]["generationConfig"]["temperature"] == 0.9


@pytest.mark.asyncio
async def test_close_client(google_client: GoogleClient) -> None:
    """Test closing the HTTP client."""
    with patch.object(google_client.client, "aclose", new_callable=AsyncMock) as mock_close:
        await google_client.close()
        mock_close.assert_called_once()
