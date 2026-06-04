---
sidebar_label: demo.fovea.video deployment
---

# demo.fovea.video deployment runbook

## What demo.fovea.video is

A public demo of FOVEA. A QR code at an event booth
points here. Anyone scanning it lands on a static tour catalogue that
runs entirely in the browser: no backend round-trips for the tour
experience, no model service, no account required. Serious visitors
who want to try the full app can sign in, but registration is disabled
by default and accounts are minted only by the operator.

## What the deployment does differently

| Component             | Production (`fovea.video`)   | Demo (`demo.fovea.video`)                          |
| --------------------- | ---------------------------- | -------------------------------------------------- |
| Frontend `/`          | Video browser (auth required)| Public tour catalogue (anonymous)                  |
| Model service         | Live container               | Not deployed; MSW intercepts the six routes        |
| Registration          | Enabled                      | Disabled (`ALLOW_REGISTRATION=false`)              |
| nginx                 | Standard config              | `nginx.demo.conf` with rate limits on `/api/auth/*`|
| `tour-content.json`   | Cached                       | `Cache-Control: no-store`                          |
| Build flags           | none                         | `VITE_TOUR_DEMO=1`, `VITE_DEMO_PUBLIC=1`           |

The split lives behind a single workflow input. The build, the env
layout, and the compose stack are otherwise identical to the
production deploy, so improvements to one path land on the other
without copy-paste.

## How to deploy

### From a clean tree on `main`

```bash
gh workflow run deploy.yml -f demo_mode=true
```

This runs the same `deploy.yml` you use for production with
`demo_mode=true`. The workflow then:

1. Patches `.env` on the server: `ALLOW_REGISTRATION=false`,
   `VITE_TOUR_DEMO=1`, `VITE_DEMO_PUBLIC=1`.
2. Swaps `annotation-tool/nginx.conf` for
   `annotation-tool/nginx.demo.conf`.
3. Skips `docker compose up model-service` (the container is not
   built and not started).
4. Brings up `backend` and `frontend` explicitly so the missing
   model service does not block the recreate.

Regular pushes to `main` continue to deploy without `demo_mode`, so
production stays untouched.

### From the GitHub UI

`Actions` -> `Deploy to Production` -> `Run workflow` -> check
`demo_mode`.

## How to seed accounts after the deploy

Registration is off, so visitors cannot mint their own accounts. To
hand a partner an account at the demo deployment:

1. Sign in as the admin user seeded by `prisma/seed.cjs`
   (the `ADMIN_PASSWORD` GitHub secret).
2. Open the admin console.
3. `Users` -> `Create User`.
4. Hand the email and password to the visitor.

The admin console's `CreateUserDialog` is operator-only and is
independent of the `ALLOW_REGISTRATION` env var, so it stays
operational under the demo deploy.

## Verifying the deploy

After the workflow finishes:

```bash
curl -sI https://demo.fovea.video/
curl -sI https://demo.fovea.video/tour-content.json
curl -sI https://demo.fovea.video/mockServiceWorker.js
curl -sI https://demo.fovea.video/api/health

# Auth rate-limit smoke (expect 429s after the burst is exhausted):
for i in $(seq 1 50); do
  curl -s -o /dev/null -w '%{http_code}\n' \
    -X POST https://demo.fovea.video/api/auth/login -d '{}'
done | sort | uniq -c
```

In a browser:

1. Open `https://demo.fovea.video/`. You should see the FOVEA wordmark,
   the "Flexible Ontology Visual Event Analyzer" tagline, and a 4x3
   grid of tour cards.
2. DevTools console should show
   `[tour-demo] MSW worker active — model-service calls are mocked.`
   before React mounts.
3. Click any tour tile. The engine launches and the spotlight overlays
   the active anchor.
4. Click `Sign in` top-right. The login page should show the FOVEA
   branding and, below the form, the
   "Self-registration is disabled on this deployment. To request an
   account, email admin@fovea.video" notice.

## nginx hardening

`nginx.demo.conf` adds:

- Two `limit_req_zone` scopes: `login_zone` at `30r/m` with `burst 10`,
  `register_zone` at `5r/m` with `burst 3`. Defence in depth even
  though registration is disabled.
- `Cache-Control: no-store` on `/tour-content.json` so admin edits to
  the content bundle propagate on the next page load.
- `Cache-Control: public, max-age=31536000, immutable` on `/assets/`
  for the hashed bundle output.
- 60 second cache on `/mockServiceWorker.js` so a worker-version bump
  propagates fast without making every QR-code visitor re-download it
  on each scan.

## Rolling back

```bash
gh workflow run rollback.yml
```

The rollback workflow does not honour `demo_mode`; it restores
whatever shape was previously deployed.

To go from a demo deploy back to production shape without a rollback:

```bash
gh workflow run deploy.yml   # default demo_mode=false -> production
```

This re-runs the deploy with `demo_mode=false`, which restores
`ALLOW_REGISTRATION=true`, restarts the model-service container, and
copies `nginx.conf` back into place.

## How the demo deployment-laptop demo relates

The demo laptop runs a docker-compose stack locally for guided
demos. That stack uses `docker-compose.tour-demo.yml`, which sets
`VITE_TOUR_DEMO=1` at build time but leaves auth and the rest of the
backend untouched. Both deployments share the same MSW interception
layer and the same tour content bundle, so what the operator shows on
the demo deployment screen is the same flow QR-code visitors get on their
phones. See [Guide > Tour demo mode](../guide/tour-demo-mode.md) for
the worker details.

## Maintenance

- Edit `annotation-tool/public/tour-content.json` to retheme tours
  for a different domain or audience. The file is admin-editable and
  served `Cache-Control: no-store`, so changes take effect on the
  next page load. The bundle schema lives in the repo at
  `annotation-tool/public/tour-content.schema.json`.
- Edit `annotation-tool/src/tours/scripts/*.ts` to extend the engine.
  The Welcome tour and the Keyframes tour bracket the 4x3 grid;
  reorder in `src/tours/scripts/index.ts:getBuiltInTours`.
- Edit `annotation-tool/nginx.demo.conf` to tune rate limits or
  caching headers.
- Before any tour-engine or fixture change, run
  `pnpm exec vitest run src/tours/` plus
  `pnpm exec playwright test --project=smoke test/e2e/smoke/tour-demo-*.spec.ts`
  to keep the demo coverage green.
