# @fovea/layers-schema

The `pub.layers.*` annotation vocabulary as TypeScript types and JSON Schema —
the **single source of annotation types** shared by the Fovea server and
frontend. The Python `model-service` consumes the same lexicons through
`lairs`, so annotation types are one system across the whole stack.

## Contents

- `src/generated/**` — TypeScript interfaces for every `pub.layers.*` record and
  shared definition (types only, no runtime dependencies), plus `family.ts`
  (discriminated-union dispatch helpers). Import via `@fovea/layers-schema`.
- `json-schema/openapi.json` — the generated OpenAPI 3.1 document.
- `json-schema/components.json` — the `components.schemas` map, each schema given
  an `$id` of `layers:<Name>` with internal `$ref`s rewritten, ready to register
  with Fastify's `app.addSchema(...)` for panproto-derived request/response
  validation.

## Provenance

All artifacts are **generated from the layers lexicons** by `layers-codegen`
(which drives `idiolect-codegen` over panproto) and vendored here verbatim. Do
not edit `src/generated` or `json-schema` by hand — edit the lexicons and run
`pnpm --filter @fovea/layers-schema gen:layers-schema`. The source layers commit
is recorded in `json-schema/.source-commit`.

Fovea's CI never runs the Rust codegen; it consumes this vendored, pinned output.
Only the layers repo regenerates it.
