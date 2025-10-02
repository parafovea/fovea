# Observability Guide

This guide covers the observability stack integrated into the fovea application, including distributed tracing, metrics collection, and monitoring dashboards.

## Overview

The application uses a complete observability stack:

- **OpenTelemetry**: Distributed tracing and metrics collection
- **OpenTelemetry Collector**: Receives, processes, and exports telemetry data
- **Prometheus**: Time-series metrics storage and querying
- **Grafana**: Visualization dashboards
- **Bull Board**: Queue job monitoring

All services are automatically instrumented and export telemetry data when running via Docker Compose.

## Architecture

```
Backend/Model Service → OTEL Collector → Prometheus ← Grafana
                                       ↘ Debug logs
```

1. **Application services** (backend, model-service) export traces and metrics via OpenTelemetry SDK
2. **OTEL Collector** receives data on ports 4317 (gRPC) and 4318 (HTTP)
3. **Prometheus** scrapes metrics from OTEL Collector's Prometheus exporter (port 8889)
4. **Grafana** queries Prometheus for visualization

## Quick Start

### Access Monitoring Dashboards

When running with Docker Compose, access:

- **Grafana**: http://localhost:3002
  - Username: `admin`
  - Password: `admin`
  - Pre-configured with Prometheus data source

- **Prometheus**: http://localhost:9090
  - Query metrics directly
  - View targets and scrape status

- **Bull Board** (Queue Monitoring): http://localhost:3001/admin/queues
  - Monitor video summarization jobs
  - View job progress, failures, and retries

### View Metrics

#### OTEL Collector Metrics Endpoint
Raw metrics from the OTEL Collector:
```bash
curl http://localhost:8889/metrics
```

#### Prometheus Query Examples

Query the Prometheus API:

```bash
# Total API requests by route
curl -s "http://localhost:9090/api/v1/query?query=fovea_api_requests_total"

# Average request duration (last 5 minutes)
curl -s "http://localhost:9090/api/v1/query?query=rate(fovea_api_request_duration_milliseconds_sum[5m])/rate(fovea_api_request_duration_milliseconds_count[5m])"

# Queue job processing rate
curl -s "http://localhost:9090/api/v1/query?query=rate(fovea_queue_job_submitted[5m])"
```

## Available Metrics

All custom metrics have the `fovea_` prefix:

### API Metrics

**`fovea_api_requests_total`** (Counter)
- Total number of API requests
- Labels: `method`, `route`, `status`
- Example: `fovea_api_requests_total{method="GET",route="/api/videos",status="200"}`

**`fovea_api_request_duration_milliseconds`** (Histogram)
- Request duration in milliseconds
- Labels: `method`, `route`, `status`
- Buckets: 0, 5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500, 5000, 7500, 10000, +Inf
- Example: `fovea_api_request_duration_milliseconds_sum{method="GET",route="/api/videos",status="200"}`

### Queue Metrics

**`fovea_queue_job_submitted`** (Counter)
- Number of jobs submitted to queues
- Labels: `queue`, `status` (completed, failed)
- Example: `fovea_queue_job_submitted{queue="video-summarization",status="completed"}`

**`fovea_queue_job_duration`** (Histogram)
- Job processing duration in milliseconds
- Labels: `queue`, `status`
- Example: `fovea_queue_job_duration{queue="video-summarization",status="completed"}`

### Model Service Metrics

**`fovea_model_service_requests`** (Counter)
- Number of requests to model service
- Labels: `endpoint`, `status`
- Example: `fovea_model_service_requests{endpoint="/api/summarize",status="200"}`

**`fovea_model_service_duration`** (Histogram)
- Model service response time in milliseconds
- Labels: `endpoint`, `status`
- Example: `fovea_model_service_duration{endpoint="/api/summarize",status="200"}`

### Auto-Instrumented Metrics

The OpenTelemetry auto-instrumentation also provides:

