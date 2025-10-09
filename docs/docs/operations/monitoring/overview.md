---
sidebar_position: 1
title: Monitoring Overview
description: Overview of FOVEA observability stack with OpenTelemetry, Prometheus, and Grafana
keywords: [monitoring, observability, prometheus, grafana, metrics, tracing]
---

# Monitoring Overview

FOVEA includes a complete observability stack for monitoring application health, performance, and behavior.

## Quick Start

When running with Docker Compose, access these monitoring interfaces:

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

## Observability Stack Components

### OpenTelemetry Collector

Receives, processes, and exports telemetry data from all services.

**Ports**:
- 4317 (gRPC)
- 4318 (HTTP)
- 8889 (Prometheus exporter)

**Function**:
- Collects traces and metrics from services
- Processes and batches data
- Exports to Prometheus
- Logs telemetry to console (debug mode)

### Prometheus

Time-series metrics storage and querying.

**Port**: 9090

**Function**:
- Scrapes metrics from OTEL Collector (every 15s)
- Stores time-series data (15 day retention default)
- Provides PromQL query interface
- Serves data to Grafana

### Grafana

Metrics visualization and dashboards.

**Port**: 3002

**Function**:
- Visualizes Prometheus metrics
- Auto-provisioned dashboards
- Alert configuration
- Dashboard customization

### Bull Board

Job queue monitoring interface.

**URL**: http://localhost:3001/admin/queues

**Function**:
- Monitor BullMQ queues
- View job status (pending, active, completed, failed)
- Inspect job details and errors
- Retry failed jobs

## What is Monitored

### API Performance

- Request rates by endpoint
- Request duration (p50, p95, p99)
- Error rates
- HTTP status codes

### Queue Health

- Job submission rates
- Job processing time
- Queue depth
- Job failures

### Model Service

- Inference duration by model
- Request rates by endpoint
- Device usage (CPU/GPU)
- Model loading times

### Database

- Query duration
- Active connections
- Connection pool usage

### System Resources

- CPU usage
- Memory usage
- Disk space
- Network I/O

## Architecture

```
Backend/Model Service → OTEL Collector → Prometheus ← Grafana
                                       ↘ Debug logs
```

1. Application services export traces and metrics via OpenTelemetry SDK
2. OTEL Collector receives data on ports 4317 (gRPC) and 4318 (HTTP)
3. OTEL Collector exports to Prometheus exporter (port 8889)
4. Prometheus scrapes metrics from OTEL Collector
5. Grafana queries Prometheus for visualization

## Accessing Monitoring Data

### View Metrics in Prometheus

1. Open http://localhost:9090
2. Use the query interface to explore metrics
3. Example query: `rate(fovea_api_requests_total[5m])`

### View Dashboards in Grafana

1. Open http://localhost:3002
2. Login with admin/admin
3. Navigate to Dashboards → Browse
4. Dashboards are auto-provisioned from `grafana-dashboards/`

### Monitor Job Queues

1. Open http://localhost:3001/admin/queues
2. View active queues (video-summarization, ontology-augmentation, etc.)
3. Inspect individual jobs
4. Retry failed jobs if needed

## Metrics Naming Convention

All custom metrics use the `fovea_` prefix:

- `fovea_api_*` - API metrics
- `fovea_queue_*` - Queue metrics
- `fovea_model_*` - Model service metrics
- `fovea_db_*` - Database metrics

See [Metrics Reference](./metrics-reference.md) for complete list.

## Key Performance Indicators

### API Health

**Metric**: `fovea_api_requests_total`

**What to watch**:
- Error rate > 1% (investigate errors)
- Request rate anomalies (sudden spikes or drops)

### API Latency

**Metric**: `fovea_api_request_duration_milliseconds`

**What to watch**:
- p95 latency > 1s (slow endpoints)
- p99 latency > 5s (outliers)

### Queue Processing

**Metric**: `fovea_queue_job_submitted`

**What to watch**:
- Job failure rate > 5% (model issues)
- Queue depth increasing (backlog building)

### Model Service Performance

**Metric**: `fovea_model_service_requests`

**What to watch**:
- Inference duration > 60s (slow models)
- Error rate > 1% (model loading issues)

## Distributed Tracing

Traces are exported to OTEL Collector and logged to console. Each request includes trace context in logs:

```json
{
  "level": 30,
  "trace_id": "88901d2b18cf36affcebf0d963b3570f",
  "span_id": "dacf8152c7b654f8",
  "trace_flags": "01",
  "msg": "request completed"
}
```

Trace context propagates across:
- HTTP requests (W3C Trace Context headers)
- Internal async operations
- Database calls (Prisma)
- Redis queue operations

## Configuration

### Adjust Metric Export Interval

Edit backend `server/src/tracing.ts`:

```typescript
metricReader: new PeriodicExportingMetricReader({
  exporter: new OTLPMetricExporter({
    url: metricUrl
  }),
  exportIntervalMillis: 60000  // Default: 60s
})
```

### Adjust Prometheus Scrape Interval

Edit `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'otel-collector'
    scrape_interval: 15s  # Default: 15s
    static_configs:
      - targets: ['otel-collector:8889']
```

### Disable Telemetry

For development, disable OTEL:

```env
OTEL_SDK_DISABLED=true
```

## Next Steps

- **[Grafana Dashboards](./grafana-dashboards.md)**: Using dashboards
- **[Metrics Reference](./metrics-reference.md)**: Complete metrics catalog
- **[Common Tasks](../common-tasks.md)**: Daily operations
