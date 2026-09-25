"""Text-tokenization port definition.

Narrow application-facing interface for tokenizing text into tokens with
byte and UTF-16 offsets. Implementations live in the infrastructure layer
(the spaCy / Stanza loaders); the language-identification and engine-selection
logic lives behind this port, inside those loaders.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.application.dto.tokenization import TokenizationResultDTO


class ITokenizer(ABC):
    """Port for text tokenizers.

    An implementation identifies the language (unless the caller overrides it),
    selects the tokenization engine, and returns tokens with authoritative
    UTF-8 byte offsets and JavaScript-compatible UTF-16 code-unit offsets.
    """

    @abstractmethod
    def tokenize(self, text: str, language: str | None = None) -> TokenizationResultDTO:
        """Tokenize ``text`` and return tokens with dual offset encodings.

        Parameters
        ----------
        text : str
            The text to tokenize.
        language : str | None
            Optional ISO-639-1 language override. When supplied, language
            identification is skipped and this code drives engine selection.

        Returns
        -------
        TokenizationResultDTO
            The tokens plus the resolved language, its confidence, the
            tokenization kind, and the engine identifier.
        """
