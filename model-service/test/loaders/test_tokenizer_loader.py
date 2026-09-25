"""Tests for the text-tokenization loaders and their offset contract.

Offset correctness is the priority here: every token must carry authoritative
UTF-8 byte offsets and JavaScript-compatible UTF-16 code-unit offsets, and the
UTF-8 reconstruct invariant must hold on emoji, flag (regional-indicator), ZWJ,
and Arabic text where Python code-point indexing diverges from UTF-16.

The engines that need no network (spaCy blank pipelines, py3langid) run for
real; the Stanza path (which needs baked models) is exercised by substituting a
fake span producer so the routing and offset math are covered offline.
"""

from __future__ import annotations

import pytest

pytest.importorskip("spacy")
pytest.importorskip("py3langid")

from src.domain.entities.architectures import SpacyTokenizer, StanzaTokenizer, Whisper
from src.infrastructure.adapters.outbound.models.registry import UnknownArchitectureError
from src.infrastructure.adapters.outbound.models.text import loader as loader_mod
from src.infrastructure.adapters.outbound.models.text.base import (
    TokenizerConfig,
    build_tokens,
    select_engine,
    tokenizer_registry,
    utf16_units,
)
from src.infrastructure.adapters.outbound.models.text.loader import (
    SpacyTokenizerLoader,
    StanzaTokenizerLoader,
    create_tokenizer_loader,
    detect_language,
)

# Languages the shipped spaCy tokenizer serves with a dedicated blank pipeline.
_SPACY_LANGS = ("en", "ar", "es", "fr")


def _spacy_loader(languages: tuple[str, ...] = _SPACY_LANGS) -> SpacyTokenizerLoader:
    """Build a spaCy tokenizer loader over ``languages`` (no warmup)."""
    arch = SpacyTokenizer(languages=languages)
    return SpacyTokenizerLoader(arch, TokenizerConfig(model_id="spacy/blank:multi"))


def _assert_utf8_reconstructs(text: str, tokens: list) -> None:
    """Every token's byte span must decode back to its own text."""
    encoded = text.encode("utf-8")
    for token in tokens:
        assert encoded[token.byte_start : token.byte_end].decode("utf-8") == token.text


class TestOffsetHelpers:
    """The pure offset helpers produce byte and UTF-16 offsets exactly."""

    def test_utf16_units_counts_surrogate_pairs(self) -> None:
        text = "A👍B"
        # 👍 is one code point but two UTF-16 code units.
        assert utf16_units(text, 0) == 0
        assert utf16_units(text, 1) == 1  # before the emoji
        assert utf16_units(text, 2) == 3  # after the emoji (advanced by 2)
        assert utf16_units(text, 3) == 4

    def test_build_tokens_ascii(self) -> None:
        text = "Hi there"
        tokens = build_tokens(text, [(0, 2), (3, 8)])
        assert [(t.text, t.byte_start, t.byte_end, t.char_start, t.char_end) for t in tokens] == [
            ("Hi", 0, 2, 0, 2),
            ("there", 3, 8, 3, 8),
        ]
        assert [t.token_index for t in tokens] == [0, 1]

    def test_build_tokens_arabic_bytes_and_units(self) -> None:
        # Each Arabic letter is 2 UTF-8 bytes but 1 UTF-16 code unit.
        text = "مرحبا"
        tokens = build_tokens(text, [(0, 5)])
        (token,) = tokens
        assert (token.byte_start, token.byte_end) == (0, 10)
        assert (token.char_start, token.char_end) == (0, 5)
        _assert_utf8_reconstructs(text, tokens)

    def test_build_tokens_emoji_and_flag(self) -> None:
        # 👍 = 4 UTF-8 bytes / 2 UTF-16 units; 🇺 and 🇸 are each 4 bytes / 2 units.
        text = "👍🇺🇸"
        tokens = build_tokens(text, [(0, 1), (1, 2), (2, 3)])
        assert [(t.byte_start, t.byte_end, t.char_start, t.char_end) for t in tokens] == [
            (0, 4, 0, 2),
            (4, 8, 2, 4),
            (8, 12, 4, 6),
        ]
        _assert_utf8_reconstructs(text, tokens)

    def test_byte_and_char_offsets_diverge_on_astral(self) -> None:
        text = "x😀y"
        (_, emoji, _) = build_tokens(text, [(0, 1), (1, 2), (2, 3)])
        # Byte offsets and UTF-16 offsets must not be interchangeable here.
        assert (emoji.byte_start, emoji.byte_end) == (1, 5)
        assert (emoji.char_start, emoji.char_end) == (1, 3)


