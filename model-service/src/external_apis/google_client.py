"""Google Gemini API client implementation.

This module provides a client for the Google Gemini API supporting Gemini models
with native multimodal capabilities. Implements automatic retry logic and error handling.
"""

import base64
from typing import Any

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .base import ExternalAPIClient


class GoogleClient(ExternalAPIClient):
    """Client for Google Gemini API.

    Supports Gemini models with native multimodal capabilities.
    """

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.HTTPStatusError)),
    )
    async def generate_text(  # type: ignore[no-untyped-def]
        self, prompt: str, max_tokens: int = 1024, temperature: float = 0.7, **kwargs
    ) -> dict[str, Any]:
        """Generate text using Gemini API.

        Parameters
        ----------
        prompt : str
            Input text prompt.
        max_tokens : int, default=1024
            Maximum tokens to generate.
        temperature : float, default=0.7
            Sampling temperature (0.0-1.0).
        **kwargs
            Additional parameters.

        Returns
        -------
        dict[str, Any]
            Dict with 'text', 'usage', 'model' keys.
        """
        headers = {"x-goog-api-key": self.config.api_key, "Content-Type": "application/json"}

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"maxOutputTokens": max_tokens, "temperature": temperature},
        }

        response = await self.client.post(self.config.api_endpoint, headers=headers, json=payload)
        response.raise_for_status()

        data = response.json()
        return {
            "text": data["candidates"][0]["content"]["parts"][0]["text"],
            "usage": data.get("usageMetadata", {}),
            "model": self.config.model_id,
        }

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.HTTPStatusError)),
    )
    async def generate_from_images(  # type: ignore[no-untyped-def]
        self, images: list[bytes], prompt: str, max_tokens: int = 1024, **kwargs
    ) -> dict[str, Any]:
        """Generate text from images using Gemini vision API.

        Parameters
        ----------
        images : list[bytes]
            List of image data as bytes.
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
        """
        headers = {"x-goog-api-key": self.config.api_key, "Content-Type": "application/json"}

        parts = []
        for img in images:
            if img[:8] == b"\x89PNG\r\n\x1a\n":
                mime_type = "image/png"
            elif img[:2] == b"\xff\xd8":
                mime_type = "image/jpeg"
            elif img[:4] == b"RIFF" and img[8:12] == b"WEBP":
                mime_type = "image/webp"
            else:
                mime_type = "image/jpeg"

            parts.append(
                {
                    "inline_data": {
                        "mime_type": mime_type,
                        "data": base64.b64encode(img).decode("utf-8"),
                    }
                }
            )

        parts.append({"text": prompt})  # type: ignore[dict-item]

        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {"maxOutputTokens": max_tokens},
        }

        response = await self.client.post(self.config.api_endpoint, headers=headers, json=payload)
        response.raise_for_status()

        data = response.json()
        return {
            "text": data["candidates"][0]["content"]["parts"][0]["text"],
            "usage": data.get("usageMetadata", {}),
            "model": self.config.model_id,
        }

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
