# Generated API types

`openapi.ts` is generated from `server/openapi.json` by `openapi-typescript`. Do
not edit it by hand. The server's Fastify + TypeBox route schemas are the source
of truth for every cross-service contract.

To regenerate after changing server route schemas:

```bash
# 1. dump the OpenAPI spec from the server route schemas
#    (buildApp connects to Redis + Postgres, so point env at reachable infra;
#     the e2e stack is the convenient local target)
REDIS_HOST=localhost REDIS_PORT=6380 \
  DATABASE_URL="postgresql://fovea:fovea_password@localhost:5433/fovea_test" \
  pnpm --filter @fovea/server gen:openapi

# 2. regenerate the frontend types from the committed spec
pnpm --filter @fovea/annotation-tool gen:api-types
```

Commit both `server/openapi.json` and `openapi.ts` together. The `contract-drift`
CI job regenerates both and fails the build if either committed file is stale.

`contracts.ts` re-exports stable, named contract types aliased from the generated
`paths` interface. Import contract types from `contracts.ts` (or the re-exports in
`@api/client`), never from `openapi.ts` directly, so call sites stay decoupled
from the generated path/operation shape.
