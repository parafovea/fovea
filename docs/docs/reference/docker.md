# Docker

The repository ships six compose files:

```text
docker-compose.yml                  production-shaped, the default
docker-compose.dev.yml              overrides for local development
docker-compose.e2e.yml              overrides for the end-to-end test suite
docker-compose.e2e.real-models.yml  overrides for the e2e suite running against real models
docker-compose.tour-demo.yml        overrides for the tour/demo environment
docker-compose.wikibase.yml         local Wikibase instance
```

## Profiles

```text
docker compose up                       # default profile (CPU model service)
docker compose --profile cpu up         # explicit CPU
docker compose --profile gpu up         # NVIDIA GPU model service
```

The default profile starts the CPU model-service variant via the
empty profile (`profiles: ["cpu", ""]` on the
`model-service` service). The GPU variant
(`model-service-gpu`) takes its place when
`--profile gpu` is passed and uses the
`nvidia` driver via `deploy.resources.reservations.devices`.

## Build args

The model-service Dockerfile takes two args:

```text
BUILD_MODE   minimal | recommended | full
DEVICE       cpu | gpu
```

The compose file wires these via `MODEL_BUILD_MODE` and the
profile:

```text
profile      DEVICE   default BUILD_MODE
-----------  -------  ------------------
cpu / ""     cpu      minimal
gpu          gpu      full
```

`minimal` builds an image that only ships ungated open-weights
models; `recommended` adds bitsandbytes for model quantization on
top of the minimal base; `full` builds the complete set including
vLLM, SGLang, and SAM-2 (requires `DEVICE=gpu`).

## Service set

```text
frontend         3000   React app served by nginx
backend          3001   Fastify
model-service    8000   FastAPI
postgres         5432   pgvector/pgvector:pg16
redis            6379   redis:7-alpine
otel-collector   4317   OTLP gRPC
                 4318   OTLP HTTP
                 8889   collector self-metrics
prometheus       9090   metrics
grafana          3002   dashboards
```

## Volumes

```text
postgres-data       /var/lib/postgresql/data
redis-data          /data
model-cache         /models   (HF cache)
./videos            /videos   (video storage)
./model-service/config  /config (models.yaml for GPU, models-cpu.yaml for the default CPU profile)
./wikibase/output   /wikibase (offline mode mapping)
```

## Health checks

Each service ships a healthcheck. The frontend depends on the
backend's `/api/health` endpoint reporting healthy before it
considers the stack ready. The backend depends on Postgres and
Redis healthchecks before starting, and waits for the
OpenTelemetry collector to start. The model service has no
`depends_on` and starts independently.

## Restart policy

Every service uses `restart: unless-stopped`. A crashed service
restarts automatically; a stopped service stays stopped.
