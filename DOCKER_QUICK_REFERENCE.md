# Docker Quick Reference

## Setup

```bash
# Copy environment template (optional)
cp .env.example .env

# Start all services (CPU mode, default)
docker compose up -d

# Start with GPU support
docker compose --profile gpu up -d

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

## CPU vs GPU Profiles

The project uses Docker Compose profiles to manage CPU and GPU deployments:

```bash
# CPU mode (default) - For local development
docker compose up -d                    # Starts model-service (CPU)

# GPU mode - For production with NVIDIA GPUs
docker compose --profile gpu up -d      # Starts model-service-gpu

# View which services will start
docker compose config --services        # Shows default services
docker compose --profile gpu config --services  # Shows GPU services
```

### Model Service Variants

| Profile | Service Name | Build Mode | Device | Best For |
|---------|-------------|------------|--------|----------|
| *(default)* | `model-service` | minimal | CPU | Local development |
| `cpu` | `model-service` | minimal | CPU | Explicit CPU mode |
| `gpu` | `model-service-gpu` | full | GPU | Production with GPUs |

### Customizing Build Mode

```bash
# Build CPU service with recommended mode
MODEL_BUILD_MODE=recommended docker compose build model-service

# Build GPU service with custom mode
MODEL_BUILD_MODE=recommended docker compose --profile gpu build model-service-gpu
```

### Build Mode Comparison

| Mode | Build Time | Size | Includes |
|------|-----------|------|----------|
| **minimal** | ~1-2 min | ~3-4GB | PyTorch, Transformers, Ultralytics, FastAPI |
| **recommended** | ~1-2 min | ~3-4GB | minimal + bitsandbytes (quantization) |
| **full** | ~10-15 min | ~8-10GB | recommended + vLLM, SGLang, SAM-2 (GPU only) |

**Note**: The `full` build mode requires GPU and will fail on CPU/ARM64 systems.

## Development Mode

The default mode is optimized for local CPU development. For custom overrides:

```bash
# Create a local override file (gitignored)
cat > docker-compose.override.yml <<EOF
services:
  backend:
    command: npm run dev  # Hot reload
    volumes:
      - ./server/src:/app/src
EOF

# Docker Compose automatically loads docker-compose.override.yml
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

# For GPU service
docker compose exec model-service-gpu bash

# Check environment
docker compose exec backend env
docker compose exec model-service-gpu env | grep CUDA

# Test GPU access (requires --profile gpu)
docker compose exec model-service-gpu nvidia-smi

# Check health
curl http://localhost:3001/api/health  # Backend
curl http://localhost:8000/health  # Model service (CPU or GPU)
```

## Monitoring

- **Grafana**: http://localhost:3002 (admin/admin) - Visualization dashboards
- **Prometheus**: http://localhost:9090 - Metrics storage and queries
- **Bull Board**: http://localhost:3001/admin/queues - Job queue monitoring
- **OTEL Metrics**: http://localhost:8889/metrics - Raw metrics endpoint
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Model Service**: http://localhost:8000/docs (Swagger UI)

**For detailed metrics, dashboards, and troubleshooting**, see the [Monitoring Guide](https://fovea.video/docs/operations/monitoring/overview).

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

### Core Configuration

- `MODEL_BUILD_MODE`: Feature set - `minimal` (default), `recommended`, or `full`
  - **Note**: CPU/GPU is controlled by profiles (`--profile gpu`), not env vars
- `CUDA_VISIBLE_DEVICES`: GPU indices when using `--profile gpu` (e.g., "0,1,2,3")
- `POSTGRES_PASSWORD`: Database password (change for production!)
- `GF_SECURITY_ADMIN_PASSWORD`: Grafana password (change for production!)
- `MODEL_CONFIG_PATH`: Path to models.yaml configuration

### Authentication & User Management (server)

- `FOVEA_MODE`: Authentication mode - `single-user` (default) or `multi-user`
- `ALLOW_REGISTRATION`: Allow user self-registration - `true` or `false`
- `COOKIE_SECRET`: Secret for session cookie signing (min 32 characters, required in multi-user mode)
- `SESSION_TIMEOUT_DAYS`: Session expiration in days (default: 7)
- `API_KEY_ENCRYPTION_KEY`: 32-byte hex key for API key encryption at rest

### External VLM/LLM API Keys (model-service)

- `ANTHROPIC_API_KEY`: Anthropic Claude API key (get from https://console.anthropic.com/)
- `OPENAI_API_KEY`: OpenAI API key (get from https://platform.openai.com/api-keys)
- `GOOGLE_API_KEY`: Google AI API key (get from https://aistudio.google.com/app/apikey)

### External Audio API Keys (model-service)

- `ASSEMBLYAI_API_KEY`: AssemblyAI API key
- `DEEPGRAM_API_KEY`: Deepgram API key
- `AZURE_SPEECH_KEY`: Azure Speech Services key
- `AZURE_SPEECH_REGION`: Azure Speech Services region (e.g., "eastus")
- `AWS_ACCESS_KEY_ID`: AWS access key for Transcribe
- `AWS_SECRET_ACCESS_KEY`: AWS secret key for Transcribe
- `AWS_REGION`: AWS region (e.g., "us-east-1")
- `REV_AI_API_KEY`: Rev.ai API key
- `GLADIA_API_KEY`: Gladia API key

**Note:** API keys can also be configured via the frontend UI (user-level) or admin panel (system-level). Environment variables serve as fallback.

## Service Ports

| Service | Port | URL |
|---------|------|-----|
| Frontend | 3000 | http://localhost:3000 |
| Backend | 3001 | http://localhost:3001 |
| Backend (Bull Board) | 3001 | http://localhost:3001/admin/queues |
| Model Service | 8000 | http://localhost:8000 |
| Postgres | 5432 | postgresql://localhost:5432 |
| Redis | 6379 | redis://localhost:6379 |
| OTEL Collector (gRPC) | 4317 | - |
| OTEL Collector (HTTP) | 4318 | - |
| OTEL Metrics | 8889 | http://localhost:8889/metrics |
| Prometheus | 9090 | http://localhost:9090 |
| Grafana | 3002 | http://localhost:3002 |

## File Locations

- **Compose file**: `docker-compose.yml`
- **Local overrides**: `docker-compose.override.yml` (gitignored, create if needed)
- **Environment**: `.env`
- **Dockerfiles**: `*/Dockerfile`
- **Config**: `otel-collector-config.yaml`, `prometheus.yml`, `model-service/config/models.yaml`
- **Dashboards**: `grafana-dashboards/`
- **Documentation**: https://fovea.video/docs
