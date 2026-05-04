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

## Prometheus

Prometheus runs at `:9090` with `prometheus.yml` from the repo
root. Scrape targets include the OTel collector's
metrics exporter on `:8889`. Alert rules are defined in
`prometheus-alerts.yml`.

## Grafana

Grafana runs at `:3010`. Dashboards live in `grafana-dashboards/`
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
