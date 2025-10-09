---
title: Observability
sidebar_position: 6
---

# Observability

Fovea includes distributed tracing and metrics collection using OpenTelemetry.

## Components

- OpenTelemetry SDK for tracing and metrics
- OTEL Collector for telemetry aggregation
- Prometheus for time-series storage
- Grafana for visualization

## Accessing Dashboards

- Grafana: http://localhost:3002
- Bull Board (Queue Monitoring): http://localhost:3001/admin/queues

## Key Metrics

All metrics use the `fovea_` prefix. Common metrics include request counters, duration histograms, and queue job metrics.
