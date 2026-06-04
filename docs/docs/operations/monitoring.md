---
sidebar_label: Monitoring
---

# Monitoring

Fovea emits two streams of telemetry that an operator can wire
into a real observability stack: OpenTelemetry traces and
Prometheus-style metrics. Both are on by default. There is also
a JSON health endpoint for liveness checks.

## Health endpoint

`GET /api/health` on the backend returns
`{"status": "ok", "db": "ok", "redis": "ok"}` when the process
is healthy and can reach Postgres and Redis. It returns 503 if
either dependency is unreachable. The frontend container's
nginx config proxies this endpoint, so the same URL works
through the public reverse proxy. Use it as the readiness probe
for whatever orchestrator runs the stack.

The model service exposes `GET /health` on its own port (8000)
that returns the loaded-model summary. It is on the private
network and not proxied through the frontend.

## Traces

Both the backend and the model service ship OpenTelemetry
spans to the OTLP HTTP endpoint configured by
`OTEL_EXPORTER_OTLP_ENDPOINT` (defaults to the bundled
`otel-collector` container at `http://otel-collector:4318`).
The `docker-compose.yml` includes the collector, but its
exporter config is intentionally minimal: by default it logs
spans and drops them. To send traces to a real backend (Jaeger,
Honeycomb, Datadog, Grafana Tempo), edit
`infra/otel-collector-config.yaml` to add an exporter and a
matching pipeline, then `docker compose restart otel-collector`.

Span names worth knowing:

- `use_case.summarize_video` and `use_case.extract_claims` wrap
  the model service inference paths. Their durations are the
  single best signal for "are the models running."
- `route.*` spans on the backend wrap each REST handler. Their
  child spans show RBAC checks, Prisma queries, and downstream
  model service calls.
- `queue.*` spans wrap BullMQ job lifecycle events. Long gaps
  between `enqueue` and `start` mean the worker is saturated.

## Metrics

The backend exposes Prometheus-format counters and histograms
on its OTLP exporter; the names live in `server/src/metrics.ts`.
The high-signal ones for operators are:

| Metric                       | What it measures                                                |
| ---------------------------- | --------------------------------------------------------------- |
| `api_request_duration_ms`    | Per-route request latency histogram                             |
| `api_request_count`          | Per-route 2xx vs 4xx vs 5xx counter                             |
| `rbac_check_duration_ms`     | Per-permission RBAC evaluation latency                          |
| `queue_job_duration_ms`      | Per-queue (`detection`, `summarize`, `claims`, etc.) job timing |
| `queue_job_count`            | Per-queue success vs failure counter                            |
| `model_service_request_ms`   | End-to-end latency of backend-to-model-service calls            |

The model service emits the OTel resource metric set plus
process metrics through `opentelemetry.instrumentation.fastapi`.
No application-defined counters yet; the route timings come
from the FastAPI instrumentation.

## What to alert on

A minimal alert set that catches the failures operators have
actually hit:

- `api_request_count{status="5xx"}` rate above zero for more
  than one minute. The backend should rarely 500; sustained 5xx
  almost always means Postgres or the model service is down.
- `queue_job_duration_ms` p99 above the matching ceiling in
  `MODEL_SERVICE_TIMEOUTS`. If jobs are taking longer than the
  HTTP client allows, the user sees a `MODEL_SERVICE_TIMEOUT`
  error toast.
- `up{job="backend"}` or `up{job="model-service"}` at zero.
  Standard liveness check; the health endpoints above feed this.
- Disk free on the `STORAGE_PATH` volume. Uploaded videos are
  the largest persistent payload by far; an install that does
  not prune old videos fills its disk in months.

## What is not instrumented

- Frontend page navigations and client-side errors. The
  React build does not ship with a JS error reporter; if you
  want one, add Sentry or LogRocket at the build step.
- Model VRAM and CPU. The model service does not export GPU
  utilisation. Use `nvidia-smi` or DCGM on the host instead.
- Storage utilisation per user or project. Total disk free is
  the only signal; per-tenant quotas are not enforced.
