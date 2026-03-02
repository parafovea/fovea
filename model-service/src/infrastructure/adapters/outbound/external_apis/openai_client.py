"""OpenAI GPT API client implementation.

This module provides a client for the OpenAI GPT API supporting GPT-4 and GPT-4o
models with vision capabilities. Implements automatic retry logic and error handling.
"""

import base64
from typing import Any

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .base import ExternalAPIClient


class OpenAIClient(ExternalAPIClient):
    """Client for OpenAI GPT API.

    Supports GPT-4 and GPT-4o models with vision capabilities.
    """

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.HTTPStatusError)),
    )
    async def generate_text(  # type: ignore[no-untyped-def]
        self, prompt: str, max_tokens: int = 1024, temperature: float = 0.7, **kwargs
    ) -> dict[str, Any]:
        """Generate text using OpenAI API.

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
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.config.model_id,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }

        response = await self.client.post(self.config.api_endpoint, headers=headers, json=payload)
        response.raise_for_status()

        data = response.json()
        return {
            "text": data["choices"][0]["message"]["content"],
            "usage": data["usage"],
            "model": data["model"],
        }

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.HTTPStatusError)),
    )
    async def generate_from_images(  # type: ignore[no-untyped-def]
        self, images: list[bytes], prompt: str, max_tokens: int = 1024, **kwargs
    ) -> dict[str, Any]:
        """Generate text from images using GPT vision API.

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
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
        }

        content = []
        for img in images:
            if img[:8] == b"\x89PNG\r\n\x1a\n":
                media_type = "image/png"
            elif img[:2] == b"\xff\xd8":
                media_type = "image/jpeg"
            else:
                media_type = "image/jpeg"

            img_base64 = base64.b64encode(img).decode("utf-8")
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{media_type};base64,{img_base64}"},
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
        return {
            "text": data["choices"][0]["message"]["content"],
            "usage": data["usage"],
            "model": data["model"],
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
