"""Emit the model-service cross-service contract as an OpenAPI 3.1 document.

The model-service owns the request/response shapes it produces; the server
(TypeScript/Fastify) consumes them. This script is the single, ML-free source
of truth for that contract: it imports only the Pydantic request/response
models the server invokes and serializes them, plus an explicit operations
registry, into ``model-service/openapi.json``.

Why ML-free
-----------
The wire-model module
``src.infrastructure.adapters.inbound.fastapi.models`` holds pure didactic
``dx.Model`` request/response types; it does not import the ML stack (``cv2``,
``torch``, the model loaders). This script imports those models directly (NOT
``src.main``, which builds the FastAPI app and pulls in the loaders),
converts each to its Pydantic mirror via
``src.infrastructure.adapters.inbound.fastapi.dx_bodies.as_request``, and
serializes the mirrors, so the spec can be regenerated in a lint-only CI job
without installing the multi-gigabyte inference dependencies. The
``_assert_ml_free`` guard fails loudly if any import leaks ``cv2`` into
``sys.modules``.

Scope
-----
Only the schema-package-backed endpoints are in the contract: detection,
ontology augmentation, claim extraction, summary synthesis, and video
summarization. The ``/api/transcribe`` and ``/api/diarize`` request/response
models live inline in their route modules, which import the audio model
manager and therefore pull in ``cv2`` / ``torch`` -- importing them here would
break the ML-free guarantee, so they are intentionally excluded. The server
consumes those two endpoints through ad-hoc inline casts rather than the typed
mirror interfaces this contract guards, so they fall outside the pipeline.

Determinism
-----------
Output is ``json.dumps(..., indent=2, sort_keys=True)`` with a trailing
newline. Running the script twice produces a byte-identical file, so a
``git diff --exit-code`` drift gate is meaningful.

Usage
-----
``make gen-contract`` (or ``uv run python scripts/gen_contract_spec.py`` from
``model-service/``).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Literal, NamedTuple

from pydantic.json_schema import GenerateJsonSchema, models_json_schema

if TYPE_CHECKING:
    from pydantic import BaseModel

# Make the model-service package root (the parent of this scripts/ directory)
# importable when the script is run as a file, where sys.path[0] is scripts/
# rather than the project root.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

# Import the cross-service wire models DIRECTLY from the models module and
# convert each to its Pydantic mirror. This must stay cv2-free: do NOT import
# from src.main or any route module that builds the FastAPI app / loads models.
# The E402 (import-not-at-top) suppression is intentional: the sys.path
# bootstrap above must run before this import can resolve when the script is
# invoked as a file.
from src.infrastructure.adapters.inbound.fastapi import models as _wire  # noqa: E402
from src.infrastructure.adapters.inbound.fastapi.dx_bodies import (  # noqa: E402
    as_request,
)

AugmentRequest = as_request(_wire.AugmentRequest)
AugmentResponse = as_request(_wire.AugmentResponse)
ClaimExtractionRequest = as_request(_wire.ClaimExtractionRequest)
ClaimExtractionResponse = as_request(_wire.ClaimExtractionResponse)
DetectionRequest = as_request(_wire.DetectionRequest)
DetectionResponse = as_request(_wire.DetectionResponse)
SummarizeRequest = as_request(_wire.SummarizeRequest)
SummarizeResponse = as_request(_wire.SummarizeResponse)
SummarySynthesisRequest = as_request(_wire.SummarySynthesisRequest)
SummarySynthesisResponse = as_request(_wire.SummarySynthesisResponse)

# The committed spec lives at model-service/openapi.json (one directory up from
# this scripts/ folder).
_OUTPUT_PATH = Path(__file__).resolve().parent.parent / "openapi.json"

# Component schemas are referenced as #/components/schemas/<ModelName>.
_REF_TEMPLATE = "#/components/schemas/{model}"


class Operation(NamedTuple):
    """One endpoint in the cross-service contract.

    Attributes
    ----------
    method
        Lowercase HTTP method (``post``).
    path
        Full request path including the ``/api`` router prefix.
    summary
        Short human-readable description for the OpenAPI operation.
    request_model
        Pydantic model for the request body.
    response_model
        Pydantic model for the 200 response body.
    """

    method: str
    path: str
    summary: str
    request_model: type[BaseModel]
    response_model: type[BaseModel]


# Explicit registry of every endpoint the server invokes whose request/response
# shapes are owned by the schemas package. Paths and response models are taken
# from the route decorators under
# src/infrastructure/adapters/inbound/fastapi/routes/*.py and cross-checked
# against the server call sites:
#   - POST /api/detection/detect   server/src/routes/videos/detect.ts
#   - POST /api/ontology/augment   server/src/routes/ontology.ts
#   - POST /api/extract-claims     server/src/queues/setup.ts
#   - POST /api/synthesize-summary server/src/queues/setup.ts
#   - POST /api/summarize          server/src/queues/setup.ts
OPERATIONS: list[Operation] = [
    Operation(
        method="post",
        path="/api/detection/detect",
        summary="Detect objects in video frames.",
        request_model=DetectionRequest,
        response_model=DetectionResponse,
    ),
    Operation(
        method="post",
        path="/api/ontology/augment",
        summary="Suggest ontology types for a persona domain.",
        request_model=AugmentRequest,
        response_model=AugmentResponse,
    ),
    Operation(
        method="post",
        path="/api/extract-claims",
        summary="Extract claims from a generated summary.",
        request_model=ClaimExtractionRequest,
        response_model=ClaimExtractionResponse,
    ),
    Operation(
        method="post",
        path="/api/synthesize-summary",
        summary="Synthesize a summary gloss from claim sources.",
        request_model=SummarySynthesisRequest,
        response_model=SummarySynthesisResponse,
    ),
    Operation(
        method="post",
        path="/api/summarize",
        summary="Summarize a video for a persona.",
        request_model=SummarizeRequest,
        response_model=SummarizeResponse,
    ),
]


def _assert_ml_free() -> None:
    """Fail loudly if importing the contract models leaked the ML stack.

    The whole point of generating the spec from the schemas package is that it
    stays free of ``cv2`` / ``torch`` so the drift gate can run in a lint-only
    job. If a future refactor makes a schema module import a model loader, this
    guard turns the silent regression into a hard failure.
    """
    leaked = [name for name in ("cv2", "torch") if name in sys.modules]
    if leaked:
        raise RuntimeError(
            "Contract spec generation imported the ML stack "
            f"({', '.join(sorted(leaked))} in sys.modules). The schemas package "
            "must stay import-clean; do not import route/loader modules here."
        )


def _build_components(generator: type[GenerateJsonSchema]) -> dict[str, object]:
    """Build the ``components.schemas`` map for every model in the registry.

    Parameters
    ----------
    generator
        JSON-schema generator class passed through to
        :func:`pydantic.json_schema.models_json_schema`.

    Returns
    -------
    dict[str, object]
        Map of model name to its JSON schema, suitable for
        ``components.schemas``.
    """
    mode: Literal["validation", "serialization"] = "validation"
    models: list[tuple[type[BaseModel], Literal["validation", "serialization"]]] = []
    seen: set[type[BaseModel]] = set()
    for operation in OPERATIONS:
        for model in (operation.request_model, operation.response_model):
            if model not in seen:
                seen.add(model)
                models.append((model, mode))

    _, schemas = models_json_schema(
        models,
        ref_template=_REF_TEMPLATE,
        schema_generator=generator,
    )
    definitions = schemas.get("$defs", {})
    if not isinstance(definitions, dict):
        raise RuntimeError("models_json_schema did not return a $defs mapping")
    # Flatten the recursive JsonValue schema. Pydantic emits JsonValue's array
    # items and object values as $refs back to JsonValue; openapi-typescript then
    # renders a type alias that references itself through indexed access into the
    # still-computing components map, which tsc rejects with TS2502. JsonValue is
    # opaque freeform JSON to a contract consumer, so emit the primitive union
    # with unknown-typed containers: it keeps the top-level shape and compiles.
    if "JsonValue" in definitions:
        definitions["JsonValue"] = {
            "description": "An arbitrary JSON value.",
            "anyOf": [
                {"type": "string"},
                {"type": "integer"},
                {"type": "number"},
                {"type": "boolean"},
                {"type": "array", "items": {}},
                {"type": "object", "additionalProperties": {}},
                {"type": "null"},
            ],
        }
    # Sort so the emitted document is deterministic regardless of model order.
    return {name: definitions[name] for name in sorted(definitions)}


def _build_paths() -> dict[str, object]:
    """Build the ``paths`` object from the operations registry."""
    paths: dict[str, object] = {}
    for operation in OPERATIONS:
        request_ref = _REF_TEMPLATE.format(model=operation.request_model.__name__)
        response_ref = _REF_TEMPLATE.format(model=operation.response_model.__name__)
        paths[operation.path] = {
            operation.method: {
                "summary": operation.summary,
                "operationId": f"{operation.method}_{operation.path}",
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {"$ref": request_ref},
                        },
                    },
                },
                "responses": {
                    "200": {
                        "description": "Successful response.",
                        "content": {
                            "application/json": {
                                "schema": {"$ref": response_ref},
                            },
                        },
                    },
                },
            },
        }
    return paths


def build_spec() -> dict[str, object]:
    """Assemble the full OpenAPI 3.1 document for the contract."""
    return {
        "openapi": "3.1.0",
        "info": {
            "title": "FOVEA Model Service Contract",
            "version": "0.5.0",
            "description": (
                "Cross-service contract for the request/response shapes the FOVEA "
                "model-service produces and the server consumes. Generated without "
                "importing the ML stack by scripts/gen_contract_spec.py; do not edit "
                "by hand."
            ),
        },
        "paths": _build_paths(),
        "components": {"schemas": _build_components(GenerateJsonSchema)},
    }


def main() -> None:
    """Generate the contract spec and write it deterministically to disk."""
    _assert_ml_free()
    spec = build_spec()
    serialized = json.dumps(spec, indent=2, sort_keys=True) + "\n"
    _OUTPUT_PATH.write_text(serialized, encoding="utf-8")
    sys.stdout.write(f"Wrote contract spec to {_OUTPUT_PATH}\n")


if __name__ == "__main__":
    main()
