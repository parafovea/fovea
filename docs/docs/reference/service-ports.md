---
title: Service Ports
sidebar_position: 3
keywords: [ports, services, networking, localhost, URLs]
---

# Service Ports

Quick reference for all FOVEA service ports and URLs.

## Service Ports Table

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| Frontend | 5173 | http://localhost:5173 | React development server (Vite) |
| Backend | 3001 | http://localhost:3001 | REST API server (Fastify) |
| Model Service | 8000 | http://localhost:8000 | AI inference API (FastAPI) |
| PostgreSQL | 5432 | localhost:5432 | Database server |
| Redis | 6379 | localhost:6379 | Job queue and cache |
| Prometheus | 9090 | http://localhost:9090 | Metrics storage and queries |
| Grafana | 3002 | http://localhost:3002 | Metrics dashboards (admin/admin) |
| Bull Board | 3001 | http://localhost:3001/admin/queues | Job queue monitoring UI |
| OTEL Collector | 4318 | localhost:4318 | Telemetry ingestion (HTTP) |
| OTEL Collector | 4317 | localhost:4317 | Telemetry ingestion (gRPC) |

## Port Conflict Resolution

If a port is already in use on your system, modify it in `docker-compose.yml`:

```yaml
services:
  frontend:
    ports:
      - "3000:5173"  # Change host port from 5173 to 3000
```

**Format**: `"HOST_PORT:CONTAINER_PORT"`

**Example**: To change frontend from port 5173 to port 3000, use `"3000:5173"`.

## Service Access

### Frontend (Port 5173)

The main web application interface.

```
http://localhost:5173
```

Access this URL in your browser after running `docker compose up` or `cd annotation-tool && npm run dev`.

### Backend API (Port 3001)

REST API for data operations.

```
http://localhost:3001/api
```

**Example endpoints**:
- `GET /api/videos`: List videos
- `POST /api/annotations`: Create annotation
- `GET /api/personas`: List personas

### Model Service (Port 8000)

AI inference API with FastAPI docs.

```
http://localhost:8000/docs
```

Opens interactive API documentation (Swagger UI).

**Example endpoints**:
- `POST /summarize`: Generate video summary
- `POST /detect`: Run object detection
- `POST /track`: Run object tracking

### Grafana Dashboards (Port 3002)

Metrics visualization and monitoring.

```
http://localhost:3002
```

**Login**:
- Username: `admin`
- Password: `admin`

### Bull Board (Port 3001)

Job queue monitoring interface.

```
http://localhost:3001/admin/queues
```

Shows status of tracking jobs, summarization jobs, and other background tasks.

### Prometheus (Port 9090)

Metrics storage and query interface.

```
http://localhost:9090
```

Query metrics directly using PromQL.

## Port Usage by Profile

### Default (CPU Mode)

All services except model-service run on their default ports:
- Frontend: 5173
- Backend: 3001
- PostgreSQL: 5432
- Redis: 6379
- Grafana: 3002
- Prometheus: 9090
- OTEL Collector: 4317, 4318

Model service runs on port 8000 in CPU mode.

### GPU Profile

All services run on the same ports as CPU mode. GPU profile only affects device allocation, not port assignments.

## Firewall Configuration

If running FOVEA on a server, allow these ports through your firewall:

**Required (external access)**:
```bash
sudo ufw allow 5173/tcp  # Frontend
sudo ufw allow 3001/tcp  # Backend API
```

**Optional (monitoring access)**:
```bash
sudo ufw allow 3002/tcp  # Grafana
sudo ufw allow 9090/tcp  # Prometheus
```

**Internal only (no external access needed)**:
- PostgreSQL: 5432
- Redis: 6379
- Model Service: 8000 (accessed via backend)
- OTEL Collector: 4317, 4318

## Troubleshooting

### Port Already in Use

**Error**: `Error starting userland proxy: listen tcp 0.0.0.0:5173: bind: address already in use`

**Solution**:
1. Find the process using the port:
   ```bash
   lsof -i :5173
   ```
2. Kill the process or change FOVEA's port in `docker-compose.yml`

### Cannot Connect to Service

**Problem**: Browser shows "connection refused" or "unable to connect"

**Solutions**:
- Verify service is running: `docker compose ps`
- Check logs: `docker compose logs [service-name]`
- Ensure correct port number in URL
- Check firewall rules

### Service Started but Not Accessible

**Problem**: Docker container runs but service unreachable

**Solutions**:
- Check port mapping: `docker compose ps` shows port bindings
- Verify container health: `docker compose logs [service-name]`
- Test with curl: `curl http://localhost:3001/api/videos`

## Next Steps

- Explore [Architecture](../concepts/architecture.md) for service interaction details
- Learn about [Environment Variables](./environment-variables.md) for configuration
