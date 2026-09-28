"""Tests for the typed application settings and the os.environ ban.

These tests exercise :class:`Settings` defaults, environment overrides, the
``HF_TOKEN`` / ``HUGGING_FACE_HUB_TOKEN`` alias choice, the dynamic
provider-key reader, and the OTLP per-signal default handling. A guard test
also asserts that no environment read leaks outside the settings module.

The tests build ``Settings.load()`` so they never pick up a stray
local ``.env`` file and stay deterministic regardless of the developer's
environment.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import TYPE_CHECKING

from src.infrastructure.config.settings import (
    Settings,
    _default_model_config_path,
    get_settings,
)

if TYPE_CHECKING:
    import pytest

# Environment variables Settings consumes; cleared before each parse so the
# host environment cannot perturb default-resolution assertions.
_MANAGED_VARS = (
    "MODEL_CONFIG_PATH",
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "VIDEO_DATA_ROOT",
    "AUDIO_OUTPUT_ROOT",
    "THUMBNAIL_OUTPUT_ROOT",
    "TRANSFORMERS_CACHE",
    "MODEL_SERVICE_ADMIN_TOKEN",
    "HF_TOKEN",
    "HUGGING_FACE_HUB_TOKEN",
)

_SRC_ROOT = Path(__file__).resolve().parents[2] / "src"
_SETTINGS_FILE = _SRC_ROOT / "infrastructure" / "config" / "settings.py"


def _clear_managed_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Remove every Settings-managed variable from the environment."""
    for name in _MANAGED_VARS:
        monkeypatch.delenv(name, raising=False)


def _settings(monkeypatch: pytest.MonkeyPatch) -> Settings:
    """Build a fresh Settings with no .env and a cleared managed environment."""
    _clear_managed_env(monkeypatch)
    return Settings.load()


