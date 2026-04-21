"""DTO for external API provider configuration.

Framework-neutral view of external API settings needed by use cases. The
concrete infrastructure ExternalAPIConfig lives in infrastructure; this DTO
contains only the fields application-layer code reads.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ExternalAPIConfigDTO:
    """Configuration for an external provider API.

    Parameters
    ----------
    api_key : str
        Authentication key.
    api_endpoint : str
        Base URL for API requests.
    model_id : str
        Model identifier.
    provider : str
        Provider name (anthropic, openai, google).
    timeout : int
        Request timeout in seconds.
    max_retries : int
        Maximum retry attempts.
    """

    api_key: str
    api_endpoint: str
    model_id: str
    provider: str
    timeout: int = 60
    max_retries: int = 3