class TestSpacyTokenizeOffsets:
    """End-to-end offsets from the real spaCy blank pipelines."""

    def test_ascii_invariant(self) -> None:
        loader = _spacy_loader()
        result = loader.tokenize("The telescope observed a galaxy.", language="en")
        assert [t.text for t in result.tokens] == [
            "The",
            "telescope",
            "observed",
            "a",
            "galaxy",
            ".",
        ]
        _assert_utf8_reconstructs("The telescope observed a galaxy.", result.tokens)

    def test_arabic_invariant(self) -> None:
        loader = _spacy_loader()
        text = "مرحبا بالعالم"
        result = loader.tokenize(text, language="ar")
        assert [t.text for t in result.tokens] == ["مرحبا", "بالعالم"]
        _assert_utf8_reconstructs(text, result.tokens)
        # UTF-16 units equal code points here (no astral chars), and are half
        # the byte count for two-byte Arabic letters.
        first = result.tokens[0]
        assert (first.byte_start, first.byte_end) == (0, 10)
        assert (first.char_start, first.char_end) == (0, 5)

    def test_emoji_flag_zwj_invariant(self) -> None:
        loader = _spacy_loader()
        text = "Hi 👍 flags 🇺🇸 fam 👨‍👩‍👧 end"
        result = loader.tokenize(text, language="en")
        assert result.tokens  # non-empty
        _assert_utf8_reconstructs(text, result.tokens)
        # Char offsets are UTF-16 units, so they must trail the byte offsets
        # once astral characters have appeared.
        last = result.tokens[-1]
        assert last.text == "end"
        assert last.char_end < last.byte_end

    def test_whitespace_only_tokens_dropped(self) -> None:
        loader = _spacy_loader()
        result = loader.tokenize("a  b", language="en")  # double space
        assert [t.text for t in result.tokens] == ["a", "b"]


class TestLanguageIdentification:
    """py3langid detects the language and exposes a normalized confidence."""

    @pytest.mark.parametrize(
        "text,expected",
        [
            ("The James Webb Space Telescope observed a distant galaxy last week.", "en"),
            ("أطلقت وكالة ناسا تلسكوب جيمس ويب الفضائي لدراسة المجرات البعيدة في الكون.", "ar"),
            ("Hola, me llamo Juan y soy de Madrid. Me gusta leer libros por la noche.", "es"),
        ],
    )
    def test_detect_language(self, text: str, expected: str) -> None:
        language, confidence = detect_language(text)
        assert language == expected
        assert 0.0 <= confidence <= 1.0

    def test_detected_language_flows_into_result(self) -> None:
        loader = _spacy_loader()
        result = loader.tokenize("The telescope observed a distant galaxy last week.")
        assert result.language == "en"
        assert result.model_used == "spacy/blank:en"
        assert 0.0 <= result.language_confidence <= 1.0


class TestEngineRouting:
    """select_engine routes by language deterministically."""

    def test_dedicated_spacy_language(self) -> None:
        assert select_engine("ar", frozenset(_SPACY_LANGS)) == ("spacy", "ar", "spacy/blank:ar")

    def test_no_whitespace_script_routes_to_stanza(self) -> None:
        assert select_engine("zh", frozenset(_SPACY_LANGS)) == ("stanza", "zh", "stanza:zh")
        assert select_engine("ja", frozenset(_SPACY_LANGS)) == ("stanza", "ja", "stanza:ja")
        assert select_engine("th", frozenset(_SPACY_LANGS)) == ("stanza", "th", "stanza:th")

    def test_unknown_language_falls_back_to_xx(self) -> None:
        # Latin is not in the spaCy set and is not a no-whitespace script.
        assert select_engine("la", frozenset(_SPACY_LANGS)) == (
            "spacy",
            "xx",
            "spacy/blank:xx",
        )


