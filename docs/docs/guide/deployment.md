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

The model-service Dockerfile takes `DEVICE` and `BUILD_MODE`
build args:

```text
DEVICE=cpu                   # CPU-only inference (ONNX Runtime, llama.cpp,
                             # Transformers SmolVLM / Moondream)
DEVICE=gpu                   # GPU inference (SGLang, vLLM, Transformers)
MODEL_BUILD_MODE=minimal     # only ungated open models; CPU-suitable
MODEL_BUILD_MODE=full        # full set including 70B+ models
```

The `cpu` profile defaults to `minimal`; the `gpu` profile
defaults to `full`. Override per environment via
`MODEL_BUILD_MODE`.

## Active model config selection

The Dockerfile creates a build-time symlink at
`/app/config/active-models.yaml` that points at
`models-cpu.yaml` for `DEVICE=cpu` and `models.yaml` for
`DEVICE=gpu`. `MODEL_CONFIG_PATH` defaults to the symlink and
can be overridden at runtime to point at a mounted volume. See
[Reference > Model config](../reference/model-config.md).

## Pre-downloading models

`PRELOAD_MODELS=true` as a build arg pre-downloads every
default model into `/models` so the first run does not pay the
download cost. Pass a Hugging Face token via Docker secret for
gated models:

```bash
echo "$HF_TOKEN" | docker secret create hf_token -
docker buildx build \
  --build-arg DEVICE=gpu \
  --build-arg PRELOAD_MODELS=true \
  --secret id=hf_token \
  -t fovea-model-service:gpu .
```

Without the secret, gated entries are skipped.

## SSRF and path-injection hardening

The model service's video downloader and processor enforce:

- A strict host allow-list with DNS resolution and IP-safety
  check on every URL.
- An extension allow-list on every downloaded file.
- A `resolve`-then-`relative_to` path validation against
  configurable storage roots, replacing the older
  `exists`-then-`commonpath` check.
- CRLF sanitization on every logged user-derived value to
  eliminate log-injection alerts.

`THUMBNAIL_OUTPUT_ROOT` and the storage roots configured on the
model service must be set to absolute paths under the
container's writable volumes; the path validators reject any
input that escapes those roots.

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
