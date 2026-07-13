"""Recursive ``dx.Model`` to Pydantic adapter for FastAPI bodies.

FastAPI validates request and response bodies through Pydantic. didactic
ships :func:`didactic.pydantic.to_pydantic`, but that converter is shallow:
it copies each field's annotation verbatim, so a field whose type is (or
contains) another :class:`didactic.api.Model` leaves a raw ``dx.Model``
class in the annotation, which Pydantic cannot build a schema for.

This module adds the missing recursion. :func:`as_request` /
:func:`as_response` walk each field's annotation, convert every nested
``dx.Model`` to its Pydantic mirror bottom-up, and rebuild the container
shape (``tuple[T, ...]``, ``dict[str, V]``, ``T | None``,
``Annotated[T, ...]``) around the converted parts. The result is a fully
nested Pydantic model suitable for FastAPI request validation, response
serialization, and OpenAPI generation.

The Pydantic model builders are taken from the ``didactic.pydantic``
interop package (the same layer :func:`didactic.pydantic.to_pydantic`
uses) rather than imported from ``pydantic`` directly, so the service's
first-party code depends on Pydantic only transitively through didactic.

The conversion is cached per source class, so each ``dx.Model`` maps to one
stable Pydantic class regardless of how many routes reference it.
"""

from __future__ import annotations

import json
from types import UnionType
from typing import TYPE_CHECKING, Annotated, Union, cast, get_args, get_origin

import didactic.api as dx
from didactic.fields._fields import MISSING
from didactic.pydantic import _reverse as _dxp

if TYPE_CHECKING:
    from didactic.types._typing import JsonValue

# Pydantic builders, reached through the didactic interop package.
_build_model = _dxp.create_model
_field_info = _dxp.Field

_CACHE: dict[type, type] = {}
# Models whose Pydantic mirror is mid-construction. A field that references
# one of these (a self-referential model like a claim tree) is emitted as a
# string forward reference; Pydantic resolves it inside ``create_model``.
_BUILDING: set[type] = set()


def dump(model: dx.Model) -> dict[str, JsonValue]:
    """Render a wire ``dx.Model`` as a JSON-shaped dict for a route return.

    Routes return this dict; FastAPI validates it against the route's
    ``response_model`` (the mirror from :func:`as_response`). Using
    ``model_dump_json`` (rather than ``model_dump``) recurses through nested
    ``tuple[Model, ...]`` fields, which ``model_dump`` alone leaves as raw
    sub-model instances.
    """
    return cast("dict[str, JsonValue]", json.loads(model.model_dump_json()))


def _is_dx_model(annotation: object) -> bool:
    """Return True when ``annotation`` is a ``dx.Model`` subclass."""
    return isinstance(annotation, type) and issubclass(annotation, dx.Model)


def _rewrite(annotation: object) -> object:
    """Rewrite an annotation, converting nested ``dx.Model`` classes.

    Walks container shapes (tuple, dict, union, Annotated) and replaces any
    ``dx.Model`` leaf with its Pydantic mirror. Non-model leaves and shapes
    didactic does not use in bodies are returned unchanged.
    """
    if _is_dx_model(annotation):
        if annotation in _BUILDING:
            # self-reference; emit a forward ref Pydantic resolves in place
            return cast("type", annotation).__name__
        return as_request(cast("type[dx.Model]", annotation))
    origin = get_origin(annotation)
    args = get_args(annotation)
    if origin is None or not args:
        return annotation
    if origin is Annotated:
        base, *meta = args
        return Annotated[(_rewrite(base), *meta)]
    if origin in (Union, UnionType):
        # dynamic union from a runtime tuple of arms; ``X | Y`` cannot express this
        return Union[tuple(_rewrite(arg) for arg in args)]  # noqa: UP007
    if origin is tuple:
        if len(args) == 2 and args[1] is Ellipsis:
            return tuple[_rewrite(args[0]), ...]
        return tuple[tuple(_rewrite(arg) for arg in args)]
    if origin is dict:
        return dict[args[0], _rewrite(args[1])]
    return annotation


def as_request[M: dx.Model](model: type[M]) -> type:
    """Return a nested Pydantic mirror of ``model`` for a FastAPI body.

    Parameters
    ----------
    model
        A :class:`didactic.api.Model` subclass used as a request or
        response body.

    Returns
    -------
    type
        A Pydantic model subclass mirroring ``model``'s shape, including
        every nested ``dx.Model`` field. Cached per source class.
    """
    if model in _CACHE:
        return _CACHE[model]

    _BUILDING.add(model)
    try:
        fields: dict[str, tuple[object, object]] = {}
        for fname, spec in model.__field_specs__.items():
            if spec.usage_mode != "readwrite":
                continue
            annotation = _rewrite(spec.annotation)
            kwargs: dict[str, object] = {}
            if spec.default is not MISSING:
                kwargs["default"] = spec.default
            elif spec.default_factory is not None:
                kwargs["default_factory"] = spec.default_factory
            else:
                kwargs["default"] = ...
            if spec.description:
                kwargs["description"] = spec.description
            if spec.alias:
                kwargs["alias"] = spec.alias
            fields[fname] = (annotation, _field_info(**kwargs))

        creator = cast("object", _build_model)
        pyd = cast(
            "type",
            creator(  # type: ignore[operator]
                model.__name__,
                __module__=model.__module__,
                __doc__=model.__doc__,
                **fields,
            ),
        )
    finally:
        _BUILDING.discard(model)
    _CACHE[model] = pyd
    return pyd


def as_response[M: dx.Model](model: type[M]) -> type:
    """Synonym of :func:`as_request` for response-model route signatures."""
    return as_request(model)


__all__ = ["as_request", "as_response", "dump"]
