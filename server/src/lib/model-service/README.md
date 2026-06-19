# Model-service contract

This directory holds the server's view of the FOVEA model-service contract.

- **`contract.ts`** is **generated** by `openapi-typescript` from
  `model-service/openapi.json` (the spec the model-service emits, ML-free, via
  `model-service/scripts/gen_contract_spec.py`). Do not edit it by hand. Run
  `pnpm --filter @fovea/server gen:model-service-types` (or `make gen-contract`,
  which regenerates the spec first) to refresh it.
- **`contract-assertions.ts`** holds compile-time compatibility assertions. For
  every model-service shape the server consumes, it checks the generated
  (producer) type against the server's hand-written expectation. If the
  model-service drops, renames, or retypes a field the server reads, `tsc`
  fails with an error naming the field.

The directory is eslint-ignored (`contract.ts` is generated; `contract-assertions.ts`
is type-only) but still type-checked by `tsc --noEmit`. CI regenerates both
`openapi.json` and `contract.ts` and runs `git diff --exit-code` against the
committed files to catch drift.

See `docs/docs/development/cross-service-contracts.md` for the full workflow.
