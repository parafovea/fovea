# Running the CVPR demo locally

This is the developer-side walkthrough for trying every demo tour on
your laptop. It mirrors what the booth deployment does, just with dev
servers instead of a production build and `localhost:5173` instead of
`demo.fovea.video`.

## TL;DR

```bash
./scripts/run-demo-local.sh
```

First run takes ~15 minutes (model-service downloads CV + audio model
weights and builds the image). Subsequent runs are seconds. The script
opens `http://localhost:5173/` on the demo landing page when ready.

```bash
./scripts/run-demo-local.sh --no-fetch  # skip the yt-dlp / ffmpeg clip fetch
./scripts/run-demo-local.sh --stop      # stop dev servers, keep DB + model
./scripts/run-demo-local.sh --reset     # tear everything down + drop DB volume
```

## Prerequisites

Before the script will get past its precheck, you need:

| Tool | Why |
|---|---|
| `docker` (with Compose v2) | Postgres + Redis + model-service all run in docker |
| `node` (≥ 22) and `pnpm` | Frontend + backend dev servers |
| `yt-dlp` | Downloads the KEXP source videos |
| `ffmpeg` | Cuts the source videos into the 30-second demo clips |
| `jq` | The fetch script reads the clip manifest with jq |
| `curl` | Health checks during boot |

macOS install:

```bash
brew install yt-dlp ffmpeg jq
# node + pnpm via your usual node manager (nvm, fnm, etc.)
```

You also need **at least 16 GB of RAM free** — the model-service image
holds the full CV + audio model set in memory when `PRELOAD_MODELS=true`
(which the demo script sets so Tour 6 doesn't cold-start mid-tour).

## One-command bring-up

From the repo root:

```bash
./scripts/run-demo-local.sh
```

That script:

1. **Verifies tooling** — `docker`, `node`, `pnpm`, `yt-dlp`, `ffmpeg`, `jq`, `curl`.
2. **Starts Postgres + Redis** via the existing `docker-compose.yml`.
3. **Brings up `model-service`** (CPU build, `MODEL_BUILD_MODE=full`, `PRELOAD_MODELS=true`) so tracking / detection / audio inference is actually live. First-time build downloads CV + audio model weights — give it 10–15 min. Subsequent runs reuse the cached image.
4. **Runs Prisma migrations** so the demo DB has the right schema.
5. **Fetches the KEXP clip set** by calling `annotation-tool/demo/scripts/fetch-demo-clips.sh`. First run takes ~3–5 min; cached after.
6. **Boots the backend** (`server/`) with the demo env flags and `MODEL_SERVICE_URL=http://localhost:8000`.
7. **Boots the frontend** (`annotation-tool/`) with `VITE_FOVEA_DEMO_MODE=true`.
8. **Opens** `http://localhost:5173/` in your default browser.

You should land on the **demo tile grid** with ten tours, an attribution banner above, and a footer link to `/docs/demo-attribution`.

## What's running where

| Service | URL | Notes |
|---|---|---|
| Postgres | `localhost:5432` | data lives in the docker volume; survives restarts |
| Redis | `localhost:6379` | for BullMQ queues |
| Backend | `localhost:3001` | `pnpm dev` in `server/`, watches via `tsx` |
| Frontend | `localhost:5173` | `pnpm dev` in `annotation-tool/`, Vite HMR |
| Demo clips | `${STORAGE_PATH}` | the script points this at `annotation-tool/demo/clips/` so the same files the fetcher writes are what the video stream route serves |

PIDs and logs live under `.demo-local/` at the repo root. `tail -f .demo-local/backend.log` is the most useful thing if a route doesn't behave.

## Trying a tour

1. Land on the menu, click any tile. The landing page's `onLaunch` posts to `/api/demo/seed` with that tour's `fixtureBundle`.
2. The seeder wipes your anonymous demo user's existing workspace, recreates the persona + ontology defined in `annotation-tool/demo/fixtures/tour-{id}.json`, and upserts any Video rows the bundle references (from `annotation-tool/demo/scripts/clips.json`).
3. The runner mounts, walks you through the script's steps, and emits `demo.tour.*` telemetry events for each step.
4. On finish, you're routed to `/done/{id}` with the recap card, a follow-up suggestion, and the email-capture form.

## Tearing down

```bash
./scripts/run-demo-local.sh --stop    # stop dev servers, keep DB
./scripts/run-demo-local.sh --reset   # also drop the DB volume
```

## Common bumps

**"port 3001 already in use"** — another `pnpm dev` is still running.
Kill it, or run `--stop` first.

**"port 5173 already in use"** — same.

**"clips fetched but the video won't play"** — STORAGE_PATH on the
backend has to point at `annotation-tool/demo/clips/`. The
`run-demo-local.sh` script sets this; if you're running the dev
servers by hand, export `STORAGE_PATH` before `pnpm dev`.

**"the seed endpoint is 404"** — `FOVEA_DEMO_MODE` and
`FOVEA_DEMO_SEED_TOKEN` aren't set on the running backend. Same fix
as above: use the script, or export the vars first.

**"tour starts but the workspace is empty / video panel is blank"** —
the seeder ran but the bundle references a clip id that's not on
disk. Verify with `ls annotation-tool/demo/clips/`. If the file is
missing, re-run the fetcher: `annotation-tool/demo/scripts/fetch-demo-clips.sh frahm-2015-wide-piano` (or whichever id).

**"the runner step-card never paints"** — the script anchor doesn't
resolve in the current build. Check the matching `data-tour-id` in
`docs/tour-anchors.md`; the engine's 3 s ceiling will surface a
"Skip" button after the timeout so you're not stuck.

## Trying a specific tour without the seeder

If you want to bypass the demo router entirely and use the in-app
tour menu against your normal dev workflow:

```bash
unset VITE_FOVEA_DEMO_MODE
cd annotation-tool && pnpm dev
```

`<TourProvider>` mounts in stock builds too — the menu is just hidden
behind opt-in. You can launch it programmatically:

```js
// in browser devtools
window.dispatchEvent(new CustomEvent('fovea:tour:open-menu'))
```

(That event hook is on the roadmap; for now use the demo router.)

## What's NOT covered locally

- The deployed demo's CDN edge caching and global routing.
- The booth's actual hardware (camera + projector + WiFi conditions).
- Live model-service inference for Tour 6. Run `model-service` in a
  separate container if you want to exercise that tour for real;
  otherwise it'll show the "live inference temporarily unavailable"
  badge per the safe-mode design.

## Attribution reminder

The KEXP source videos are CC-BY-NC-SA 3.0. The fetch script and the
manifest live in this repo; the source bytes do not. See
`docs/demo-attribution.md` for the full credit and takedown details.
If you're running the demo somewhere visible to people other than
yourself, **the attribution banner must remain visible** (it's
mounted in `DemoShell` and gated only by `?presenter=1`). Don't ship
a deployment that hides it.
