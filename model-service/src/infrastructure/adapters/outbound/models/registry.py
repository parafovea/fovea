"""Architecture-keyed loader registry.

Each loader family (vlm, llm, detection, audio, tracking) owns one
:class:`LoaderRegistry` instance. Loader classes register themselves
against the architecture Pydantic subclass they implement. The factory
hands a parsed architecture model to ``registry.create``; the registry
looks up the loader class by ``type(arch)``; the loader's constructor
receives the architecture model and the framework-level config object.

The registry has no knowledge of specific model identifiers, weights
checkpoint names, or YAML strings. The only legitimate dispatch key is
the architecture Pydantic class. Substring matching on ``model_id``,
checkpoint filenames, or free-text labels is explicitly forbidden in
factories that consume this registry.

The registry refuses to overwrite an already-registered architecture
silently. A second ``@register`` call for the same architecture raises
:class:`DuplicateArchitectureError` unless it is the same class
(which is the legitimate idempotent case where the module was imported
twice). An unknown architecture at lookup time raises
:class:`UnknownArchitectureError` with the family name and the list of
architectures the registry has seen so far, so a misconfigured YAML
fails loudly with an actionable error message.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, TypeVar

import didactic.api as dx

if TYPE_CHECKING:
    from collections.abc import Callable

ArchT = TypeVar("ArchT", bound=dx.Model)
LoaderT = TypeVar("LoaderT")


class UnknownArchitectureError(LookupError):
    """Raised when a config references an architecture no loader registered for.

    Attributes
    ----------
    architecture : type[dx.Model]
        The architecture class the caller passed.
    family : str
        Which loader family this registry belongs to.
    registered : list[str]
        Architecture class names currently registered in this family.
    """

    def __init__(
        self,
        *,
        architecture: type[dx.Model],
        family: str,
        registered: list[str],
    ) -> None:
        self.architecture = architecture
        self.family = family
        self.registered = sorted(registered)
        super().__init__(
            f"No {family} loader is registered for architecture "
            f"{architecture.__module__}.{architecture.__qualname__!r}. "
            f"Registered architectures in this family: {self.registered!r}. "
            f"Either add the architecture to its loader module with "
            f"@{family}_registry.register(...), or pick a different architecture "
            f"in the model config YAML."
        )


class DuplicateArchitectureError(ValueError):
    """Raised when two distinct loader classes register the same architecture."""

    def __init__(
        self,
        *,
        architecture: type[dx.Model],
        family: str,
        existing: type[Any],
        attempted: type[Any],
    ) -> None:
        self.architecture = architecture
        self.family = family
        self.existing = existing
        self.attempted = attempted
        super().__init__(
            f"{family} architecture {architecture.__qualname__!r} is already registered "
            f"to {existing.__module__}.{existing.__qualname__}; refusing to overwrite "
            f"with {attempted.__module__}.{attempted.__qualname__}. "
            f"If this is intentional, unregister the existing class first."
        )


class LoaderRegistry[ArchT: dx.Model, LoaderT]:
    """Architecture-keyed loader registry for one model family.

    Parameters
    ----------
    family : str
        Short label naming this family (e.g. ``"vlm"``, ``"detection"``).
        Used in error messages so a misconfiguration is actionable.

    Examples
    --------
    Define a registry in the family's loader module and register
    implementations alongside the loader class definitions::

        from src.domain.entities.architectures import SmolVLM, QwenVL
        from src.infrastructure.adapters.outbound.models.registry import LoaderRegistry

        vlm_registry: LoaderRegistry[VLMArchitecture, VLMLoader] = LoaderRegistry(family="vlm")

        @vlm_registry.register(SmolVLM)
        class SmolVLMLoader(VLMLoader):
            def __init__(self, arch: SmolVLM, config: VLMConfig) -> None: ...

        @vlm_registry.register(QwenVL)
        class QwenVLLoader(VLMLoader):
            def __init__(self, arch: QwenVL, config: VLMConfig) -> None: ...

    The factory becomes pure dispatch::

        def create_vlm_loader(model_config: ModelConfig) -> VLMLoader:
            return vlm_registry.create(model_config.architecture, framework_config)
    """

    def __init__(self, *, family: str) -> None:
        if not family or not isinstance(family, str):
            raise TypeError(f"family must be a non-empty string, got {family!r}")
        self._family = family
        self._loaders: dict[type[dx.Model], type[LoaderT]] = {}

    @property
    def family(self) -> str:
        """Short label for this registry's family."""
        return self._family

    @property
    def registered_architectures(self) -> list[type[dx.Model]]:
        """Architecture classes currently registered (insertion order)."""
        return list(self._loaders.keys())

    def register(
        self,
        architecture: type[ArchT],
    ) -> Callable[[type[LoaderT]], type[LoaderT]]:
        """Return a class decorator that registers a loader for one architecture.

        Raises
        ------
        DuplicateArchitectureError
            When a different loader class is already registered for the same
            architecture. Re-registering the SAME class is treated as idempotent
            so module-level decorators survive double-import.
        TypeError
            When the ``architecture`` argument is not a Pydantic model class.
        """
        # Runtime sanity check. The type system already rejects most
        # misuses at call sites, but YAML config loaders and other
        # dynamically-typed paths can still pass instances or non-classes
        # to the registry, and the resulting "no entry for None" lookup
        # error would be much less actionable than a typed message here.
        # Cast to Any so the check is not pruned as unreachable by the
        # static analyser.
        candidate: object = architecture
        if not (isinstance(candidate, type) and issubclass(candidate, dx.Model)):
            raise TypeError(
                f"@{self._family}_registry.register expected a didactic Model class, "
                f"got {architecture!r}"
            )

        def decorator(loader_cls: type[LoaderT]) -> type[LoaderT]:
            existing = self._loaders.get(architecture)
            if existing is not None and existing is not loader_cls:
                raise DuplicateArchitectureError(
                    architecture=architecture,
                    family=self._family,
                    existing=existing,
                    attempted=loader_cls,
                )
            self._loaders[architecture] = loader_cls
            return loader_cls

        return decorator

    def lookup(self, architecture: type[dx.Model]) -> type[LoaderT]:
        """Return the loader class registered for one architecture.

        Raises
        ------
        UnknownArchitectureError
            When no loader has registered for the given architecture class.
        """
        try:
            return self._loaders[architecture]
        except KeyError as exc:
            raise UnknownArchitectureError(
                architecture=architecture,
                family=self._family,
                registered=[cls.__qualname__ for cls in self._loaders],
            ) from exc

    def create(self, architecture: ArchT, *args: Any, **kwargs: Any) -> LoaderT:
        """Instantiate the loader class registered for one architecture model.

        The architecture instance is passed as the first positional argument to
        the loader's constructor, followed by any caller-supplied extras
        (framework config object, cache directory, etc.).
        """
        loader_cls = self.lookup(type(architecture))
        # The architecture model is the first positional argument; loaders
        # are expected to accept their own architecture model first because
        # @register binds the class to the architecture subclass it implements.
        # Pyright cannot verify generic constructor signatures so the call
        # is annotated; the runtime contract is enforced by the loader's
        # own __init__ signature.
        return loader_cls(architecture, *args, **kwargs)  # type: ignore[call-arg]


__all__ = [
    "DuplicateArchitectureError",
    "LoaderRegistry",
    "UnknownArchitectureError",
]
