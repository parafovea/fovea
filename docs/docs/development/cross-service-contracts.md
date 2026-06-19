# Cross-service contracts

FOVEA is three services that talk over HTTP/JSON: the annotation-tool
frontend (React), the server (TypeScript/Fastify), and the model-service
(Python/FastAPI). Each producer owns the shapes it emits, publishes them as a
committed OpenAPI document, and the consumer generates types from that
document plus a compile-time check that the consumer's expectations still hold.
There are two contracts, both built the same way.

## The two contracts

| Producer | Consumer | Spec (committed) | Generated types (committed) |
| --- | --- | --- | --- |
| **server** | annotation-tool | `server/openapi.json` | `annotation-tool/src/api/generated/openapi.ts` |
| **model-service** | server | `model-service/openapi.json` | `server/src/lib/model-service/contract.ts` |

The server contract is produced by Fastify's `@fastify/swagger` (the server's
TypeBox route schemas are the source of truth). The model-service contract is
produced by `model-service/scripts/gen_contract_spec.py` from the Pydantic
request/response models.

## How the model-service contract is generated

`model-service/scripts/gen_contract_spec.py`:

1. Imports the cross-service request/response models **directly from**
   `src.infrastructure.adapters.inbound.fastapi.schemas` -- never from
   `src.main` or a route module. Those schema modules are pure Pydantic and do
   not import the ML stack, so the spec can be regenerated in a lint-only CI
   job without installing the multi-gigabyte inference dependencies. The script
   asserts `cv2` / `torch` did not leak into `sys.modules` and fails loudly if
   they did.
2. Walks an explicit **operations registry** -- a list of
   `(method, path, request_model, response_model)` for every endpoint the
   server invokes whose shapes the schemas package owns:

   | Path | Request model | Response model |
   | --- | --- | --- |
   | `POST /api/detection/detect` | `DetectionRequest` | `DetectionResponse` |
   | `POST /api/ontology/augment` | `AugmentRequest` | `AugmentResponse` |
   | `POST /api/extract-claims` | `ClaimExtractionRequest` | `ClaimExtractionResponse` |
   | `POST /api/synthesize-summary` | `SummarySynthesisRequest` | `SummarySynthesisResponse` |
   | `POST /api/summarize` | `SummarizeRequest` | `SummarizeResponse` |

3. Emits an OpenAPI 3.1 document with `json.dumps(..., indent=2,
   sort_keys=True)` so the output is byte-deterministic.

`/api/transcribe` and `/api/diarize` are intentionally **out of scope**: their
request/response models live inline in route modules that import the audio
model manager, so importing them would pull in `cv2` / `torch` and break the
ML-free guarantee. The server consumes those two endpoints through ad-hoc
inline casts rather than the typed mirror interfaces this contract guards.

## How the server consumes the contract

`pnpm --filter @fovea/server gen:model-service-types` runs `openapi-typescript`
over `model-service/openapi.json` to produce `server/src/lib/model-service/contract.ts`.
The `--default-non-nullable false` flag makes Pydantic-defaulted fields
optional in TypeScript (a field with a server-side default is genuinely
optional on the wire).

`server/src/lib/model-service/contract-assertions.ts` holds **compile-time
compatibility assertions**. For every shape the server consumes it checks the
generated (producer) type against the server's hand-written expectation:

- **Responses** -- every field the server reads must exist on the generated
  response type with a compatible value type. A dropped, renamed, or retyped
  field is a breaking change for the server.
- **Requests** -- every field the model-service strictly requires must be one
  the server sends. A newly-required request field the server does not send is
  a breaking change.

Optionality spelling (`T | null` from a Pydantic `T | None` default vs `T?` in
a hand-written interface) is treated as compatible; only genuine
missing/renamed/retyped fields fail. When an assertion fails, `tsc` reports a
`ContractDriftError` whose `offendingKeys` names the field, e.g.:

```
src/lib/model-service/contract-assertions.ts: error TS2344: Type
'{ ContractDriftError: "Producer is missing or retyped a field the consumer
depends on"; offendingKeys: "summary_id"; }' does not satisfy the constraint
'true'.
```

The assertions are type-only; nothing here runs at runtime, and the runtime
call sites are untouched.

## Adding or changing a model-service endpoint

The workflow is the same one motion every time:

1. Edit the Pydantic request/response model under
   `model-service/src/infrastructure/adapters/inbound/fastapi/schemas/`.
2. If you added an endpoint the server calls, add it to the `OPERATIONS`
   registry in `model-service/scripts/gen_contract_spec.py`.
3. Run **`make gen-contract`** from the repo root. This regenerates
   `model-service/openapi.json` and then `server/src/lib/model-service/contract.ts`.
4. If the server reads a new field or sends a new required one, update the
   relevant expectation (`server/src/lib/model-service/contract-assertions.ts`,
   or the `Model*` interfaces in `server/src/queues/setup.ts`).
5. Run `pnpm --filter @fovea/server exec tsc --noEmit`. A red `tsc` here means
   the producer and the server's expectations disagree -- fix the side that is
   wrong.
6. Commit the regenerated `openapi.json` and `contract.ts` alongside your model
   change.

If you forget any of these, CI catches it: the **Contracts / Model Service
Drift Check** job regenerates the spec and the server types and runs
`git diff --exit-code` against the committed files, and the **Backend / Lint**
job's `tsc --noEmit` runs the compatibility assertions. Both feed the
**Quality Gate**, so a stale spec or an incompatible change blocks the merge.

## CI gates

| Job | What it guards |
| --- | --- |
| `Contracts / Drift Check` | `server/openapi.json` and the frontend's generated types are fresh vs the server route schemas. |
| `Contracts / Model Service Drift Check` | `model-service/openapi.json` and `server/src/lib/model-service/contract.ts` are fresh vs the Pydantic models (ML-free install). |
| `Backend / Lint` (`tsc --noEmit`) | The server's compatibility assertions hold against the generated contract types. |

All three are required jobs in the Quality Gate.

## Local commands

```bash
# Regenerate both the model-service spec and the server's generated types
make gen-contract

# Or run the two steps directly
cd model-service && uv run python scripts/gen_contract_spec.py
pnpm --filter @fovea/server gen:model-service-types

# Type-check the server (runs the compatibility assertions)
pnpm --filter @fovea/server exec tsc --noEmit
```
