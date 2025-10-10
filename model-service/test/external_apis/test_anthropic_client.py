"""Tests for Anthropic API client."""

import pytest
import httpx
from unittest.mock import AsyncMock, MagicMock, patch

from src.external_apis.anthropic_client import AnthropicClient
from src.external_apis.base import ExternalAPIConfig


@pytest.fixture
def anthropic_config() -> ExternalAPIConfig:
    """Create test configuration for Anthropic client."""
    return ExternalAPIConfig(
        api_key="sk-ant-test-key",
        api_endpoint="https://api.anthropic.com/v1/messages",
        model_id="claude-sonnet-4-5",
        timeout=30,
        max_retries=3,
    )


@pytest.fixture
def anthropic_client(anthropic_config: ExternalAPIConfig) -> AnthropicClient:
    """Create Anthropic client instance."""
    return AnthropicClient(anthropic_config)


@pytest.mark.asyncio
async def test_generate_text_success(anthropic_client: AnthropicClient) -> None:
    """Test successful text generation."""
    mock_response_data = {
        "content": [{"text": "Generated response"}],
        "usage": {"input_tokens": 10, "output_tokens": 5},
        "model": "claude-sonnet-4-5",
    }

    with patch.object(anthropic_client.client, "post", new_callable=AsyncMock) as mock_post:
        mock_response = MagicMock()
        mock_response.json.return_value = mock_response_data
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        result = await anthropic_client.generate_text("Test prompt", max_tokens=100)

        assert result["text"] == "Generated response"
        assert result["usage"]["input_tokens"] == 10
        assert result["model"] == "claude-sonnet-4-5"


@pytest.mark.asyncio
async def test_generate_text_with_system_prompt(anthropic_client: AnthropicClient) -> None:
    """Test text generation with system prompt."""
    mock_response_data = {
        "content": [{"text": "Response with system"}],
        "usage": {"input_tokens": 15, "output_tokens": 8},
        "model": "claude-sonnet-4-5",
    }

    with patch.object(anthropic_client.client, "post", new_callable=AsyncMock) as mock_post:
        mock_response = MagicMock()
        mock_response.json.return_value = mock_response_data
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        result = await anthropic_client.generate_text(
            "Test prompt", max_tokens=100, system="You are a helpful assistant"
        )

        assert result["text"] == "Response with system"
        call_kwargs = mock_post.call_args[1]
        assert "system" in call_kwargs["json"]


@pytest.mark.asyncio
async def test_generate_from_images_success(anthropic_client: AnthropicClient) -> None:
    """Test successful image generation."""
    mock_image = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"

    mock_response_data = {
        "content": [{"text": "Image analysis result"}],
        "usage": {"input_tokens": 100, "output_tokens": 20},
        "model": "claude-sonnet-4-5",
    }

    with patch.object(anthropic_client.client, "post", new_callable=AsyncMock) as mock_post:
        mock_response = MagicMock()
        mock_response.json.return_value = mock_response_data
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        result = await anthropic_client.generate_from_images(
            [mock_image], "Describe this image", max_tokens=100
        )

        assert result["text"] == "Image analysis result"


@pytest.mark.asyncio
async def test_generate_text_auth_error(anthropic_client: AnthropicClient) -> None:
    """Test authentication error handling."""
    from tenacity import RetryError

    with patch.object(anthropic_client.client, "post", new_callable=AsyncMock) as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Unauthorized", request=MagicMock(), response=mock_response
        )
        mock_post.return_value = mock_response

        with pytest.raises(RetryError):
            await anthropic_client.generate_text("Test")


@pytest.mark.asyncio
async def test_generate_from_images_too_many(anthropic_client: AnthropicClient) -> None:
    """Test error when too many images provided."""
    images = [b"fake" for _ in range(21)]

    with pytest.raises(ValueError, match="maximum 20 images"):
        await anthropic_client.generate_from_images(images, "Test")


@pytest.mark.asyncio
async def test_validate_key_success(anthropic_client: AnthropicClient) -> None:
    """Test API key validation."""
    mock_response_data = {
        "content": [{"text": "Test"}],
        "usage": {"input_tokens": 1, "output_tokens": 1},
        "model": "claude-sonnet-4-5",
    }

    with patch.object(anthropic_client.client, "post", new_callable=AsyncMock) as mock_post:
        mock_response = MagicMock()
        mock_response.json.return_value = mock_response_data
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        result = await anthropic_client.validate_key()
        assert result is True


@pytest.mark.asyncio
async def test_validate_key_invalid(anthropic_client: AnthropicClient) -> None:
    """Test invalid API key detection."""
    with patch.object(anthropic_client.client, "post", new_callable=AsyncMock) as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Unauthorized", request=MagicMock(), response=mock_response
        )
        mock_post.return_value = mock_response

        result = await anthropic_client.validate_key()
        assert result is False


@pytest.mark.asyncio
async def test_generate_from_images_jpeg(anthropic_client: AnthropicClient) -> None:
    """Test image generation with JPEG format."""
    mock_image = b"\xff\xd8\xff\xe0"

    mock_response_data = {
        "content": [{"text": "JPEG analysis"}],
        "usage": {"input_tokens": 100, "output_tokens": 20},
        "model": "claude-sonnet-4-5",
    }

    with patch.object(anthropic_client.client, "post", new_callable=AsyncMock) as mock_post:
        mock_response = MagicMock()
        mock_response.json.return_value = mock_response_data
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        result = await anthropic_client.generate_from_images([mock_image], "Describe", max_tokens=100)

        assert result["text"] == "JPEG analysis"
