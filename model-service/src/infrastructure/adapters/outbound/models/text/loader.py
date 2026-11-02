"""spaCy and Stanza text-tokenization loaders.

This module hosts the in-process tokenizer loaders and the process-wide engine
caches they share. Language identification runs through py3langid; whitespace-
delimited scripts tokenize with a per-language ``spacy.blank`` pipeline; the
no-whitespace scripts (Chinese, Japanese, Thai) tokenize with Stanza.

Both loaders register against their concrete
:class:`TokenizerArchitecture` subclass on :data:`tokenizer_registry`. The
:func:`create_tokenizer_loader` factory dispatches purely through that
registry: a parsed architecture instance is the only key consulted.

The engine caches (langid identifier, spaCy blanks, Stanza pipelines) are
module-level singletons so a re-selected model or a second loader instance
reuses already-built engines rather than rebuilding them.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Protocol

from src.domain.entities.architectures import SpacyTokenizer, StanzaTokenizer
from src.infrastructure.adapters.outbound.models.text.base import (
    MULTILINGUAL_FALLBACK,
    STANZA_LANGUAGES,
    TokenizerConfig,
    TokenizerLoader,
    tokenizer_registry,
)

if TYPE_CHECKING:
    from collections.abc import Iterable

    from spacy.language import Language
    from spacy.tokens import Doc

    from src.domain.entities.architectures import TokenizerArchitecture

__all__ = [
    "SpacyTokenizerLoader",
    "StanzaTokenizerLoader",
    "TokenizerConfig",
    "TokenizerLoader",
    "create_tokenizer_loader",
    "tokenizer_registry",
]

logger = logging.getLogger(__name__)


# spaCy ships inline types (Language / Doc / Token), so its handles use those
# concrete types directly. Stanza and py3langid ship no type stubs; rather than
# annotate their handles as Any, these Protocols capture the narrow call surface
# this module actually uses, so every function keeps a concrete type.


class _LanguageIdentifier(Protocol):
    """The py3langid classifier surface: text in, ``(code, probability)`` out."""

    def classify(self, text: str) -> tuple[str, float]: ...


class _StanzaToken(Protocol):
    """A Stanza token: its code-point span bounds and surface text."""

    start_char: int
    end_char: int
    text: str


class _StanzaSentence(Protocol):
    """A Stanza sentence exposes its tokens."""

    @property
    def tokens(self) -> Iterable[_StanzaToken]: ...


class _StanzaDocument(Protocol):
    """A Stanza document exposes its sentences."""

    @property
    def sentences(self) -> Iterable[_StanzaSentence]: ...


class _StanzaPipeline(Protocol):
    """A Stanza pipeline: text in, a document out."""

    def __call__(self, text: str) -> _StanzaDocument: ...


# Process-wide engine caches. Keyed by language so a language's engine is built
# at most once regardless of how many loader instances or requests reference it.
_identifier: _LanguageIdentifier | None = None
_blank_cache: dict[str, Language] = {}
_stanza_cache: dict[str, _StanzaPipeline] = {}


def _get_identifier() -> _LanguageIdentifier:
    """Return the py3langid identifier, building it once with normalized probs.

    py3langid's module-level ``classify`` returns a summed log-probability;
    the pickled identifier built with ``norm_probs=True`` instead returns a
    probability in [0.0, 1.0], which is the confidence the wire contract wants.
    """
    global _identifier
    if _identifier is None:
        from py3langid.langid import MODEL_FILE, LanguageIdentifier

        _identifier = LanguageIdentifier.from_pickled_model(MODEL_FILE, norm_probs=True)
    return _identifier


def detect_language(text: str) -> tuple[str, float]:
    """Identify the language of ``text`` and return ``(code, confidence)``."""
    language, probability = _get_identifier().classify(text)
    return str(language), float(probability)


def get_blank(language: str) -> Language:
    """Return a cached ``spacy.blank`` pipeline for ``language``.

    Falls back to the ``xx`` multilingual blank when a language's dedicated
    tokenizer cannot be built (e.g. Korean needs the optional ``mecab-ko``
    system dependency). The fallback pipeline is cached under the requested
    language so the next call is a hit.
    """
    cached = _blank_cache.get(language)
    if cached is not None:
        return cached

    import spacy

    try:
        pipeline = spacy.blank(language)
    except Exception as exc:
        if language == MULTILINGUAL_FALLBACK:
            raise
        logger.warning(
            "spacy.blank(%r) unavailable (%s); falling back to the %r multilingual "
            "tokenizer for this language",
            language,
            exc,
            MULTILINGUAL_FALLBACK,
        )
        pipeline = get_blank(MULTILINGUAL_FALLBACK)

    _blank_cache[language] = pipeline
    return pipeline


def spacy_spans(text: str, language: str) -> list[tuple[int, int]]:
    """Tokenize ``text`` with a spaCy blank pipeline; return code-point spans.

    Whitespace-only tokens (spaCy emits one for each run of extra whitespace)
    are dropped so the token stream carries only content tokens.
    """
    doc: Doc = get_blank(language)(text)
    return [(token.idx, token.idx + len(token.text)) for token in doc if token.text.strip()]


def get_stanza(language: str, resources_dir: str) -> _StanzaPipeline:
    """Return a cached Stanza tokenize pipeline for ``language``.

    The pipeline is CPU-only and reads its models from ``resources_dir`` with
    downloads disabled, so it never reaches the network at runtime; the models
    are baked into the image at build time.
    """
    cached = _stanza_cache.get(language)
    if cached is not None:
        return cached

    import stanza

    pipeline = stanza.Pipeline(
        lang=language,
        processors="tokenize",
        dir=resources_dir,
        use_gpu=False,
        download_method=None,
        verbose=False,
    )
    _stanza_cache[language] = pipeline
    return pipeline


def stanza_spans(text: str, language: str, resources_dir: str) -> list[tuple[int, int]]:
    """Tokenize ``text`` with a Stanza pipeline; return code-point spans.

    Stanza tokens carry ``start_char`` / ``end_char`` as Python code-point
    offsets into the original text, which is exactly the span shape
    :func:`build_tokens` consumes.
    """
    document = get_stanza(language, resources_dir)(text)
    spans: list[tuple[int, int]] = []
    for sentence in document.sentences:
        for token in sentence.tokens:
            spans.append((token.start_char, token.end_char))
    return spans


class _CachedTokenizerLoader(TokenizerLoader):
    """Shared plumbing for loaders backed by the module-level engine caches."""

    def _stanza_dir(self) -> str:
        """Resolve the Stanza resources directory (config override, then settings).

        The environment-backed default (``STANZA_RESOURCES_DIR``) is owned by
        the settings module; the config field lets a caller override it.
        """
        if self.config.stanza_resources_dir:
            return self.config.stanza_resources_dir
        from src.infrastructure.config.settings import get_settings

        return str(get_settings().stanza_resources_dir)

    def _detect_language(self, text: str) -> tuple[str, float]:
        return detect_language(text)

    def _spacy_spans(self, text: str, language: str) -> list[tuple[int, int]]:
        return spacy_spans(text, language)

    def _stanza_spans(self, text: str, language: str) -> list[tuple[int, int]]:
        return stanza_spans(text, language, self._stanza_dir())


@tokenizer_registry.register(SpacyTokenizer)
class SpacyTokenizerLoader(_CachedTokenizerLoader):
    """Tokenizer whose primary engine is spaCy blank pipelines.

    Language identification routes whitespace-delimited scripts to a dedicated
    ``spacy.blank(<lang>)`` when the language is in the architecture's
    ``languages`` list, no-whitespace scripts (zh, ja, th) to Stanza, and
    everything else to ``spacy.blank('xx')``. This is the selected engine in
    the shipped configuration.
    """

    @property
    def spacy_supported(self) -> frozenset[str]:
        """Languages with a dedicated blank pipeline, from the architecture."""
        return frozenset(self.arch.languages)

    def load(self) -> None:
        """Warm py3langid and every declared spaCy blank pipeline at boot.

        Building a blank tolerates a per-language failure (a missing optional
        tokenizer dependency degrades that language to the ``xx`` fallback)
        so a single unavailable language never blocks startup. Stanza
        pipelines for the no-whitespace scripts are built lazily on first use
        from the baked models.
        """
        _get_identifier()
        get_blank(MULTILINGUAL_FALLBACK)
        for language in self.arch.languages:
            get_blank(language)
        logger.info(
            "spaCy tokenizer warmed: %d blank pipeline(s) + langid",
            len(self.arch.languages) + 1,
        )


@tokenizer_registry.register(StanzaTokenizer)
class StanzaTokenizerLoader(_CachedTokenizerLoader):
    """Tokenizer whose primary engine is Stanza (no-whitespace scripts).

    Routes the architecture's languages (zh, ja, th) to Stanza and any other
    detected language to ``spacy.blank('xx')``. Available for operators who
    select Stanza as the primary tokenizer; the shipped configuration selects
    the spaCy loader.
    """

    @property
    def spacy_supported(self) -> frozenset[str]:
        """No dedicated spaCy blanks; non-Stanza languages fall back to xx."""
        return frozenset()

    def load(self) -> None:
        """Warm py3langid and the declared Stanza tokenize pipelines at boot."""
        _get_identifier()
        resources_dir = self._stanza_dir()
        for language in self.arch.languages:
            if language in STANZA_LANGUAGES:
                get_stanza(language, resources_dir)
        get_blank(MULTILINGUAL_FALLBACK)
        logger.info(
            "Stanza tokenizer warmed: %d pipeline(s) + langid + xx fallback",
            len(self.arch.languages),
        )


# Sanity-assert both tokenizer architectures resolved to a loader. The check
# runs once at module load so a forgotten decorator surfaces immediately rather
# than at first tokenize attempt.
_REQUIRED_REGISTRATIONS: tuple[type, ...] = (SpacyTokenizer, StanzaTokenizer)
_MISSING = [
    cls.__name__
    for cls in _REQUIRED_REGISTRATIONS
    if cls not in tokenizer_registry.registered_architectures
]
if _MISSING:
    raise RuntimeError(
        f"tokenizer_registry is missing loader registrations for: {_MISSING}. "
        f"Each TokenizerArchitecture subclass must be decorated with "
        f"@tokenizer_registry.register(...) on its loader class."
    )


def create_tokenizer_loader(
    architecture: TokenizerArchitecture, config: TokenizerConfig
) -> TokenizerLoader:
    """Create the tokenizer loader registered for one architecture.

    Dispatch is pure: the architecture's concrete Pydantic class is the only
    key consulted.

    Parameters
    ----------
    architecture : TokenizerArchitecture
        Parsed architecture entry from the model config.
    config : TokenizerConfig
        Framework-level configuration for the loader.

    Returns
    -------
    TokenizerLoader
        Loader instance registered for ``type(architecture)``.
    """
    return tokenizer_registry.create(architecture, config)
