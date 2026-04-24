"""Anthropic Claude API client implementation.

This module provides a client for the Anthropic Claude API supporting Sonnet, Opus,
and Haiku variants. Implements vision capabilities for multimodal models with automatic
retry logic and error handling.
"""

import base64
from typing import Any

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .base import ExternalAPIClient

MAX_IMAGES_PER_REQUEST = 20


class AnthropicClient(ExternalAPIClient):
    """Client for Anthropic Claude API.

    Supports Claude models including Sonnet, Opus, and Haiku variants.
    Implements vision capabilities for multimodal models.
    """

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.HTTPStatusError)),
    )
    async def generate_text(  # type: ignore[no-untyped-def]
        self, prompt: str, max_tokens: int = 1024, temperature: float = 0.7, **kwargs
    ) -> dict[str, Any]:
        """Generate text using Claude API.

        Parameters
        ----------
        prompt : str
            Input text prompt.
        max_tokens : int, default=1024
            Maximum tokens to generate (1-8192).
        temperature : float, default=0.7
            Sampling temperature (0.0-1.0).
        **kwargs
            Additional parameters (system, stop_sequences, etc).

        Returns
        -------
        dict[str, Any]
            Dict with 'text', 'usage', 'model' keys.

        Raises
        ------
        httpx.HTTPStatusError
            On API errors (401, 429, 500).
        """
        headers = {
            "x-api-key": self.config.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

        payload = {
            "model": self.config.model_id,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }

        if "system" in kwargs:
            payload["system"] = kwargs["system"]
        if "stop_sequences" in kwargs:
            payload["stop_sequences"] = kwargs["stop_sequences"]

        response = await self.client.post(self.config.api_endpoint, headers=headers, json=payload)
        response.raise_for_status()

        data = response.json()
        return {"text": data["content"][0]["text"], "usage": data["usage"], "model": data["model"]}

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.HTTPStatusError)),
    )
    async def generate_from_images(  # type: ignore[no-untyped-def]
        self, images: list[bytes], prompt: str, max_tokens: int = 1024, **kwargs
    ) -> dict[str, Any]:
        """Generate text from images using Claude vision API.

        Parameters
        ----------
        images : list[bytes]
            List of image data as bytes (max 20 images).
        prompt : str
            Text prompt for analysis.
        max_tokens : int, default=1024
            Maximum tokens to generate.
        **kwargs
            Additional parameters.

        Returns
        -------
        dict[str, Any]
            Dict with 'text', 'usage', 'model' keys.

        Raises
        ------
        ValueError
            If more than 20 images provided.
        httpx.HTTPStatusError
            On API errors.
        """
        if len(images) > MAX_IMAGES_PER_REQUEST:
            raise ValueError("Claude supports maximum 20 images per request")

        headers = {
            "x-api-key": self.config.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

        content = []
        for img in images:
            if img[:8] == b"\x89PNG\r\n\x1a\n":
                media_type = "image/png"
            elif img[:2] == b"\xff\xd8":
                media_type = "image/jpeg"
            elif img[:4] == b"RIFF" and img[8:12] == b"WEBP":
                media_type = "image/webp"
            elif img[:4] == b"GIF8":
                media_type = "image/gif"
            else:
                media_type = "image/jpeg"

            content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": base64.b64encode(img).decode("utf-8"),
                    },
                }
            )

        content.append({"type": "text", "text": prompt})

        payload = {
            "model": self.config.model_id,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": content}],
        }

        response = await self.client.post(self.config.api_endpoint, headers=headers, json=payload)
        response.raise_for_status()

        data = response.json()
        return {"text": data["content"][0]["text"], "usage": data["usage"], "model": data["model"]}

    async def validate_key(self) -> bool:
        """Validate API key with minimal request.

        Returns
        -------
        bool
            True if key is valid, False otherwise.
        """
        from tenacity import RetryError

        try:
            await self.generate_text("Test", max_tokens=1)
            return True
        except RetryError as e:
            # Unwrap the RetryError to get the actual exception
            if hasattr(e, "last_attempt") and e.last_attempt.failed:
                original_exception = e.last_attempt.exception()
                if isinstance(
                    original_exception, httpx.HTTPStatusError
                ) and original_exception.response.status_code in (401, 403):
                    return False
            raise
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (401, 403):
                return False
            raise
