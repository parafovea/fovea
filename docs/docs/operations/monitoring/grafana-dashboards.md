---
sidebar_position: 2
title: Grafana Dashboards
description: Using Grafana dashboards for FOVEA monitoring and visualization
keywords: [grafana, dashboards, visualization, monitoring, alerts]
---

# Grafana Dashboards

Grafana provides visualization and analysis of FOVEA metrics. Dashboards are auto-provisioned from the `grafana-dashboards/` directory.

## Accessing Grafana

1. Open http://localhost:3002
2. Login with username `admin` and password `admin`
3. Change password on first login (production deployments)
4. Navigate to Dashboards → Browse

## Dashboard Overview

### System Overview Dashboard

Displays overall system health and status.

**Panels**:
- Service health status
- Request rates across all services
- Error rates
- Resource usage summary

**Use for**:
- Quick health check
- Identifying service issues
- Monitoring overall load

### API Performance Dashboard

Tracks backend API performance metrics.

**Panels**:
- Request duration (p50, p95, p99)
- Requests per second by endpoint
- Error rate by endpoint
- Slow query detection

**Key Metrics**:
- API latency trends
- Endpoint-specific performance
- Error patterns

**Use for**:
- Identifying slow endpoints
- Monitoring API health
- Detecting performance regressions

### Model Service Dashboard

Monitors AI inference performance.

**Panels**:
- Inference duration by model
- GPU utilization (if applicable)
- Queue depth for inference jobs
- Model loading times

**Key Metrics**:
- Model performance
- Resource usage
- Queue backlog

**Use for**:
- Monitoring inference performance
- Detecting model issues
- GPU utilization tracking

### Database Dashboard

Tracks database performance and health.

**Panels**:
- Connection pool usage
- Query duration
- Active connections
- Table sizes (if configured)

**Key Metrics**:
- Database latency
- Connection pool health
- Query performance

**Use for**:
- Identifying slow queries
- Monitoring connection usage
- Detecting database issues

## Key Metrics to Watch

### Critical Thresholds

**API Latency**:
- p95 > 1s: Investigate slow endpoints
- p99 > 5s: Critical performance issue

**Error Rate**:
- > 1%: Check logs for errors
- Sudden spikes: Possible service failure

**GPU Memory** (GPU mode):
- > 90%: Risk of CUDA out of memory
- Consider reducing batch sizes

**Database Connections**:
- > 80% of pool: Increase pool size or investigate leaks
- Connection timeouts: Database overload

## Interpreting Metrics

### Request Rate

**Normal Pattern**:
- Steady during work hours
- Low during off hours
- Gradual changes

**Anomalies**:
- Sudden spikes: Possible bot or attack
- Sudden drops: Service unavailable or upstream issue
- Oscillating: Request retry storms

### Latency

**Normal Pattern**:
- Consistent p50 and p95
- P99 higher but stable
- Slight variations acceptable

**Anomalies**:
- Increasing trend: Resource exhaustion
- Sudden spikes: Slow query or external dependency
- High variance: Inconsistent performance

### Error Rate

**Normal Pattern**:
- Near zero for healthy service
- Occasional 4xx errors acceptable (client errors)

**Anomalies**:
- Increasing 5xx errors: Service issues
- Sudden 5xx spike: Service failure or deployment issue
- High 4xx rate: API misuse or client bugs

## Creating Custom Dashboards

### Add New Dashboard

1. Navigate to Dashboards → New → New Dashboard
2. Click "Add visualization"
3. Select Prometheus data source
4. Enter PromQL query
5. Configure visualization type
6. Save dashboard

### Example PromQL Queries

**API request rate**:
```promql
rate(fovea_api_requests_total[5m])
```

**API latency p95**:
```promql
histogram_quantile(0.95, rate(fovea_api_request_duration_milliseconds_bucket[5m]))
```

**Error rate percentage**:
```promql
100 * (
  rate(fovea_api_requests_total{status=~"5.."}[5m])
  /
  rate(fovea_api_requests_total[5m])
)
```

