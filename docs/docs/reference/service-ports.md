# Service ports

The default `docker compose up` stack publishes these ports on
the host. Confirmed against `docker-compose.yml`.

```text
3000   frontend           nginx serving the React app
3001   backend            Fastify API and /api/* routes
8000   model-service      FastAPI inference service
5432   postgres           pgvector/pgvector:pg16
6379   redis              BullMQ + session cache
4317   otel-collector     OTLP gRPC ingestion
4318   otel-collector     OTLP HTTP ingestion
8889   otel-collector     Prometheus self-metrics scrape
9090   prometheus         metrics database and UI
3010   grafana            dashboard UI
```

The collector self-metrics port (`8889`) is what Prometheus
scrapes; application metrics flow through OTLP to the collector
and are forwarded to Prometheus from there.

The frontend reverse-proxies `/api/*` to the backend in the
production image, so a browser pointed at `:3000` does not need
to know about port 3001.
