"""Tests for OpenAI API client."""

import pytest
import httpx
from unittest.mock import AsyncMock, MagicMock, patch

from src.external_apis.openai_client import OpenAIClient
from src.external_apis.base import ExternalAPIConfig


@pytest.fixture
def openai_config() -> ExternalAPIConfig:
    """Create test configuration for OpenAI client."""
    return ExternalAPIConfig(
        api_key="sk-test-key",
        api_endpoint="https://api.openai.com/v1/chat/completions",
        model_id="gpt-4o",
        timeout=30,
        max_retries=3,
    )


@pytest.fixture
def openai_client(openai_config: ExternalAPIConfig) -> OpenAIClient:
    """Create OpenAI client instance."""
    return OpenAIClient(openai_config)


@pytest.mark.asyncio
async def test_generate_text_success(openai_client: OpenAIClient) -> None:
    """Test successful text generation."""
    mock_response = {
        "choices": [{"message": {"content": "Generated response"}}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        "model": "gpt-4o",
    }

    with patch.object(openai_client.client, "post", new_callable=AsyncMock) as mock_post:
        mock_response_obj = MagicMock()
        mock_response_obj.json.return_value = mock_response
        mock_response_obj.raise_for_status = MagicMock()
        mock_post.return_value = mock_response_obj

        result = await openai_client.generate_text("Test prompt", max_tokens=100)

        assert result["text"] == "Generated response"
        assert result["usage"]["prompt_tokens"] == 10
        assert result["model"] == "gpt-4o"


@pytest.mark.asyncio
async def test_generate_from_images_success(openai_client: OpenAIClient) -> None:
    """Test successful image generation."""
    mock_image = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"

    mock_response = {
        "choices": [{"message": {"content": "Image analysis result"}}],
        "usage": {"prompt_tokens": 100, "completion_tokens": 20, "total_tokens": 120},
        "model": "gpt-4o",
    }

    with patch.object(openai_client.client, "post", new_callable=AsyncMock) as mock_post:
        mock_response_obj = MagicMock()
        mock_response_obj.json.return_value = mock_response
        mock_response_obj.raise_for_status = MagicMock()
        mock_post.return_value = mock_response_obj

        result = await openai_client.generate_from_images(
            [mock_image], "Describe this image", max_tokens=100
        )

        assert result["text"] == "Image analysis result"


@pytest.mark.asyncio
async def test_generate_text_auth_error(openai_client: OpenAIClient) -> None:
    """Test authentication error handling."""
    from tenacity import RetryError

    with patch.object(openai_client.client, "post", new_callable=AsyncMock) as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Unauthorized", request=MagicMock(), response=mock_response
        )
        mock_post.return_value = mock_response

        with pytest.raises(RetryError):
            await openai_client.generate_text("Test")


@pytest.mark.asyncio
async def test_validate_key_success(openai_client: OpenAIClient) -> None:
    """Test API key validation."""
    mock_response = {
        "choices": [{"message": {"content": "Test"}}],
        "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
        "model": "gpt-4o",
    }

    with patch.object(openai_client.client, "post", new_callable=AsyncMock) as mock_post:
        mock_response_obj = MagicMock()
        mock_response_obj.json.return_value = mock_response
        mock_response_obj.raise_for_status = MagicMock()
        mock_post.return_value = mock_response_obj

        result = await openai_client.validate_key()
        assert result is True


@pytest.mark.asyncio
async def test_validate_key_invalid(openai_client: OpenAIClient) -> None:
    """Test invalid API key detection."""
    with patch.object(openai_client.client, "post", new_callable=AsyncMock) as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Unauthorized", request=MagicMock(), response=mock_response
        )
        mock_post.return_value = mock_response

        result = await openai_client.validate_key()
        assert result is False


@pytest.mark.asyncio
async def test_generate_from_images_jpeg(openai_client: OpenAIClient) -> None:
    """Test image generation with JPEG format."""
    mock_image = b"\xff\xd8\xff\xe0"

    mock_response = {
        "choices": [{"message": {"content": "JPEG analysis"}}],
        "usage": {"prompt_tokens": 100, "completion_tokens": 20, "total_tokens": 120},
        "model": "gpt-4o",
    }

    with patch.object(openai_client.client, "post", new_callable=AsyncMock) as mock_post:
        mock_response_obj = MagicMock()
        mock_response_obj.json.return_value = mock_response
        mock_response_obj.raise_for_status = MagicMock()
        mock_post.return_value = mock_response_obj

        result = await openai_client.generate_from_images([mock_image], "Describe", max_tokens=100)

        assert result["text"] == "JPEG analysis"


@pytest.mark.asyncio
async def test_generate_text_rate_limit(openai_client: OpenAIClient) -> None:
    """Test rate limiting error."""
    from tenacity import RetryError

    with patch.object(openai_client.client, "post", new_callable=AsyncMock) as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Rate limit exceeded", request=MagicMock(), response=mock_response
        )
        mock_post.return_value = mock_response

        with pytest.raises(RetryError):
            await openai_client.generate_text("Test")


@pytest.mark.asyncio
async def test_close_client(openai_client: OpenAIClient) -> None:
    """Test closing the HTTP client."""
    with patch.object(openai_client.client, "aclose", new_callable=AsyncMock) as mock_close:
        await openai_client.close()
        mock_close.assert_called_once()
