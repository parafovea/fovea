"""Typed application settings backed by environment variables.

This module owns every environment-variable read in the model service. A
single :class:`Settings` instance is validated once at startup (fail-fast)
and shared via :func:`get_settings`; route handlers, adapters, and the
dependency-injection container read their configuration off that instance
instead of touching :mod:`os` directly.

The discriminated-union model catalog in ``config/models.yaml`` keeps its
own validation. ``Settings`` only resolves *which* yaml file to load and
feeds that path to the container; it does not replace the catalog schema.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_model_config_path() -> Path:
    """Resolve the bundled ``config/models.yaml`` independent of the cwd.

    ``settings.py`` lives at ``src/infrastructure/config/``; the package
    root is three parents up and the catalog sits in ``config/`` beside
    it. Computing the default from ``__file__`` makes resolution stable
    whether the service is started from the repo root, from ``src/``, or
    from a test runner with an arbitrary working directory.

    Returns
    -------
    Path
        Absolute path to the bundled ``config/models.yaml``.
    """
    return Path(__file__).resolve().parents[3] / "config" / "models.yaml"


class Settings(BaseSettings):
    """Environment-derived configuration for the model service.

    All fields are populated from environment variables (or an optional
    local ``.env`` file). Validation runs at construction time, so an
    invalid environment fails fast when the application starts.

    Attributes
    ----------
    model_config_path : Path
        Filesystem path to the model catalog yaml. Defaults to the bundled
        ``config/models.yaml``. Overridable via ``MODEL_CONFIG_PATH``.
    otel_exporter_otlp_endpoint : str | None
        Raw OTLP exporter endpoint from ``OTEL_EXPORTER_OTLP_ENDPOINT``.
        When unset, the traces and metrics derived properties supply the
        per-signal default URLs.
    video_data_root : Path
        Root directory videos are read from. Overridable via
        ``VIDEO_DATA_ROOT``.
    audio_output_root : Path
        Root directory the transcribe/diarize routes accept audio from.
        Overridable via ``AUDIO_OUTPUT_ROOT``; defaults to ``/audio``.
    thumbnail_output_root : Path
        Root directory thumbnails are written to. Overridable via
        ``THUMBNAIL_OUTPUT_ROOT``.
    transformers_cache : Path
        HuggingFace hub cache directory. Defaults to
        ``~/.cache/huggingface/hub``. Overridable via ``TRANSFORMERS_CACHE``.
    model_service_admin_token : str | None
        Shared secret for the admin reconfigure endpoint. Read from
        ``MODEL_SERVICE_ADMIN_TOKEN``.
    hf_token : str | None
        HuggingFace Hub access token. Read from ``HUGGING_FACE_HUB_TOKEN``,
        falling back to ``HF_TOKEN``.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    model_config_path: Path = Field(
        default_factory=_default_model_config_path,
        validation_alias="MODEL_CONFIG_PATH",
    )

    otel_exporter_otlp_endpoint: str | None = Field(
        default=None,
        validation_alias="OTEL_EXPORTER_OTLP_ENDPOINT",
    )

    video_data_root: Path = Field(
        default=Path("/videos"),
        validation_alias="VIDEO_DATA_ROOT",
    )

    audio_output_root: Path = Field(
        default=Path("/audio"),
        validation_alias="AUDIO_OUTPUT_ROOT",
    )

    # Raw, default-free view of AUDIO_OUTPUT_ROOT. The video processor and the
    # transcribe/diarize routes both read AUDIO_OUTPUT_ROOT but apply different
    # fallbacks when it is unset (the processor writes extracted audio under
    # /tmp/audio, the routes accept inputs under /audio). Keeping the raw value
    # here lets each consumer supply its own default without a second os.environ
    # read leaking outside this module.
    audio_output_root_raw: str | None = Field(
        default=None,
        validation_alias="AUDIO_OUTPUT_ROOT",
    )

    thumbnail_output_root: Path = Field(
        default=Path("/tmp/thumbnails"),  # noqa: S108
        validation_alias="THUMBNAIL_OUTPUT_ROOT",
    )

    transformers_cache: Path = Field(
        default_factory=lambda: Path.home() / ".cache" / "huggingface" / "hub",
        validation_alias="TRANSFORMERS_CACHE",
    )

    model_service_admin_token: str | None = Field(
        default=None,
        validation_alias="MODEL_SERVICE_ADMIN_TOKEN",
    )

    hf_token: str | None = Field(
        default=None,
        validation_alias=AliasChoices("HUGGING_FACE_HUB_TOKEN", "HF_TOKEN"),
    )

    @property
    def processor_audio_output_root(self) -> Path:
        """Root the video processor writes extracted audio under.

        Reads ``AUDIO_OUTPUT_ROOT`` and falls back to ``/tmp/audio`` when
        unset. This differs from :attr:`audio_output_root` (which the
        transcribe/diarize routes consume with a ``/audio`` fallback);
        the processor's distinct default is preserved here.
        """
        return Path(self.audio_output_root_raw or "/tmp/audio")  # noqa: S108

    @property
    def otel_traces_endpoint(self) -> str:
        """OTLP traces endpoint, with the per-signal default applied.

        Returns the raw ``OTEL_EXPORTER_OTLP_ENDPOINT`` when set, otherwise
        ``http://localhost:4318/v1/traces``.
        """
        return self.otel_exporter_otlp_endpoint or "http://localhost:4318/v1/traces"

    @property
    def otel_metrics_endpoint(self) -> str:
        """OTLP metrics endpoint, with the per-signal default applied.

        Returns the raw ``OTEL_EXPORTER_OTLP_ENDPOINT`` when set, otherwise
        ``http://localhost:4318/v1/metrics``.
        """
        return self.otel_exporter_otlp_endpoint or "http://localhost:4318/v1/metrics"

    def get_provider_api_key(self, provider: str) -> str | None:
        """Read the API key for an external model provider.

        External-API model entries name their key by convention as
        ``<PROVIDER>_API_KEY`` (for example ``ANTHROPIC_API_KEY``). The
        set of providers is data-driven from the catalog, so the variable
        name cannot be a static field; this is the one sanctioned dynamic
        environment read in the service and it lives here, inside the
        settings module.

        Parameters
        ----------
        provider : str
            Provider name from the model catalog (for example
            ``"anthropic"``). Upper-cased to form the variable name.

        Returns
        -------
        str | None
            The configured key, or ``None`` when the variable is unset.
        """
        return os.environ.get(f"{provider.upper()}_API_KEY")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide :class:`Settings` instance.

    The instance is constructed (and therefore validated) on first call
    and cached for the life of the process so validation runs exactly
    once. Tests that need a fresh read of the environment can either call
    :func:`get_settings.cache_clear` or construct ``Settings()`` directly.

    Returns
    -------
    Settings
        The cached, validated settings instance.
    """
    return Settings()