**Job processing rate**:
```promql
rate(fovea_queue_job_submitted{status="completed"}[5m])
```

**Job failure rate**:
```promql
rate(fovea_queue_job_submitted{status="failed"}[5m])
```

**Average job duration**:
```promql
rate(fovea_queue_job_duration_sum[5m]) / rate(fovea_queue_job_duration_count[5m])
```

## Setting Up Alerts

### Create Alert Rule

1. Open dashboard panel
2. Click panel title → Edit
3. Go to Alert tab
4. Click "Create alert rule from this panel"
5. Configure conditions and thresholds
6. Set notification channels

### Example Alert: High Error Rate

**Condition**:
```promql
rate(fovea_api_requests_total{status=~"5.."}[5m]) > 0.05
```

**For**: 5 minutes

**Annotations**:
- Summary: "High error rate detected"
- Description: "Error rate exceeds 5% for 5 minutes"

### Example Alert: High Latency

**Condition**:
```promql
histogram_quantile(0.95, rate(fovea_api_request_duration_milliseconds_bucket[5m])) > 1000
```

**For**: 10 minutes

**Annotations**:
- Summary: "High API latency"
- Description: "P95 latency exceeds 1 second"

### Example Alert: GPU Memory

**Condition** (GPU mode):
```promql
fovea_model_gpu_memory_bytes / fovea_model_gpu_memory_total_bytes * 100 > 90
```

**For**: 5 minutes

**Annotations**:
- Summary: "High GPU memory usage"
- Description: "GPU memory usage exceeds 90%"

## Notification Channels

### Configure Email Notifications

1. Navigate to Alerting → Notification channels
2. Click "Add channel"
3. Select "Email"
4. Enter recipient email addresses
5. Test notification
6. Save

### Configure Slack Notifications

1. Create Slack incoming webhook
2. Add notification channel in Grafana
3. Select "Slack"
4. Enter webhook URL
5. Configure channel and mention settings
6. Test and save

## Dashboard Management

### Export Dashboard

1. Open dashboard
2. Click settings icon (gear)
3. Select "JSON Model"
4. Copy JSON
5. Save to file or share

### Import Dashboard

1. Navigate to Dashboards → Import
2. Paste JSON or upload file
3. Select data source
4. Click Import

### Auto-Provisioning

Dashboards in `grafana-dashboards/` directory are auto-provisioned on startup.

To add permanent dashboard:
1. Create JSON file in `grafana-dashboards/`
2. Restart Grafana: `docker compose restart grafana`
3. Dashboard appears automatically

## Best Practices

### Dashboard Organization

- Use folders to organize dashboards by service
- Name dashboards descriptively
- Add descriptions to panels
- Use consistent color schemes

### Query Optimization

- Use appropriate time ranges
- Limit number of series
- Use recording rules for complex queries
- Cache expensive queries

### Alert Configuration

- Set appropriate thresholds
- Use "For" duration to avoid flapping
- Group related alerts
- Test alerts before deploying

### Regular Maintenance

- Review dashboard relevance
- Update queries as system changes
- Clean up unused dashboards
- Update alert thresholds based on baselines

## Troubleshooting

### Dashboard Not Loading

**Check**:
- Prometheus is running: `docker compose ps prometheus`
- Data source configured: Alerting → Data sources
- Time range includes data

### No Data in Panels

**Check**:
- Services are exporting metrics
- OTEL Collector is running
- Prometheus is scraping successfully
- Query syntax is correct

### Alerts Not Firing

**Check**:
- Alert rule is enabled
- Condition threshold is correct
- Evaluation interval is appropriate
- Notification channel is configured

## Next Steps

- **[Metrics Reference](./metrics-reference.md)**: Complete metrics catalog
- **[Overview](./overview.md)**: Monitoring stack overview
- **[Common Tasks](../common-tasks.md)**: Daily operations
