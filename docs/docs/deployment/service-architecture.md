---
sidebar_position: 8
title: Service Architecture
description: Service dependencies, startup order, and inter-service communication
keywords: [architecture, services, docker, dependencies, networking]
---

# Service Architecture

FOVEA consists of multiple interconnected services running in Docker containers. This page describes the service architecture, dependencies, and communication patterns.

## Service Dependency Diagram

```mermaid
graph TD
    A[Docker Network] --> B[PostgreSQL]
    A --> C[Redis]
    A --> D[OTEL Collector]

    B --> E[Backend]
    C --> E
    D --> E

    E --> F[Frontend]
    E --> G[Model Service]

    C --> G
    D --> G

    D --> H[Prometheus]
    H --> I[Grafana]
```

## Services Overview

| Service | Purpose | Port | Dependencies |
|---------|---------|------|--------------|
| **frontend** | React application | 5173 | backend |
| **backend** | API server | 3001 | postgres, redis, otel-collector |
| **model-service** | AI inference (CPU) | 8000 | redis, otel-collector |
| **model-service-gpu** | AI inference (GPU) | 8000 | redis, otel-collector |
| **postgres** | Database | 5432 | None |
| **redis** | Cache and queue | 6379 | None |
| **otel-collector** | Telemetry collection | 4317, 4318, 8889 | None |
| **prometheus** | Metrics storage | 9090 | otel-collector |
| **grafana** | Dashboards | 3002 | prometheus |

## Startup Order

Services start in this order to ensure dependencies are ready:

1. **PostgreSQL** (database must be ready first)
2. **Redis** (cache and queue)
3. **OTEL Collector** (observability)
4. **Backend** (waits for database to be healthy)
5. **Model Service** (waits for Redis)
6. **Frontend** (waits for backend)
7. **Prometheus** (scrapes metrics)
8. **Grafana** (visualizes metrics)

Docker Compose handles startup order automatically with `depends_on` and health checks.

## Service Details

### Frontend

**Technology**: React 18 + TypeScript + Vite

**Purpose**: User interface for video annotation

**Dependencies**:
- Backend API for data and authentication
- Direct video access via backend proxy

**Container**: nginx serving static files

**Health Check**: HTTP 200 on root path

### Backend

**Technology**: Node.js 22 + Fastify 5 + TypeScript

**Purpose**: API server, business logic, and data access

**Dependencies**:
- PostgreSQL for persistent storage
- Redis for job queues and caching
- Model service for AI inference
- OTEL Collector for telemetry

**Health Check**: GET /health returns 200

**Key Endpoints**:
- `/api/videos` - Video management
- `/api/personas` - Persona CRUD
- `/api/annotations` - Annotation operations
- `/api/ontology` - Ontology management
- `/admin/queues` - Bull Board UI

### Model Service

**Technology**: Python 3.12 + FastAPI + PyTorch

**Purpose**: AI model inference for video analysis

**Dependencies**:
- Redis for job coordination
- OTEL Collector for telemetry

**Variants**:
- `model-service` (CPU mode)
- `model-service-gpu` (GPU mode with CUDA)

**Health Check**: GET /health returns device info

**Key Endpoints**:
- `/api/summarize` - Video summarization
- `/api/augment` - Ontology augmentation
- `/api/detect` - Object detection
- `/api/track` - Object tracking

### PostgreSQL

**Technology**: PostgreSQL 16 with pgvector extension

**Purpose**: Persistent data storage

**Health Check**: pg_isready command

**Data Stored**:
- Personas and ontologies
- World objects (entities, events, etc.)
- Annotations
- Video metadata
- Video summaries with embeddings

### Redis

**Technology**: Redis 7

**Purpose**: Job queues and caching

**Health Check**: redis-cli ping

**Usage**:
- BullMQ job queues for AI tasks
- Session storage
- API response caching

**Queues**:
- `video-summarization` - VLM inference
- `ontology-augmentation` - LLM inference
- `object-detection` - Detection jobs
- `object-tracking` - Tracking jobs

### OTEL Collector

**Technology**: OpenTelemetry Collector

**Purpose**: Collect and export telemetry data

**Ports**:
- 4317 (gRPC)
- 4318 (HTTP)
- 8889 (Prometheus exporter)

**Pipeline**:
1. Receives traces and metrics from services
2. Processes and batches data
3. Exports to Prometheus
4. Logs to console (debug)

### Prometheus

**Technology**: Prometheus

**Purpose**: Time-series metrics storage

**Port**: 9090

**Scrape Targets**:
- OTEL Collector (every 15s)

**Storage**:
- Default retention: 15 days
- Persistent volume for data

### Grafana

**Technology**: Grafana

**Purpose**: Metrics visualization

**Port**: 3002

**Data Sources**:
- Prometheus (preconfigured)

**Dashboards**:
- Auto-provisioned from `grafana-dashboards/`

