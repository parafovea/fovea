---
sidebar_label: Production deployment
---

# Production deployment

A production Fovea install is six containers wired together by
the `docker-compose.yml` at the repo root: Postgres, Redis,
backend, model service, frontend, and an OpenTelemetry collector.
All six come from the same image set that CI publishes on every
tagged release; nothing in `docker-compose.yml` is dev-only.

## Prerequisites

- A Linux host with at least 16 GB RAM and a GPU if you want
  local model inference. CPU-only inference is supported via
  the `models-cpu.yaml` config but is slower per video by an
  order of magnitude.
- Docker and Docker Compose v2.
- A Postgres-reachable disk volume for persistent data. The
  default `docker-compose.yml` mounts a named volume; production
  installs typically bind a host path so backups are easy.
- An OIDC issuer if you want SSO. Without one, the backend
  signs its own JWTs and accounts are minted by the admin
  CLI or by the registration form when
  `ALLOW_REGISTRATION=true`.

## First-time setup

1. Clone the repo on the host and check out the release tag you
   plan to run. Tags follow `vMAJOR.MINOR.PATCH`.
2. Copy `.env.example` to `.env` and fill in the required
   variables listed in
   [Reference / Environment variables](../reference/environment-variables.md).
   The variables that almost always need editing are
   `JWT_SECRET`, `DATABASE_URL`, `STORAGE_PATH`, and any
   external API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
   `HF_TOKEN`).
3. `docker compose pull` to fetch the image set for this tag.
4. `docker compose run --rm backend npx prisma migrate deploy`
   to apply database migrations against an empty database.
   This is idempotent; running it twice is a no-op.
5. `docker compose run --rm backend npm run seed:permissions`
   to populate the RBAC permission catalog.
6. `docker compose up -d` to start the stack.
7. Mint the first admin account either through the
   registration form (with `ALLOW_REGISTRATION=true` set
   temporarily) or through `docker compose exec backend
   npm run admin:create -- <email>`.

## What runs where

| Container       | Port (internal) | Purpose                                   |
| --------------- | --------------- | ----------------------------------------- |
| `frontend`      | 80              | nginx serving the React build             |
| `backend`       | 3001            | Fastify API + BullMQ queue producers      |
| `model-service` | 8000            | FastAPI inference service                 |
| `postgres`      | 5432            | Application database                      |
| `redis`         | 6379            | Queue broker for BullMQ                   |
| `otel-collector`| 4318            | OTLP HTTP endpoint for traces and metrics |

The frontend container terminates HTTP. In a real deployment
you typically front it with a reverse proxy (caddy, nginx,
Traefik, an ALB) that holds the TLS certificate and forwards
to the frontend container on port 80. The reverse proxy is the
right place to configure rate limits, IP allowlists, and the
HSTS / CSP headers Fovea does not set itself.

## What to expose

Only the reverse-proxied frontend port should be reachable from
the public internet. The backend, model service, and Postgres
ports are meant to be private. The OTel collector at 4318
accepts traces from both the backend and the model service; if
you forward those to a remote vendor, do it through a private
network, not the public internet.

## Where data lives

- Postgres holds every annotation, persona, ontology, world
  object, claim, summary, and user record. Lose it and you have
  lost the install's state.
- The `STORAGE_PATH` volume holds uploaded videos. Losing it
  loses the videos but leaves all annotation metadata intact;
  annotations carry stable video IDs.
- The `MODEL_CACHE_DIR` volume holds downloaded model weights.
  Losing it costs one re-download per model at next use.
- Redis holds in-flight job state. Losing it cancels any
  currently-running detection or summarization job; the user
  retries from the UI.

## What to plan for

- [Backup and restore](backup-restore.md) for Postgres and the
  storage volume.
- [Monitoring](monitoring.md) for the OTel and Prometheus
  endpoints the stack already emits to.
- [Upgrades](upgrades.md) for the path between releases.
- [Troubleshooting](troubleshooting.md) for the failure modes
  operators have seen in the wild.
