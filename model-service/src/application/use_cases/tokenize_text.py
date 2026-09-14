"""Use case for tokenizing text into offset-annotated tokens.

Framework-neutral. Depends only on the :class:`ITokenizer` outbound port and
the tokenization DTOs. Language identification and engine selection live
inside the loader behind the port; this use case owns the tracer span and
offloads the blocking tokenize call to a worker thread so it does not stall
the event loop.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from opentelemetry import trace

if TYPE_CHECKING:
    from src.application.dto.tokenization import TokenizationResultDTO, TokenizeRequest
    from src.application.ports.outbound.tokenizer import ITokenizer

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)


class TokenizeTextUseCase:
    """Tokenize text through an :class:`ITokenizer` implementation."""

    def __init__(self, tokenizer: ITokenizer) -> None:
        """Initialize with the tokenizer port."""
        self._tokenizer = tokenizer

    async def execute(self, request: TokenizeRequest) -> TokenizationResultDTO:
        """Tokenize ``request.text``, optionally forcing ``request.language``.

        Parameters
        ----------
        request : TokenizeRequest
            The text plus an optional language override that skips langid.

        Returns
        -------
        TokenizationResultDTO
            The tokens plus the resolved language, its confidence, the
            tokenization kind, and the engine identifier.
        """
        with tracer.start_as_current_span("tokenize_text_use_case") as span:
            span.set_attribute("text_length", len(request.text))
            span.set_attribute("language_override", request.language or "")

            # Tokenizer engines are synchronous and blocking; offload to a
            # worker thread so a large text does not stall the event loop.
            result = await asyncio.to_thread(
                self._tokenizer.tokenize, request.text, request.language
            )

            span.set_attribute("num_tokens", len(result.tokens))
            span.set_attribute("language", result.language)
            span.set_attribute("model_used", result.model_used)
            return result