## Inter-Service Communication

### Frontend → Backend

**Protocol**: HTTP REST API

**Connection**: `http://backend:3001` (internal) or `http://localhost:3001` (external)

**Authentication**: Session-based (future: JWT)

### Backend → PostgreSQL

**Protocol**: PostgreSQL wire protocol

**Connection**: Prisma ORM client

**Connection String**: `postgresql://user:pass@postgres:5432/fovea`

**Connection Pool**: 10 connections default

### Backend → Redis

**Protocol**: Redis protocol

**Connection**: BullMQ client

**Usage**:
- Job submission
- Job status polling
- Queue monitoring

### Backend → Model Service

**Protocol**: HTTP REST API (via BullMQ worker)

**Connection**: Indirect through Redis job queue

**Flow**:
1. Backend submits job to Redis
2. Model service worker pulls job
3. Model service processes and updates job
4. Backend polls job status

### All Services → OTEL Collector

**Protocol**: OTLP (OpenTelemetry Protocol)

**Connection**: HTTP or gRPC

**Data Sent**:
- Distributed traces
- Custom metrics
- Auto-instrumented metrics

### OTEL Collector → Prometheus

**Protocol**: Prometheus scrape (HTTP)

**Connection**: Prometheus pulls from OTEL Collector

**Endpoint**: `http://otel-collector:8889/metrics`

### Grafana → Prometheus

**Protocol**: Prometheus query API

**Connection**: `http://prometheus:9090`

**Queries**: PromQL for metrics and graphs

## Networking

### Docker Network

All services run on `fovea-network` (bridge network).

**Features**:
- Service name DNS resolution
- Isolated from host network
- Internal communication without exposing ports

### Port Mapping

Ports exposed to host:

| Service | Internal Port | External Port |
|---------|---------------|---------------|
| Frontend | 3000 (nginx) | 3000 |
| Backend | 3001 | 3001 |
| Model Service | 8000 | 8000 |
| PostgreSQL | 5432 | 5432 |
| Redis | 6379 | 6379 |
| Prometheus | 9090 | 9090 |
| Grafana | 3000 | 3002 |
| OTEL (gRPC) | 4317 | 4317 |
| OTEL (HTTP) | 4318 | 4318 |

### Internal vs External Access

**Internal** (service-to-service):
- Use service names (e.g., `http://backend:3001`)
- No port conflicts
- Not accessible from host

**External** (host-to-service):
- Use localhost with mapped port (e.g., `http://localhost:3001`)
- Accessible in browser
- Must not conflict with host ports

## Volumes

### Data Volumes

| Volume | Purpose | Size | Persistence |
|--------|---------|------|-------------|
| `postgres-data` | Database files | Variable | Critical |
| `redis-data` | Queue persistence | Less than 1GB | Important |
| `model-cache` | HuggingFace models | 10-100GB | Can recreate |
| `video-data` | Video files | Variable | Critical |
| `prometheus-data` | Metrics storage | Less than 10GB | Can recreate |
| `grafana-data` | Dashboard config | Less than 100MB | Can recreate |

### Backup Priority

**Critical** (must back up):
- `postgres-data` - All application data
- `video-data` - Video files

**Important** (should back up):
- `redis-data` - Job queue state
- `.env` file - Configuration

**Recreatable** (no backup needed):
- `model-cache` - Downloads automatically
- `prometheus-data` - Historical metrics only
- `grafana-data` - Auto-provisioned

## Health Checks

All services include health checks:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

**Health Check Intervals**:
- Frontend: 30s
- Backend: 30s (40s start period)
- Model Service: 30s (60s start period)
- PostgreSQL: 10s
- Redis: 10s

**Check Health Manually**:

```bash
docker compose ps
```

Shows health status for each service.

## Scaling Considerations

### Horizontal Scaling

**Stateless services** (can scale):
- Frontend (with load balancer)
- Model Service (multiple workers)

**Stateful services** (should not scale):
- Backend (without session persistence)
- PostgreSQL (use replication instead)
- Redis (use cluster mode instead)

### Resource Limits

Set in `docker-compose.yml`:

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 8G
    reservations:
      memory: 4G
```

## Security

### Network Isolation

- Services isolated in Docker network
- Only necessary ports exposed to host
- Internal services (postgres, redis) not accessible externally

### Secrets Management

**Development**: Environment variables in `.env`

**Production**: Use Docker secrets or external secret manager

```yaml
secrets:
  db_password:
    external: true

services:
  backend:
    secrets:
      - db_password
```

## Next Steps

- **[Configuration](./configuration.md)**: Configure services
- **[Common Tasks](../operations/common-tasks.md)**: Daily operations
- **[Monitoring](../operations/monitoring/overview.md)**: Set up observability
- **[Troubleshooting](../operations/troubleshooting/common-issues.md)**: Resolve issues
