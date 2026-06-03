# demo.fovea.video Deployment Runbook

## What demo.fovea.video is

A booth-grade public demo of FOVEA. The QR code at the CVPR booth points here. Anyone scanning it lands on a static tour catalogue that runs entirely in the browser; no backend round-trips for the tour experience, no model service, no account required. Serious visitors who want to try the full app can sign in, but registration is disabled by default and accounts are minted only by the operator.

## What the deployment does differently

| Component        | Production (`fovea.video`) | Demo (`demo.fovea.video`)                                |
| ---------------- | -------------------------- | -------------------------------------------------------- |
| Frontend `/`     | Video browser (auth required) | Public tour catalogue (anonymous)                          |
| Model service    | Live container             | Not deployed; MSW intercepts the six routes                 |
| Registration     | Enabled                    | Disabled (`ALLOW_REGISTRATION=false`)                       |
| nginx            | Standard config            | `nginx.demo.conf` with rate limits on `/api/auth/*`         |
| `tour-content.json` | Cached                  | `Cache-Control: no-store` so admin edits land immediately   |
| Build flags      | none                       | `VITE_TOUR_DEMO=1`, `VITE_DEMO_PUBLIC=1`                    |

The split lives behind two flags on the deploy workflow. The build, the env layout, and the running compose remain otherwise identical to the production deploy, so any improvement to one path lands on the other without copy-paste.

## How to deploy

### From a clean tree on `main`

```
gh workflow run deploy.yml -f demo_mode=true
```

This runs the same `deploy.yml` you use for production, with the `demo_mode` workflow input set to `true`. The workflow:

1. Patches `.env` on the server: `ALLOW_REGISTRATION=false`, `VITE_TOUR_DEMO=1`, `VITE_DEMO_PUBLIC=1`.
2. Swaps `annotation-tool/nginx.conf` for `annotation-tool/nginx.demo.conf`.
3. Skips `docker compose up model-service` (the container is not built and not started).
4. Brings up `backend` + `frontend` explicitly so the missing model-service does not block the recreate.

Regular pushes to `main` continue to deploy without `demo_mode`, so production is untouched.

### From the GitHub UI

`Actions` → `Deploy to Production` → `Run workflow` → check `demo_mode`.

## How to seed accounts after the deploy

Registration is off, so visitors cannot mint accounts. To give a partner an account at the booth:

1. Sign in with the admin user that was seeded by `prisma/seed.cjs` (the `ADMIN_PASSWORD` GitHub secret).
2. Open the admin console.
3. `Users` → `Create User`.
4. Hand the email + password to the visitor.

The admin console's `CreateUserDialog` is operator-only and is independent of the `ALLOW_REGISTRATION` env var, so it stays operational under the demo deploy.

## Verifying the deploy

After the workflow finishes:

```
curl -sI https://demo.fovea.video/                 # 200; SPA shell
curl -sI https://demo.fovea.video/tour-content.json  # 200; Cache-Control: no-store
curl -sI https://demo.fovea.video/mockServiceWorker.js  # 200
curl -sI https://demo.fovea.video/api/health        # 200; backend is up
# Auth rate-limit smoke (expect 429 after burst):
for i in $(seq 1 50); do curl -s -o /dev/null -w '%{http_code}\n' -X POST https://demo.fovea.video/api/auth/login -d '{}'; done | sort | uniq -c
```

In a browser:

1. Open `https://demo.fovea.video/`. You should see the FOVEA wordmark + the "Flexible Ontology Visual Event Analyzer" tagline + a 4×3 grid of tour cards.
2. Browser DevTools → Console should show `[tour-demo] MSW worker active — model-service calls are mocked.` before React mounts.
3. Click any tour tile. The engine launches and the spotlight overlays the active anchor.
4. Click `Sign in` top-right. The login page should show the FOVEA branding and, below the form, the "Self-registration is disabled on this deployment. To request an account, email admin@fovea.video" notice.

## Rolling back

`gh workflow run rollback.yml` reverts to the previous release tag. The rollback workflow does not honour `demo_mode`; it restores whatever shape was previously deployed.

To go from a demo deploy back to production shape without a rollback:

```
gh workflow run deploy.yml          # default demo_mode=false → production
```

This re-runs the deploy with `demo_mode=false`, which restores `ALLOW_REGISTRATION=true`, restarts the model-service container, and copies `nginx.conf` back into place.

## How the booth-laptop demo relates

The CVPR booth laptop runs a docker-compose stack locally for guided demos. That stack uses `docker-compose.tour-demo.yml` which sets `VITE_TOUR_DEMO=1` at build time but leaves auth + the rest of the backend untouched. Both deployments share the same MSW interception layer and the same tour content bundle, so what the operator demonstrates on the booth screen is the same flow QR-code visitors get on their phones.

## Maintenance

- Edit `annotation-tool/public/tour-content.json` to retheme tours for a different domain or audience. The file is admin-editable and `Cache-Control: no-store`, so changes take effect on the next page load. See `docs/tour-customization.md`.
- Edit `annotation-tool/src/tours/scripts/*.ts` to extend the engine. The Welcome tour and the Keyframes tour are the entry and exit of the 4×3 grid; reorder in `src/tours/scripts/index.ts:getBuiltInTours`.
- Edit `annotation-tool/nginx.demo.conf` to tune rate limits or caching headers. The `limit_req_zone` rate is `30r/m` for login and `5r/m` for register; raise if real users are tripping the throttle, lower if the backend is under attack.
- Run `pnpm exec vitest run src/tours/` + `pnpm exec playwright test --project=smoke test/e2e/smoke/tour-demo-*.spec.ts` before any tour-engine or fixture change to keep the demo coverage green.
