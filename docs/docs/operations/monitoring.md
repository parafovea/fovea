---
sidebar_label: Monitoring
---

# Monitoring

Fovea emits two streams of telemetry that an operator can wire
into a real observability stack: OpenTelemetry traces and
Prometheus-style metrics. Both are on by default. There is also
a JSON health endpoint for liveness checks.

## Health endpoint

`GET /api/health` on the backend returns 200 with
`{"status": "healthy", "timestamp": "<ISO-8601>"}` when the
process is up. The current handler is a liveness check only; it
does not probe Postgres or Redis, so a 200 here does not by
itself prove that dependencies are reachable. The frontend
container's nginx config proxies this endpoint, so the same URL
works through the public reverse proxy. Use it as the liveness
probe for whatever orchestrator runs the stack, and pair it
with database and Redis checks at the infrastructure layer for
true readiness.

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
`otel-collector-config.yaml` at the repo root to add an exporter and a
matching pipeline, then `docker compose restart otel-collector`.

Span names worth knowing:

- `summarize_video_with_vlm`, `summarize_video_external_api`,
  and `use_case.extract_claims` wrap the model service
  inference paths. Their durations are the single best signal
  for "are the models running."
- Backend HTTP request spans come from the OpenTelemetry
  Fastify and HTTP auto-instrumentation and follow the standard
  `{HTTP method} {route}` naming (for example
  `GET /api/videos/:id`). Custom domain spans on the backend
  use task-prefixed names such as `rbac.buildAbilities`,
  `rbac.authorize`, `sharing.fork`, and `video-access.resolve`.
- BullMQ activity is not span-traced today; watch the
  `queue.job.submitted` counter and `queue.job.duration`
  histogram defined in `server/src/metrics.ts` for throughput
  and latency. Rising durations or long gaps in submissions
  indicate worker starvation or model-service backpressure.

## Metrics

The backend exposes counters and histograms via its OTLP
exporter; the instrument names below are the OpenTelemetry
names declared in `server/src/metrics.ts`. When exported to
Prometheus, dots become underscores and counters gain a
`_total` suffix (so `api.requests` surfaces as
`api_requests_total`). The high-signal ones for operators are:

| Metric                       | What it measures                                                |
| ---------------------------- | --------------------------------------------------------------- |
| `api.request.duration`       | Per-route request latency histogram (unit: ms)                  |
| `api.requests`               | Per-route 2xx vs 4xx vs 5xx counter                             |
| `fovea.rbac.check.duration`  | Per-permission RBAC evaluation latency (unit: ms)               |
| `queue.job.duration`         | Per-queue (`video-summarization`, `claim-extraction`, etc.) job timing |
| `queue.job.submitted`        | Per-queue success vs failure counter (emitted on completed/failed events with a `status` attribute) |
| `model.service.duration`     | End-to-end latency of backend-to-model-service calls (unit: ms) |
| `model.service.requests`     | Backend-to-model-service request counter                        |

The model service emits the OTel resource metric set plus
process metrics through `opentelemetry.instrumentation.fastapi`.
No application-defined counters yet; the route timings come
from the FastAPI instrumentation.

## What to alert on

A minimal alert set that catches the failures operators have
actually hit:

- `api.requests{status="5xx"}` rate above zero for more than
  one minute. The backend should rarely 500; sustained 5xx
  almost always means Postgres or the model service is down.
- `queue.job.duration` p99 above the matching ceiling in
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
  utilization. Use `nvidia-smi` or DCGM on the host instead.
- Storage utilization per user or project. Total disk free is
  the only signal; per-tenant quotas are not enforced.
