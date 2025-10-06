---
title: Environment Variables
sidebar_position: 2
keywords: [environment variables, configuration, env, settings, docker]
---

# Environment Variables

Complete reference for environment variables used across FOVEA services.

## Environment Variables by Service

### Backend Service

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Node environment (development, production) |
| `PORT` | `3001` | Backend server port |
| `DATABASE_URL` | `postgresql://fovea:fovea@postgres:5432/fovea` | PostgreSQL connection string |
| `REDIS_URL` | `redis://redis:6379` | Redis connection string |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origins |
| `MODEL_SERVICE_URL` | `http://model-service:8000` | Model service endpoint |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://otel-collector:4318` | OpenTelemetry endpoint |

**Example** (in docker-compose.yml):
```yaml
backend:
  environment:
    NODE_ENV: production
    PORT: 3001
    DATABASE_URL: postgresql://fovea:fovea@postgres:5432/fovea
```

### Frontend Service

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:3001` | Backend API URL |
| `VITE_VIDEO_BASE_URL` | `http://localhost:3001/videos` | Video file base URL |

**Example** (in docker-compose.yml):
```yaml
frontend:
  environment:
    VITE_API_URL: http://localhost:3001
    VITE_VIDEO_BASE_URL: http://localhost:3001/videos
```

### Model Service

| Variable | Default | Description |
|----------|---------|-------------|
| `DEVICE` | `cpu` | Inference device (cpu, cuda) |
| `BUILD_MODE` | `minimal` | Build mode (minimal, full) |
| `MODEL_CONFIG_PATH` | `/app/config/models.yaml` | Model configuration file |
| `PYTORCH_CUDA_ALLOC_CONF` | `max_split_size_mb:512` | PyTorch CUDA memory config |
| `REDIS_URL` | `redis://redis:6379` | Redis connection string |

**Example** (in docker-compose.yml):
```yaml
model-service:
  environment:
    DEVICE: cuda
    BUILD_MODE: full
    PYTORCH_CUDA_ALLOC_CONF: max_split_size_mb:512
```

### PostgreSQL

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | `fovea` | Database user |
| `POSTGRES_PASSWORD` | `fovea` | Database password |
| `POSTGRES_DB` | `fovea` | Database name |

**Example** (in docker-compose.yml):
```yaml
postgres:
  environment:
    POSTGRES_USER: fovea
    POSTGRES_PASSWORD: fovea
    POSTGRES_DB: fovea
```

### Grafana

| Variable | Default | Description |
|----------|---------|-------------|
| `GF_SECURITY_ADMIN_USER` | `admin` | Grafana admin username |
| `GF_SECURITY_ADMIN_PASSWORD` | `admin` | Grafana admin password |
| `GF_AUTH_ANONYMOUS_ENABLED` | `true` | Allow anonymous access |

**Example** (in docker-compose.yml):
```yaml
grafana:
  environment:
    GF_SECURITY_ADMIN_USER: admin
    GF_SECURITY_ADMIN_PASSWORD: secure_password
```

## Configuration Files

### Backend Configuration

Environment variables can be set in `server/.env`:

```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://fovea:fovea@localhost:5432/fovea
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=http://localhost:5173
MODEL_SERVICE_URL=http://localhost:8000
```

### Frontend Configuration

Environment variables can be set in `annotation-tool/.env`:

```env
VITE_API_URL=http://localhost:3001
VITE_VIDEO_BASE_URL=http://localhost:3001/videos
```

### Model Service Configuration

Environment variables can be set in `model-service/.env`:

```env
DEVICE=cpu
BUILD_MODE=minimal
MODEL_CONFIG_PATH=/app/config/models.yaml
REDIS_URL=redis://localhost:6379
```

## Common Configuration Scenarios

### Development (Local without Docker)

**Backend** (`server/.env`):
```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://fovea:fovea@localhost:5432/fovea
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=http://localhost:5173
MODEL_SERVICE_URL=http://localhost:8000
```

**Frontend** (`annotation-tool/.env`):
```env
VITE_API_URL=http://localhost:3001
VITE_VIDEO_BASE_URL=http://localhost:3001/videos
```

### Production (Docker Compose)

**Backend**:
```yaml
backend:
  environment:
    NODE_ENV: production
    PORT: 3001
    DATABASE_URL: postgresql://fovea:${DB_PASSWORD}@postgres:5432/fovea
    REDIS_URL: redis://redis:6379
    CORS_ORIGIN: https://fovea.example.com
```

**Frontend**:
```yaml
frontend:
  environment:
    VITE_API_URL: https://api.fovea.example.com
    VITE_VIDEO_BASE_URL: https://api.fovea.example.com/videos
```

### GPU Mode

**Model Service**:
```yaml
model-service:
  environment:
    DEVICE: cuda
    BUILD_MODE: full
    PYTORCH_CUDA_ALLOC_CONF: max_split_size_mb:512
```

## Security Considerations

### Database Credentials

**Development**: Default credentials (`fovea:fovea`) are acceptable.

**Production**: Use strong passwords and environment variable substitution:
```yaml
postgres:
  environment:
    POSTGRES_USER: ${DB_USER}
    POSTGRES_PASSWORD: ${DB_PASSWORD}
    POSTGRES_DB: fovea
```

Set in `.env` file (not committed to git):
```env
DB_USER=fovea_prod
DB_PASSWORD=strong_random_password_here
```

### Grafana Credentials

Change default admin password in production:
```yaml
grafana:
  environment:
    GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
```

### CORS Configuration

Restrict CORS in production:
```yaml
backend:
  environment:
    CORS_ORIGIN: https://fovea.example.com
```

## Troubleshooting

### Database Connection Fails

**Problem**: Backend cannot connect to PostgreSQL.

**Check**:
- Verify `DATABASE_URL` is correct
- Ensure PostgreSQL container is running: `docker compose ps postgres`
- Check PostgreSQL logs: `docker compose logs postgres`

### Model Service Not Found

**Problem**: Backend cannot reach model service.

**Check**:
- Verify `MODEL_SERVICE_URL` points to correct container: `http://model-service:8000`
- Ensure model service is running: `docker compose ps model-service`
- Check network connectivity: `docker compose exec backend ping model-service`

### Frontend Cannot Reach Backend

**Problem**: Frontend shows API connection errors.

**Check**:
- Verify `VITE_API_URL` matches backend URL
- Check CORS settings in backend `CORS_ORIGIN`
- Inspect browser console for CORS errors

### GPU Not Available

**Problem**: Model service cannot access GPU despite `DEVICE=cuda`.

**Check**:
- Verify NVIDIA driver installed: `nvidia-smi`
- Ensure nvidia-docker2 installed
- Check Docker can access GPU: `docker run --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi`

## Next Steps

- Review [Configuration Guide](../deployment/configuration.md) for detailed setup
- Explore [Service Ports](./service-ports.md) for network configuration
- Read [Docker Profiles](../concepts/docker-profiles.md) for deployment modes
