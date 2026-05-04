# Deployment

Use Docker Compose to run all services. The repository ships
three compose files: `docker-compose.yml` (production-shaped),
`docker-compose.dev.yml` (overrides for local development), and
`docker-compose.e2e.yml` (overrides for the end-to-end test
suite).

## Profiles

The model service comes in two variants:

```bash
docker compose --profile cpu up      # CPU only (default)
docker compose --profile gpu up      # NVIDIA GPU
```

`docker compose up` (no profile) starts the CPU variant via the
empty default profile. The GPU variant requires the NVIDIA
Container Toolkit and the `nvidia` driver in
`deploy.resources.reservations.devices`.

## Build modes

The model-service Dockerfile takes a `BUILD_MODE` arg:

```text
MODEL_BUILD_MODE=minimal   # only ungated open models; CPU-suitable
MODEL_BUILD_MODE=full      # full set including 70B+ models
```

The `cpu` profile defaults to `minimal`; the `gpu` profile
defaults to `full`. Override per environment via
`MODEL_BUILD_MODE`.

## Service set

The default `docker compose up` brings up these services:

```text
frontend            (3000)
backend             (3001)
model-service       (8000)
postgres            (5432)
redis               (6379)
otel-collector      (4317 grpc, 4318 http)
prometheus          (9090)
grafana             (3010)
```

See [Reference > Service ports](../reference/service-ports.md) for
the full port matrix.

## Production hardening

For a production deployment:

- Set `SESSION_SECRET` to `openssl rand -base64 32` output.
- Set `ADMIN_PASSWORD` to a strong password.
- Set `API_KEY_ENCRYPTION_KEY` to `openssl rand -hex 32` output.
- Set `FOVEA_MODE=multi-user` and `ALLOW_REGISTRATION=false`
  unless the deployment is an open demo.
- Front the backend with TLS termination and forward
  `X-Forwarded-For` so the `LoginAttempt` ipAddress field is
  meaningful.

## Storage

`VIDEO_STORAGE_TYPE` chooses where videos live:

```text
local    on-disk under STORAGE_PATH (default /videos)
s3       fully on S3
hybrid   metadata in postgres, video bytes on S3
```

S3 mode reads `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` (for
non-AWS S3-compatible stores), and AWS credentials. See
[Reference > Environment variables](../reference/environment-variables.md).
