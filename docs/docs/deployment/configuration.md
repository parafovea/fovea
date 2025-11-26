---
sidebar_position: 7
title: Configuration
description: Configure FOVEA services with environment variables and configuration files
keywords: [configuration, environment, settings, models, customization]
---

# Configuration

FOVEA services are configured through environment variables and configuration files. This page covers common configuration scenarios and best practices.

## Configuration Methods

### Environment Variables

Environment variables control service behavior and connections. Set them in:

1. **`.env` file** in project root (Docker Compose reads automatically)
2. **docker-compose.yml** service definitions
3. **Shell environment** before running services

See [Environment Variables Reference](../reference/environment-variables.md) for complete variable list.

### Configuration Files

Some services use configuration files for detailed settings:

| Service | File | Purpose |
|---------|------|---------|
| Model Service | `model-service/config/models.yaml` | Model selection and parameters |
| Backend | `server/prisma/schema.prisma` | Database schema |
| OTEL Collector | `otel-collector-config.yaml` | Telemetry configuration |
| Prometheus | `prometheus.yml` | Metrics scrape config |

## Quick Configuration

### Basic Setup

For default configuration, no changes are needed:

```bash
docker compose up -d
```

### Custom Configuration

Create `.env` file in project root:

```bash
cp .env.example .env
```

Edit `.env` with your settings. Key variables:

```env
# Database
POSTGRES_PASSWORD=your_secure_password

# GPU Configuration (GPU mode only)
CUDA_VISIBLE_DEVICES=0,1

# Security
GF_SECURITY_ADMIN_PASSWORD=grafana_password
```

## Authentication Configuration

FOVEA supports single-user and multi-user authentication modes:

```env
# Multi-user mode (production/demo)
FOVEA_MODE=multi-user
ADMIN_PASSWORD=<secure-password>  # Required for admin account
SESSION_SECRET=<random-secret>    # Required for sessions
ALLOW_REGISTRATION=true           # Allow user self-registration

# Single-user mode (local development only)
FOVEA_MODE=single-user
```

**See [Authentication Setup Guide](./authentication-setup.md) for complete configuration details.**

## Backend Configuration

### Database Connection

Set database connection in `.env`:

```env
DATABASE_URL=postgresql://user:password@host:port/database
```

**Development** (Docker Compose default):
```env
DATABASE_URL=postgresql://fovea:fovea@postgres:5432/fovea
```

**Production** (external database):
```env
DATABASE_URL=postgresql://fovea_user:secure_pass@db.example.com:5432/fovea_prod
```

### Redis Configuration

```env
REDIS_URL=redis://redis:6379
```

For Redis with password:
```env
REDIS_URL=redis://:password@redis:6379
```

### CORS Configuration

Set allowed origins for API access:

```env
CORS_ORIGIN=http://localhost:3000
```

Multiple origins (comma-separated):
```env
CORS_ORIGIN=http://localhost:3000,https://fovea.example.com
```

**Production**: Use specific domains, not wildcards.

## Model Service Configuration

### models.yaml File

Configure AI models in `model-service/config/models.yaml`:

```yaml
models:
  video_summarization:
    selected: "llama-4-maverick"
    options:
      max_tokens: 1024
      temperature: 0.7

  ontology_augmentation:
    selected: "llama-4-scout"
    options:
      max_tokens: 512

  object_detection:
    selected: "yolo-world-v2"
    options:
      confidence_threshold: 0.7

  video_tracking:
    selected: "samurai"
    options:
      tracking_mode: "default"
```

### Available Models

**Video Summarization** (VLM):
- `llama-4-maverick` (default)
- `qwen2-vl-7b-instruct`

**Ontology Augmentation** (LLM):
- `llama-4-scout` (default)
- Custom models from HuggingFace

**Object Detection**:
- `yolo-world-v2` (default)
- `grounding-dino`

**Video Tracking**:
- `samurai` (default)
- `bytetrack`
- `bot-sort`

### GPU Memory Configuration

Control CUDA memory allocation in `.env`:

```env
# Limit memory fragmentation
PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512

# Additional options
PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512,roundup_power2_divisions:16
```

### Device Selection

**CPU mode**:
```env
DEVICE=cpu
```

**GPU mode** (single GPU):
```env
DEVICE=cuda
CUDA_VISIBLE_DEVICES=0
```

**Multi-GPU**:
```env
DEVICE=cuda
CUDA_VISIBLE_DEVICES=0,1,2,3
```

## Frontend Configuration

### API Endpoint

Set backend URL in `.env` or `annotation-tool/.env`:

**Note**: For local development with `npm run dev`, use port 5173. For Docker deployment, port 3000 is used.

