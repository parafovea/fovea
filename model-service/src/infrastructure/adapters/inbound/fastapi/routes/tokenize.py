"""Text tokenization route.

Exposes the text_tokenization task as a standalone endpoint so the server can
tokenize document text into offset-annotated tokens before annotation. The
loader identifies the language (py3langid) and routes to a spaCy blank or a
Stanza pipeline; the caller may pass ``language`` to override detection (the
ASR transcript language is threaded through this way so a transcript is not
re-detected).

The offset contract is the load-bearing part of the response: ``byte_start`` /
``byte_end`` are authoritative UTF-8 byte offsets (end-exclusive) and
``char_start`` / ``char_end`` are JavaScript-compatible UTF-16 code-unit
offsets. See :mod:`src.application.dto.tokenization`.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, cast

from fastapi import APIRouter, HTTPException

from src.application.dto.tokenization import TokenizeRequest as TokenizeRequestDTO
from src.application.use_cases.tokenize_text import TokenizeTextUseCase
from src.infrastructure.adapters.inbound.fastapi import models
from src.infrastructure.adapters.inbound.fastapi.dependencies import ModelManagerDep  # noqa: TC001
from src.infrastructure.adapters.inbound.fastapi.dx_bodies import (
    as_request,
    as_response,
    dump,
)
from src.infrastructure.adapters.inbound.fastapi.routes.inference_locks import inference_lock

if TYPE_CHECKING:
    from src.infrastructure.adapters.outbound.models.text.base import TokenizerLoader

router = APIRouter()
logger = logging.getLogger(__name__)


if TYPE_CHECKING:
    # Handlers type-check against the source wire model; at runtime the body is
    # the mirror FastAPI validates against (the ``else`` branch). The wire models
    # live in ``models`` (the single ML-free source the contract generator reads).
    _TokenizeRequestBody = models.TokenizeRequest
else:
    _TokenizeRequestBody = as_request(models.TokenizeRequest)


@router.post(
    "/tokenize",
    response_model=as_response(models.TokenizeResponse),
    summary="Tokenize text into tokens with byte and UTF-16 offsets.",
)
async def tokenize(
    request: _TokenizeRequestBody,
    manager: ModelManagerDep,
) -> dict[str, object]:
    """Tokenize text using the configured tokenizer, detecting the language."""
    task_config = manager.tasks.get("text_tokenization")
    if task_config is None:
        raise HTTPException(
            status_code=500,
            detail="text_tokenization task not configured in models YAML",
        )

    # Ensure the model is loaded. Warmup may have loaded it already; in that
    # case load_model is a no-op and returns the cached instance.
    # ModelManager.load_model is typed Any per its inbound port; cast to the
    # concrete loader abstract base so the use case receives a typed
    # ITokenizer implementation instead of leaking Any.
    try:
        model = cast("TokenizerLoader", await manager.load_model("text_tokenization"))
    except Exception as exc:
        logger.exception("Failed to load text_tokenization model")
        raise HTTPException(status_code=500, detail=f"Model load failed: {exc}") from exc

    # Serialize inference on the shared cached model: the spaCy / Stanza engines
    # are not safe to drive from two worker threads at once.
    try:
        async with inference_lock("text_tokenization"):
            use_case = TokenizeTextUseCase(model)
            result = await use_case.execute(
                TokenizeRequestDTO(text=request.text, language=request.language)
            )
    except Exception as exc:
        logger.exception("Tokenization failed")
        raise HTTPException(status_code=500, detail=f"Tokenization failed: {exc}") from exc

    return dump(
        models.TokenizeResponse(
            tokens=tuple(
                models.TokenResponse(
                    token_index=token.token_index,
                    text=token.text,
                    byte_start=token.byte_start,
                    byte_end=token.byte_end,
                    char_start=token.char_start,
                    char_end=token.char_end,
                )
                for token in result.tokens
            ),
            language=result.language,
            language_confidence=result.language_confidence,
            tokenization_kind=result.tokenization_kind,
            model_used=result.model_used,
        )
    )