class TestOverrideAndRoutingThroughLoader:
    """The loader honors the override, skips langid, and routes CJK to Stanza."""

    def test_override_skips_langid(self, monkeypatch: pytest.MonkeyPatch) -> None:
        loader = _spacy_loader()

        def _boom(_text: str) -> tuple[str, float]:
            raise AssertionError("langid must not run when a language override is given")

        monkeypatch.setattr(loader_mod, "detect_language", _boom)
        # Arabic text, but forced to English: detection is skipped entirely.
        result = loader.tokenize("مرحبا بالعالم", language="en")
        assert result.language == "en"
        assert result.language_confidence == 1.0
        assert result.model_used == "spacy/blank:en"

    def test_unknown_detected_language_uses_xx(self, monkeypatch: pytest.MonkeyPatch) -> None:
        loader = _spacy_loader(languages=("en",))
        monkeypatch.setattr(loader_mod, "detect_language", lambda _text: ("la", 0.42))
        result = loader.tokenize("Lorem ipsum dolor sit amet")
        assert result.language == "la"
        assert result.model_used == "spacy/blank:xx"
        assert result.language_confidence == pytest.approx(0.42)

    def test_chinese_routes_to_stanza(self, monkeypatch: pytest.MonkeyPatch) -> None:
        loader = _spacy_loader()

        # Substitute the Stanza span producer so the routing and offset math
        # are covered without the baked Stanza models. Character-per-token
        # spans mimic a real CJK tokenizer's code-point spans.
        def _fake_stanza_spans(text: str, language: str, resources_dir: str) -> list:
            assert language == "zh"
            return [(i, i + 1) for i in range(len(text))]

        monkeypatch.setattr(loader_mod, "stanza_spans", _fake_stanza_spans)
        text = "北京大学"
        result = loader.tokenize(text, language="zh")
        assert result.model_used == "stanza:zh"
        assert result.language == "zh"
        assert [t.text for t in result.tokens] == ["北", "京", "大", "学"]
        _assert_utf8_reconstructs(text, result.tokens)
        # Each CJK char is 3 UTF-8 bytes but 1 UTF-16 unit.
        assert (result.tokens[1].byte_start, result.tokens[1].byte_end) == (3, 6)
        assert (result.tokens[1].char_start, result.tokens[1].char_end) == (1, 2)

    def test_empty_text_returns_no_tokens(self) -> None:
        loader = _spacy_loader()
        result = loader.tokenize("", language="en")
        assert result.tokens == []
        assert result.language == "en"


class TestRegistry:
    """The tokenizer registry resolves both architectures to their loaders."""

    def test_both_architectures_registered(self) -> None:
        registered = tokenizer_registry.registered_architectures
        assert SpacyTokenizer in registered
        assert StanzaTokenizer in registered

    def test_lookup_returns_loader_classes(self) -> None:
        assert tokenizer_registry.lookup(SpacyTokenizer) is SpacyTokenizerLoader
        assert tokenizer_registry.lookup(StanzaTokenizer) is StanzaTokenizerLoader

    def test_create_builds_registered_loader(self) -> None:
        loader = create_tokenizer_loader(
            SpacyTokenizer(languages=("en",)), TokenizerConfig(model_id="x")
        )
        assert isinstance(loader, SpacyTokenizerLoader)

    def test_unknown_architecture_raises(self) -> None:
        with pytest.raises(UnknownArchitectureError):
            tokenizer_registry.lookup(Whisper)


class TestWarmup:
    """load() pre-warms the declared engines without crashing on optionals."""

    def test_spacy_load_warms_blanks(self) -> None:
        loader = _spacy_loader(languages=("en", "es"))
        loader.load()  # must not raise
        result = loader.tokenize("hello world", language="en")
        assert [t.text for t in result.tokens] == ["hello", "world"]

    def test_load_tolerates_unavailable_language(self) -> None:
        # Korean's blank needs the optional mecab-ko dependency; the loader
        # must degrade to the xx fallback rather than crash at warmup.
        loader = _spacy_loader(languages=("en", "ko"))
        loader.load()  # must not raise even though spacy.blank('ko') fails
        # Reset the cache pollution from the fallback so other tests are clean.
        loader_mod._blank_cache.pop("ko", None)