```env
VITE_API_URL=http://localhost:3001
VITE_VIDEO_BASE_URL=http://localhost:3001/videos
```

**Production** (behind reverse proxy):
```env
VITE_API_URL=https://api.fovea.example.com
VITE_VIDEO_BASE_URL=https://api.fovea.example.com/videos
```

### Build-Time Variables

Frontend environment variables are embedded at build time. After changing variables, rebuild:

```bash
docker compose build frontend
docker compose up -d frontend
```

## Observability Configuration

### OpenTelemetry

Configure OTEL endpoint in backend:

```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
```

Disable telemetry for development:

```env
OTEL_SDK_DISABLED=true
```

### Prometheus

Edit `prometheus.yml` to adjust scrape intervals:

```yaml
scrape_configs:
  - job_name: 'otel-collector'
    scrape_interval: 15s  # Default: 15s
    static_configs:
      - targets: ['otel-collector:8889']
```

### Grafana

Change admin credentials in `.env`:

```env
GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_PASSWORD=secure_password_here
```

Disable anonymous access:

```env
GF_AUTH_ANONYMOUS_ENABLED=false
```

## Production Configuration

### Security Checklist

1. **Change default passwords**:
```env
POSTGRES_PASSWORD=strong_random_password
GF_SECURITY_ADMIN_PASSWORD=another_strong_password
```

2. **Restrict CORS**:
```env
CORS_ORIGIN=https://fovea.example.com
```

3. **Use HTTPS** with reverse proxy (nginx, Traefik)

4. **Set NODE_ENV** to production:
```env
NODE_ENV=production
```

### Resource Limits

Add resource limits in `docker-compose.yml`:

```yaml
model-service:
  deploy:
    resources:
      limits:
        cpus: '4'
        memory: 8G
      reservations:
        memory: 4G
```

### Database Connection Pooling

Configure connection pool in Prisma (backend):

```env
DATABASE_URL=postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=20
```

## Common Configuration Scenarios

### Development with Hot Reload

Backend hot reload:

```yaml
backend:
  volumes:
    - ./server/src:/app/src
  command: npm run dev
```

Frontend hot reload (already enabled by default in dev):

```bash
cd annotation-tool
npm run dev
```

### Using External PostgreSQL

Stop built-in PostgreSQL and point to external:

```yaml
# Comment out postgres service in docker-compose.yml
# postgres:
#   image: postgres:16
#   ...
```

Update backend connection:

```env
DATABASE_URL=postgresql://user:pass@external-db.example.com:5432/fovea
```

### Custom Model Path

Mount custom models directory:

```yaml
model-service:
  volumes:
    - ./custom-models:/app/models
  environment:
    MODEL_CONFIG_PATH: /app/models/custom-models.yaml
```

### Multiple GPU Configuration

Assign specific GPUs to service:

```env
CUDA_VISIBLE_DEVICES=0,1  # Use first two GPUs
```

Or in docker-compose.yml:

```yaml
model-service-gpu:
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            device_ids: ['0', '1']
            capabilities: [gpu]
```

## Configuration Validation

### Check Current Configuration

View environment variables in running container:

```bash
docker compose exec backend env
docker compose exec model-service env
```

### Test Database Connection

```bash
docker compose exec backend npx prisma db execute --stdin <<< "SELECT 1"
```

### Verify Model Configuration

```bash
docker compose exec model-service python -c "
import yaml
with open('/app/config/models.yaml') as f:
    config = yaml.safe_load(f)
    print(config)
"
```

### Check GPU Configuration

```bash
docker compose exec model-service-gpu python -c "
import torch
print(f'CUDA available: {torch.cuda.is_available()}')
print(f'Device count: {torch.cuda.device_count()}')
"
```

## Troubleshooting Configuration

### Configuration Not Applied

If changes do not take effect:

1. **Restart services**:
```bash
docker compose restart backend
```

2. **Rebuild if needed** (build-time variables):
```bash
docker compose up -d --build frontend
```

3. **Clear cache**:
```bash
docker compose down
docker compose up -d
```

### Invalid YAML Syntax

Check models.yaml syntax:

```bash
# Install yamllint if needed
yamllint model-service/config/models.yaml
```

### Environment Variable Not Found

Check variable is set:

```bash
# In container
docker compose exec backend printenv | grep DATABASE_URL

# Or
docker compose config
```

## Next Steps

- **[Environment Variables](../reference/environment-variables.md)**: Complete variable reference
- **[Service Architecture](./service-architecture.md)**: Service dependencies and communication
- **[Common Tasks](../operations/common-tasks.md)**: Daily operations
- **[Monitoring](../operations/monitoring/overview.md)**: Set up observability
