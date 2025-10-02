# Docker Quick Reference

## Setup

```bash
# Copy environment template
cp .env.example .env

# Start all services
docker compose up -d

# Start with logs
docker compose up

# Start infrastructure only (no app services)
docker compose up -d postgres redis otel-collector prometheus grafana
```

## Common Commands

```bash
# View status
docker compose ps

# View logs
docker compose logs -f
docker compose logs -f backend
docker compose logs --tail=100 model-service

# Restart a service
docker compose restart backend

# Stop all services
docker compose down

# Stop and remove volumes (deletes data)
docker compose down -v

# Rebuild service
docker compose build backend
docker compose up -d --build backend
```

## Model Service Build Modes

The model service supports different build configurations via environment variables:

```bash
# Minimal (default) - Fast build, basic features
export MODEL_DEVICE=cpu MODEL_BUILD_MODE=minimal
docker compose build model-service

# Recommended - Includes quantization support
export MODEL_DEVICE=cpu MODEL_BUILD_MODE=recommended
docker compose build model-service

# Full - All inference engines (GPU only)
export MODEL_DEVICE=gpu MODEL_BUILD_MODE=full
docker compose build model-service
```

### Build Mode Comparison

| Mode | Build Time | Size | Includes |
|------|-----------|------|----------|
| **minimal** | ~1-2 min | ~3-4GB | PyTorch, Transformers, Ultralytics, FastAPI |
| **recommended** | ~1-2 min | ~3-4GB | minimal + bitsandbytes (quantization) |
| **full** | ~10-15 min | ~8-10GB | recommended + vLLM, SGLang, SAM-2 (GPU only) |

**Note**: The `full` build mode requires `DEVICE=gpu` and will fail on CPU/ARM64 systems.

## Development Mode

```bash
# Use development compose override
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Or set environment variable
export COMPOSE_FILE=docker-compose.yml:docker-compose.dev.yml
docker compose up
```

## Database

```bash
# Run migrations
docker compose exec backend npx prisma migrate deploy

# Access psql
docker compose exec postgres psql -U fovea

# Backup
docker compose exec postgres pg_dump -U fovea fovea > backup.sql

# Restore
cat backup.sql | docker compose exec -T postgres psql -U fovea fovea
```

## Debugging

```bash
# Shell into container
docker compose exec backend sh
docker compose exec model-service bash

# Check environment
docker compose exec backend env
docker compose exec model-service env | grep CUDA

# Test GPU access
docker compose exec model-service nvidia-smi

# Check health
curl http://localhost:3001/health
curl http://localhost:8000/health
```

## Monitoring

- **Grafana**: http://localhost:3002 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Model Service**: http://localhost:8000/docs (Swagger UI)

## Troubleshooting

```bash
# View service dependencies
docker compose config

# Check resource usage
docker stats

# Remove unused resources
docker system prune -a

# View volumes
docker volume ls
docker volume inspect fovea_model-cache

# Remove specific volume
docker volume rm fovea_model-cache
```

## Production Deployment

```bash
# Build for production
docker compose build --no-cache

# Start in detached mode
docker compose up -d

# View running containers
docker compose ps

# Scale frontend (with load balancer)
docker compose up -d --scale frontend=3
```

## Environment Variables

Key variables to configure in `.env`:

- `MODEL_DEVICE`: Hardware target - `cpu` (default) or `gpu`
- `MODEL_BUILD_MODE`: Feature set - `minimal` (default), `recommended`, or `full`
- `CUDA_VISIBLE_DEVICES`: GPU indices (e.g., "0,1,2,3")
- `POSTGRES_PASSWORD`: Database password (change for production!)
- `GF_SECURITY_ADMIN_PASSWORD`: Grafana password (change for production!)
- `MODEL_CONFIG_PATH`: Path to models.yaml

## Service Ports

| Service | Port | URL |
|---------|------|-----|
| Frontend | 3000 | http://localhost:3000 |
| Backend | 3001 | http://localhost:3001 |
| Model Service | 8000 | http://localhost:8000 |
| Postgres | 5432 | postgresql://localhost:5432 |
| Redis | 6379 | redis://localhost:6379 |
| Prometheus | 9090 | http://localhost:9090 |
| Grafana | 3002 | http://localhost:3002 |
| OTLP gRPC | 4317 | - |
| OTLP HTTP | 4318 | - |

## File Locations

- **Compose file**: `docker-compose.yml`
- **Development override**: `docker-compose.dev.yml`
- **Environment**: `.env`
- **Dockerfiles**: `*/Dockerfile`
- **Config**: `otel-collector-config.yaml`, `prometheus.yml`, `model-service/config/models.yaml`
- **Dashboards**: `grafana-dashboards/`
- **Full guide**: `DEPLOYMENT.md`
