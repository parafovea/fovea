# Observability

Use the OpenTelemetry collector, Prometheus, and Grafana
dashboards bundled in `docker-compose.yml` to inspect the running
stack.

## OpenTelemetry collector

`docker-compose.yml` runs `otel/opentelemetry-collector-contrib`
configured by `otel-collector-config.yaml` at the repo root. The
collector accepts:

```text
4317   OTLP gRPC
4318   OTLP HTTP
8889   Prometheus metrics scrape endpoint (collector self-metrics)
```

The backend and the model service both ship traces and metrics to
the collector via `OTEL_EXPORTER_OTLP_ENDPOINT`.

## Model service spans and metrics

Use cases in `model-service/src/application/use_cases/` wrap
their work in OpenTelemetry spans. Span names follow per-method
snake_case conventions; both `<name>_use_case` (for example
`detect_objects_use_case`, `track_objects_use_case`) and
`use_case.<name>` (for example `use_case.extract_claims`,
`use_case.synthesize_summary`) are in use. Some use cases emit
multiple variant spans rather than a single span per class; for
example `use_case.augment_ontology.local` and `.external`,
`use_case.fuse_modalities.sequential` / `.timestamp_aligned` /
`.native_multimodal` / `.hybrid`, and `summarize_video_with_vlm`
alongside `summarize_video_external_api`. Span attributes carry
the request DTO's identifying fields (video id, persona id, model
id where applicable).

Outbound adapters in
`model-service/src/infrastructure/adapters/outbound/` record
inference metrics through the `record_inference` helper in
`infrastructure/observability/telemetry.py`:

```text
counter       model.inference.count    (monotonic; "Number of model inference calls")
histogram     model.inference.duration (unit s; model inference duration in seconds)
labels        task, model
counter-only  result (success | error)
```

The counter carries `task`, `model`, and `result`; the duration
histogram carries `task` and `model` only. The metrics surface in
Prometheus through the OTel collector's `:8889` exporter. The
bundled Grafana dashboards (error and RBAC) do not visualize
these metrics yet; query them directly through Prometheus.

## Prometheus

Prometheus runs at `:9090` with `prometheus.yml` from the repo
root. Scrape targets include the OTel collector's
metrics exporter on `:8889`. Alert rules are defined in
`prometheus-alerts.yml`.

## Grafana

Grafana runs at `:3002`. Dashboards live in `grafana-dashboards/`
in the repo root.

## Frontend telemetry

The frontend posts batched traces to `POST /api/telemetry/traces`,
which the backend forwards to the collector. This is the only way
client-side spans reach the trace pipeline; direct OTLP from the
browser is not used.

## Logs

Each service uses Pino-style structured JSON for the backend,
Python `logging` for the model service, and console for the
frontend. There is no centralized log aggregator in the default
stack; pipe `docker compose logs -f <service>` or attach a
sidecar.
