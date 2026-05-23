# FOVEA_DEMO_MODE

The `FOVEA_DEMO_MODE` environment flag turns on the CVPR-demo deployment
layer. It is **off by default** and **must remain off for any production
deployment**. Turning it on enables an explicit auth-bypass endpoint and
a state-wipe endpoint that are dangerous outside the demo's namespaced
sandbox.

## What the flag gates

- The CVPR landing page route group (`/`, `/card`, `/done`) on the frontend.
- The anonymous-session creation endpoint (`POST /api/demo/anonymous-session`)
  — this issues an unauthenticated session token tied to a fresh
  per-visitor user. The endpoint additionally refuses to register unless
  `FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH` is also set (a second explicit gate).
- The fixture-seeder admin endpoint (`POST /api/demo/seed`) — this wipes
  workspace state and reseeds from the demo fixture bundle. Requires an
  `X-Demo-Seed-Token` header matching `FOVEA_DEMO_SEED_TOKEN` (32+
  characters), otherwise the endpoint refuses to register at all.
- The idle-reset job that GCs anonymous demo sessions after 10 minutes.
- Demo-specific telemetry events (`demo.*`).
- Loading of the demo fixture bundle from `annotation-tool/demo/fixtures/`.
- The "Demo — data resets every 10 minutes" banner in the UI.

## What the flag does NOT gate

- The tour engine, tour scripts, `data-tour-id` anchors, in-app tour
  menu, and the `/api/tours` manifest API. Tours are a product feature
  (see `docs/tours.md`).

## Enabling

In your deployment environment (NOT in a `.env` file checked into git):

```bash
FOVEA_DEMO_MODE=true
FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH=true        # required for /api/demo/anonymous-session
FOVEA_DEMO_SEED_TOKEN=<32+ char random hex> # required for /api/demo/seed
```

The two secondary flags are deliberately separate so that flipping the
master flag alone cannot accidentally expose either dangerous surface.

## Verifying

```bash
# With FOVEA_DEMO_MODE=false:
curl -i -X POST $API/api/demo/anonymous-session  # → 404

# With FOVEA_DEMO_MODE=true + FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH=true:
curl -i -X POST $API/api/demo/anonymous-session  # → 200 (after T-11)
```

A CI gate asserts both arms of this behaviour on every PR.