**`fovea_http_server_duration_milliseconds`**
- Inbound HTTP request duration
- Labels: `http_method`, `http_route`, `http_status_code`

**`fovea_http_client_duration_milliseconds`**
- Outbound HTTP request duration
- Labels: `http_method`, `http_status_code`, `net_peer_name`, `net_peer_port`

**`fovea_db_query_count`** (Counter)
- Database query counter (when instrumentation is enabled)
- Labels: `operation`, `table`

**`fovea_db_query_duration`** (Histogram)
- Database query duration

## Distributed Tracing

### Viewing Traces

Traces are exported to the OTEL Collector and logged to console in debug mode. To see trace IDs in logs:

```bash
docker compose logs backend | grep trace_id
```

Example log entry with trace context:
```json
{
  "level": 30,
  "trace_id": "88901d2b18cf36affcebf0d963b3570f",
  "span_id": "dacf8152c7b654f8",
  "trace_flags": "01",
  "msg": "request completed"
}
```

### Trace Propagation

Trace context is automatically propagated across:
- HTTP requests (via W3C Trace Context headers)
- Internal async operations
- Database calls (Prisma)
- Redis queue operations

## Grafana Dashboards

### Creating Dashboards

1. Open Grafana at http://localhost:3002
2. Log in with `admin`/`admin`
3. Navigate to **Dashboards** → **New** → **New Dashboard**
4. Add panels with Prometheus queries

### Recommended Panels

#### API Performance Dashboard

**Request Rate**
```promql
rate(fovea_api_requests_total[5m])
```

**Latency Percentiles**
```promql
histogram_quantile(0.95, rate(fovea_api_request_duration_milliseconds_bucket[5m]))
histogram_quantile(0.99, rate(fovea_api_request_duration_milliseconds_bucket[5m]))
```

**Error Rate**
```promql
rate(fovea_api_requests_total{status=~"5.."}[5m])
```

#### Queue Health Dashboard

**Job Processing Rate**
```promql
rate(fovea_queue_job_submitted{status="completed"}[5m])
```

**Job Failure Rate**
```promql
rate(fovea_queue_job_submitted{status="failed"}[5m])
```

**Average Job Duration**
```promql
rate(fovea_queue_job_duration_sum[5m]) / rate(fovea_queue_job_duration_count[5m])
```

#### Model Service Dashboard

**Model Service Request Rate**
```promql
rate(fovea_model_service_requests[5m])
```

**Model Service Latency (p95)**
```promql
histogram_quantile(0.95, rate(fovea_model_service_duration_bucket[5m]))
```

## Configuration

### OpenTelemetry Configuration

The OTEL SDK is initialized in `server/src/tracing.ts`:

```typescript
// Configure service name and version
const resource = defaultResource().merge(
  resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'fovea-backend',
    [ATTR_SERVICE_VERSION]: '1.0.0'
  })
);

// Export interval (default: 60 seconds)
metricReader: new PeriodicExportingMetricReader({
  exporter: new OTLPMetricExporter({
    url: metricUrl
  }),
  exportIntervalMillis: 60000  // Adjust as needed
})
```

### OTEL Collector Configuration

Edit `otel-collector-config.yaml` to customize:

**Receivers** - How telemetry data enters the collector:
```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
```

**Processors** - Transform or sample data:
```yaml
processors:
  batch:
    timeout: 10s
    send_batch_size: 1024

  memory_limiter:
    check_interval: 1s
    limit_mib: 512
```

**Exporters** - Where data goes:
```yaml
exporters:
  prometheus:
    endpoint: "0.0.0.0:8889"
    namespace: fovea  # Prefix for metrics

  debug:
    verbosity: detailed  # Logs telemetry to console
```

**Pipelines** - Connect receivers to exporters:
```yaml
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [debug]

    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus, debug]
```

### Prometheus Configuration

Edit `prometheus.yml` for scrape configuration:

