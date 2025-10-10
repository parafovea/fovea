"""Tests for ExternalModelRouter."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.external_apis.router import ExternalModelRouter
from src.external_apis.base import ExternalAPIConfig
from src.external_apis.anthropic_client import AnthropicClient
from src.external_apis.openai_client import OpenAIClient
from src.external_apis.google_client import GoogleClient


@pytest.fixture
def router() -> ExternalModelRouter:
    """Create router instance."""
    return ExternalModelRouter()


@pytest.fixture
def test_config() -> ExternalAPIConfig:
    """Create test configuration."""
    return ExternalAPIConfig(
        api_key="test-key",
        api_endpoint="https://api.example.com/v1/test",
        model_id="test-model",
        timeout=30,
        max_retries=3,
    )


@pytest.mark.asyncio
async def test_get_client_anthropic(router: ExternalModelRouter, test_config: ExternalAPIConfig) -> None:
    """Test getting Anthropic client."""
    client = router.get_client(test_config, "anthropic")
    assert isinstance(client, AnthropicClient)
    assert client.config == test_config


@pytest.mark.asyncio
async def test_get_client_openai(router: ExternalModelRouter, test_config: ExternalAPIConfig) -> None:
    """Test getting OpenAI client."""
    client = router.get_client(test_config, "openai")
    assert isinstance(client, OpenAIClient)
    assert client.config == test_config


@pytest.mark.asyncio
async def test_get_client_google(router: ExternalModelRouter, test_config: ExternalAPIConfig) -> None:
    """Test getting Google client."""
    client = router.get_client(test_config, "google")
    assert isinstance(client, GoogleClient)
    assert client.config == test_config


@pytest.mark.asyncio
async def test_get_client_invalid_provider(
    router: ExternalModelRouter, test_config: ExternalAPIConfig
) -> None:
    """Test getting client with invalid provider."""
    with pytest.raises(ValueError, match="Unsupported provider"):
        router.get_client(test_config, "invalid")


@pytest.mark.asyncio
async def test_client_caching(router: ExternalModelRouter, test_config: ExternalAPIConfig) -> None:
    """Test that clients are cached."""
    client1 = router.get_client(test_config, "anthropic")
    client2 = router.get_client(test_config, "anthropic")
    assert client1 is client2


@pytest.mark.asyncio
async def test_generate_text(router: ExternalModelRouter, test_config: ExternalAPIConfig) -> None:
    """Test text generation routing."""
    mock_response = {"text": "Generated text", "usage": {}, "model": "test-model"}

    with patch.object(AnthropicClient, "generate_text", new_callable=AsyncMock) as mock_generate:
        mock_generate.return_value = mock_response

        result = await router.generate_text(test_config, "anthropic", "Test prompt", max_tokens=100)

        assert result == mock_response
        mock_generate.assert_called_once_with("Test prompt", max_tokens=100)


@pytest.mark.asyncio
async def test_generate_from_images(router: ExternalModelRouter, test_config: ExternalAPIConfig) -> None:
    """Test image generation routing."""
    mock_image = b"\x89PNG\r\n\x1a\n"
    mock_response = {"text": "Image analysis", "usage": {}, "model": "test-model"}

    with patch.object(OpenAIClient, "generate_from_images", new_callable=AsyncMock) as mock_generate:
        mock_generate.return_value = mock_response

        result = await router.generate_from_images(
            test_config, "openai", [mock_image], "Describe", max_tokens=100
        )

        assert result == mock_response
        mock_generate.assert_called_once_with([mock_image], "Describe", max_tokens=100)


@pytest.mark.asyncio
async def test_validate_key(router: ExternalModelRouter, test_config: ExternalAPIConfig) -> None:
    """Test API key validation routing."""
    with patch.object(GoogleClient, "validate_key", new_callable=AsyncMock) as mock_validate:
        mock_validate.return_value = True

        result = await router.validate_key(test_config, "google")

        assert result is True
        mock_validate.assert_called_once()


@pytest.mark.asyncio
async def test_close_all(router: ExternalModelRouter, test_config: ExternalAPIConfig) -> None:
    """Test closing all clients."""
    router.get_client(test_config, "anthropic")
    router.get_client(test_config, "openai")

    with patch.object(AnthropicClient, "close", new_callable=AsyncMock) as mock_close1, patch.object(
        OpenAIClient, "close", new_callable=AsyncMock
    ) as mock_close2:
        await router.close_all()

        assert len(router._clients) == 0
