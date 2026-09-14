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
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, ClassVar, cast

import didactic.api as dx
from didactic.settings import EnvSource
from didactic.settings import Settings as DxSettings
from didactic.settings._settings import _Source

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

    from didactic.types._typing import FieldValue, JsonObject


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


def _default_transformers_cache() -> Path:
    """Return the default HuggingFace hub cache directory."""
    return Path.home() / ".cache" / "huggingface" / "hub"


def _to_path(value: object) -> FieldValue:
    """Coerce an environment string (or an existing Path) into a Path.

    didactic accepts ``Path`` field values at runtime but omits ``Path`` from
    its ``FieldValue`` converter-output union, so the coerced Path is returned
    through ``FieldValue`` at this single converter seam.
    """
    path = value if isinstance(value, Path) else Path(str(value))
    return cast("FieldValue", path)


@dataclass(frozen=True, slots=True, kw_only=True)
class _AliasEnvSource(_Source):
    """Read fields from the first set variable among a list of aliases.

    didactic's :class:`~didactic.settings.EnvSource` maps a field name to a
    single upper-cased environment variable. Two settings need richer
    resolution: ``hf_token`` reads ``HUGGING_FACE_HUB_TOKEN`` before
    ``HF_TOKEN``, and ``audio_output_root_raw`` mirrors the raw
    ``AUDIO_OUTPUT_ROOT`` value. This source supplies exactly those, and it
    runs after ``EnvSource`` so its resolutions win.

    Parameters
    ----------
    aliases
        Map of field name to the ordered tuple of environment-variable
        names to try; the first one present wins.
    """

    aliases: Mapping[str, tuple[str, ...]]
    name: str = "env-alias"

    def fetch(self, fields: Sequence[str]) -> JsonObject:
        """Return ``{field: value}`` for each alias-backed field that is set."""
        out: JsonObject = {}
        for field_name, names in self.aliases.items():
            if field_name not in fields:
                continue
            for env_name in names:
                if env_name in os.environ:
                    out[field_name] = os.environ[env_name]
                    break
        return out


class Settings(DxSettings):
    """Environment-derived configuration for the model service.

    All fields are populated from environment variables. Validation runs at
    construction time, so an invalid environment fails fast when the
    application starts. Build an instance with :meth:`load`, which merges the
    configured sources; :func:`get_settings` caches one process-wide instance.

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

    model_config_path: Path = dx.field(
        default_factory=_default_model_config_path,
        converter=_to_path,
    )
    otel_exporter_otlp_endpoint: str | None = None
    video_data_root: Path = dx.field(default=Path("/videos"), converter=_to_path)
    audio_output_root: Path = dx.field(default=Path("/audio"), converter=_to_path)
    # Raw, default-free view of AUDIO_OUTPUT_ROOT. The video processor and the
    # transcribe/diarize routes both read AUDIO_OUTPUT_ROOT but apply different
    # fallbacks when it is unset (the processor writes extracted audio under
    # /tmp/audio, the routes accept inputs under /audio). Keeping the raw value
    # here lets each consumer supply its own default.
    audio_output_root_raw: str | None = None
    thumbnail_output_root: Path = dx.field(
        default=Path("/tmp/thumbnails"),  # noqa: S108
        converter=_to_path,
    )
    transformers_cache: Path = dx.field(
        default_factory=_default_transformers_cache,
        converter=_to_path,
    )
    model_service_admin_token: str | None = None
    hf_token: str | None = None

    __sources__: ClassVar[tuple[_Source, ...]] = (
        EnvSource(),
        _AliasEnvSource(
            aliases={
                "hf_token": ("HUGGING_FACE_HUB_TOKEN", "HF_TOKEN"),
                "audio_output_root_raw": ("AUDIO_OUTPUT_ROOT",),
            }
        ),
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
    :func:`get_settings.cache_clear` or call ``Settings.load()`` directly.

    Returns
    -------
    Settings
        The cached, validated settings instance.
    """
    return Settings.load()