```yaml
scrape_configs:
  - job_name: 'otel-collector'
    scrape_interval: 15s
    static_configs:
      - targets: ['otel-collector:8889']
        labels:
          service: 'fovea'
```

## Adding Custom Metrics

### In Backend (Node.js/TypeScript)

Custom metrics are defined in `server/src/metrics.ts`:

```typescript
import { metrics } from '@opentelemetry/api'

const meter = metrics.getMeter('fovea-backend')

// Create a counter
export const myCounter = meter.createCounter('my.custom.counter', {
  description: 'Description of what this counts',
  unit: '1'
})

// Create a histogram
export const myHistogram = meter.createHistogram('my.custom.duration', {
  description: 'Duration of something',
  unit: 'ms'
})

// Usage
myCounter.add(1, { label: 'value' })
myHistogram.record(123, { label: 'value' })
```

### In Model Service (Python)

Add metrics to `model-service/src/metrics.py` (create if needed):

```python
from opentelemetry import metrics
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter

# Initialize meter
meter = metrics.get_meter("fovea-model-service")

# Create metrics
inference_counter = meter.create_counter(
    "model.inference.count",
    description="Number of model inferences"
)

inference_duration = meter.create_histogram(
    "model.inference.duration",
    unit="ms",
    description="Model inference latency"
)

# Usage
inference_counter.add(1, {"model": "llama", "status": "success"})
inference_duration.record(1234, {"model": "llama"})
```

## Troubleshooting

### No Metrics Appearing

1. **Check OTEL Collector is running**:
```bash
docker compose ps otel-collector
docker compose logs otel-collector --tail=50
```

2. **Verify metrics endpoint**:
```bash
curl http://localhost:8889/metrics | grep fovea
```

3. **Check Prometheus targets**:
- Visit http://localhost:9090/targets
- Ensure `otel-collector` target is UP

4. **Check backend is exporting**:
```bash
docker compose logs backend | grep -i otel
```

### Metrics Not Updating

- Metrics export interval is 60 seconds by default
- Wait at least 1 minute after generating traffic
- Generate some API requests to create metrics:
```bash
for i in {1..10}; do
  curl -s http://localhost:3001/api/videos > /dev/null
  curl -s http://localhost:3001/health > /dev/null
done
```

### High Memory Usage

Adjust OTEL Collector memory limits in `otel-collector-config.yaml`:

```yaml
processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 256  # Reduce from 512
```

### Missing Trace Context in Logs

Ensure OpenTelemetry is initialized **first** in `server/src/index.ts`:

```typescript
// MUST be first import
import './tracing.js'

// Then other imports
import { buildApp } from './app.js'
```

## Production Considerations

### Data Retention

**Prometheus** (default: 15 days):
```yaml
prometheus:
  command:
    - '--storage.tsdb.retention.time=30d'  # Increase retention
```

### Sampling

For high-traffic production, consider trace sampling in `tracing.ts`:

```typescript
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base'

const sdk = new NodeSDK({
  // Sample 10% of traces
  sampler: new TraceIdRatioBasedSampler(0.1),
  // ... rest of config
})
```

### External Exporters

To send data to external services (Datadog, New Relic, etc.), add exporters to `otel-collector-config.yaml`:

```yaml
exporters:
  otlp/datadog:
    endpoint: "https://api.datadoghq.com"
    headers:
      DD-API-KEY: "${DD_API_KEY}"

service:
  pipelines:
    traces:
      exporters: [debug, otlp/datadog]
```

### Security

For production deployments:

1. **Enable authentication** on Grafana (change default password)
2. **Restrict access** to monitoring ports (4317, 4318, 8889, 9090, 3002)
3. **Use TLS** for OTLP exports in production
4. **Implement RBAC** for Grafana dashboards

## Further Reading

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Prometheus Query Language (PromQL)](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Grafana Dashboard Best Practices](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/)
- [OTEL Collector Configuration](https://opentelemetry.io/docs/collector/configuration/)
