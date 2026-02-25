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

### Infrastructure Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `api.requests` | Counter | API requests by endpoint and status code |
| `api.request.duration` | Histogram | Request duration in milliseconds |
| `db.query.count` | Counter | Database query count |
| `db.query.duration` | Histogram | Database query duration |
| `cache.operations` | Counter | Cache operations (hit/miss/error) |
| `cache.operation.duration` | Histogram | Cache operation duration |
| `queue.job.submitted` | Counter | Queue job submissions by type |
| `queue.job.duration` | Histogram | Queue job processing duration |
| `model.service.requests` | Counter | Model service requests by operation |
| `model.service.duration` | Histogram | Model service response time |

### Business Metrics

| Metric | Type | Attributes | Description |
|--------|------|------------|-------------|
| `fovea.rbac.checks` | Counter | action, resource, result (allowed/denied), role | RBAC permission check outcomes |
| `fovea.rbac.check.duration` | Histogram | action, resource | Time spent evaluating permissions |
| `fovea.group.operations` | Counter | operation (create/update/delete/add_member/remove_member), status | Group management operations |
| `fovea.project.operations` | Counter | operation (create/update/delete/add_member/remove_member), status | Project management operations |
| `fovea.sharing.operations` | Counter | operation (share/revoke/fork), resourceType, targetType (user/group) | Resource sharing operations |
| `fovea.video_assignment.operations` | Counter | operation (assign/unassign/rule_evaluate), source (manual/rule) | Video assignment operations |
| `fovea.persona.operations` | Counter | operation (create/update/delete), status | Persona CRUD operations |

### Authentication Metrics

| Metric | Type | Attributes | Description |
|--------|------|------------|-------------|
| `auth.events` | Counter | event_type (login), success, failure_reason | Login attempts and outcomes |
| `session.events` | Counter | event_type (created/regenerated/expired/revoked/extended) | Session lifecycle events |