class TestSettingsDefaults:
    """Default field values when no environment is set."""

    def test_model_config_path_defaults_to_bundled_catalog(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """The catalog path defaults to the packaged config/models.yaml."""
        settings = _settings(monkeypatch)
        assert settings.model_config_path == _default_model_config_path()
        assert settings.model_config_path.name == "models.yaml"
        assert settings.model_config_path.is_absolute()

    def test_path_roots_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Video, audio, and thumbnail roots fall back to their defaults."""
        settings = _settings(monkeypatch)
        assert settings.video_data_root == Path("/videos")
        assert settings.audio_output_root == Path("/audio")
        assert settings.thumbnail_output_root == Path("/tmp/thumbnails")

    def test_transformers_cache_defaults_under_home(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """The HF cache defaults to ~/.cache/huggingface/hub."""
        settings = _settings(monkeypatch)
        assert settings.transformers_cache == Path.home() / ".cache" / "huggingface" / "hub"

    def test_optional_tokens_default_to_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Admin token and HF token are None when unset."""
        settings = _settings(monkeypatch)
        assert settings.model_service_admin_token is None
        assert settings.hf_token is None


class TestSettingsOverrides:
    """Environment variables override the corresponding fields."""

    def test_model_config_path_override(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """MODEL_CONFIG_PATH overrides the catalog path."""
        _clear_managed_env(monkeypatch)
        monkeypatch.setenv("MODEL_CONFIG_PATH", "/custom/models.yaml")
        settings = Settings.load()
        assert settings.model_config_path == Path("/custom/models.yaml")

    def test_path_root_overrides(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """The three path roots honor their environment variables."""
        _clear_managed_env(monkeypatch)
        monkeypatch.setenv("VIDEO_DATA_ROOT", "/data/videos")
        monkeypatch.setenv("AUDIO_OUTPUT_ROOT", "/data/audio")
        monkeypatch.setenv("THUMBNAIL_OUTPUT_ROOT", "/data/thumbs")
        settings = Settings.load()
        assert settings.video_data_root == Path("/data/videos")
        assert settings.audio_output_root == Path("/data/audio")
        assert settings.thumbnail_output_root == Path("/data/thumbs")

    def test_transformers_cache_override(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """TRANSFORMERS_CACHE overrides the HF cache directory."""
        _clear_managed_env(monkeypatch)
        monkeypatch.setenv("TRANSFORMERS_CACHE", "/models/hf")
        settings = Settings.load()
        assert settings.transformers_cache == Path("/models/hf")

    def test_admin_token_override(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """MODEL_SERVICE_ADMIN_TOKEN populates the admin token."""
        _clear_managed_env(monkeypatch)
        admin_value = "shared-secret"
        monkeypatch.setenv("MODEL_SERVICE_ADMIN_TOKEN", admin_value)
        settings = Settings.load()
        assert settings.model_service_admin_token == admin_value


class TestHfTokenAliasChoice:
    """HF token reads HUGGING_FACE_HUB_TOKEN first, then HF_TOKEN."""

    def test_reads_hf_token_fallback(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """HF_TOKEN populates hf_token when the primary name is unset."""
        _clear_managed_env(monkeypatch)
        fallback = "hf-fallback"
        monkeypatch.setenv("HF_TOKEN", fallback)
        settings = Settings.load()
        assert settings.hf_token == fallback

    def test_reads_hugging_face_hub_token(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """HUGGING_FACE_HUB_TOKEN populates hf_token when set."""
        _clear_managed_env(monkeypatch)
        primary = "hf-primary"
        monkeypatch.setenv("HUGGING_FACE_HUB_TOKEN", primary)
        settings = Settings.load()
        assert settings.hf_token == primary

    def test_primary_wins_over_fallback(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """When both are set the primary name takes precedence."""
        _clear_managed_env(monkeypatch)
        fallback = "hf-fallback"
        primary = "hf-primary"
        monkeypatch.setenv("HF_TOKEN", fallback)
        monkeypatch.setenv("HUGGING_FACE_HUB_TOKEN", primary)
        settings = Settings.load()
        assert settings.hf_token == primary


class TestProviderApiKey:
    """The dynamic provider-key reader resolves <PROVIDER>_API_KEY."""

    def test_reads_provider_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """get_provider_api_key upper-cases the provider and reads the key."""
        settings = _settings(monkeypatch)
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-anthropic")
        assert settings.get_provider_api_key("anthropic") == "sk-anthropic"

    def test_missing_provider_key_is_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """An unset provider key resolves to None."""
        settings = _settings(monkeypatch)
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        assert settings.get_provider_api_key("openai") is None

    def test_read_is_live_after_construction(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Provider keys are read at call time, not bound at construction."""
        settings = _settings(monkeypatch)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        assert settings.get_provider_api_key("google") is None
        monkeypatch.setenv("GOOGLE_API_KEY", "sk-google")
        assert settings.get_provider_api_key("google") == "sk-google"


class TestOtelEndpoints:
    """OTLP exporter endpoints preserve the per-signal defaults."""

    def test_defaults_split_traces_and_metrics(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """When unset, traces and metrics resolve to distinct local paths."""
        settings = _settings(monkeypatch)
        assert settings.otel_exporter_otlp_endpoint is None
        assert settings.otel_traces_endpoint == "http://localhost:4318/v1/traces"
        assert settings.otel_metrics_endpoint == "http://localhost:4318/v1/metrics"

    def test_set_endpoint_used_verbatim_for_both(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """When set, both exporters use the raw endpoint with no suffix."""
        _clear_managed_env(monkeypatch)
        monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://collector:4318")
        settings = Settings.load()
        assert settings.otel_traces_endpoint == "http://collector:4318"
        assert settings.otel_metrics_endpoint == "http://collector:4318"


class TestProcessorAudioRoot:
    """The processor's audio root keeps its distinct /tmp/audio default."""

    def test_processor_audio_root_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Unset AUDIO_OUTPUT_ROOT yields /tmp/audio for the processor."""
        settings = _settings(monkeypatch)
        assert settings.processor_audio_output_root == Path("/tmp/audio")

    def test_processor_audio_root_override(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A set AUDIO_OUTPUT_ROOT is shared by both audio consumers."""
        _clear_managed_env(monkeypatch)
        monkeypatch.setenv("AUDIO_OUTPUT_ROOT", "/data/audio")
        settings = Settings.load()
        assert settings.processor_audio_output_root == Path("/data/audio")
        assert settings.audio_output_root == Path("/data/audio")


class TestGetSettings:
    """The cached accessor returns a single validated instance."""

    def test_returns_cached_singleton(self) -> None:
        """get_settings caches one instance across calls."""
        get_settings.cache_clear()
        first = get_settings()
        second = get_settings()
        assert first is second

    def test_fresh_instance_is_constructible(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Tests can build a fresh Settings independent of the cache."""
        fresh = _settings(monkeypatch)
        assert isinstance(fresh, Settings)


class TestNoEnvironReadOutsideSettings:
    """Guard: no os.environ / os.getenv read occurs outside settings.py."""

    def test_no_env_reads_in_src(self) -> None:
        """Grep src/ and assert env reads live only in settings.py."""
        pattern = re.compile(r"os\.environ(?:\.get|\[)|os\.getenv")
        offenders: list[str] = []
        for path in _SRC_ROOT.rglob("*.py"):
            if path == _SETTINGS_FILE:
                continue
            text = path.read_text(encoding="utf-8")
            for lineno, line in enumerate(text.splitlines(), start=1):
                if pattern.search(line):
                    rel = path.relative_to(_SRC_ROOT)
                    offenders.append(f"{rel}:{lineno}: {line.strip()}")
        assert not offenders, "os.environ/os.getenv reads outside settings.py:\n" + "\n".join(
            offenders
        )

    def test_settings_module_owns_the_sole_dynamic_read(self) -> None:
        """settings.py is the only file allowed an os.environ read."""
        pattern = re.compile(r"os\.environ\.get\(")
        text = _SETTINGS_FILE.read_text(encoding="utf-8")
        # The sanctioned dynamic read in get_provider_api_key.
        code_lines = [
            line
            for line in text.splitlines()
            if pattern.search(line) and not line.lstrip().startswith("#")
        ]
        assert len(code_lines) == 1
