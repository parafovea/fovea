# fovea Deployment Guide

This guide covers deploying fovea using Docker Compose for local development and production environments.

## Prerequisites

### Required Software
- Docker Engine 20.10+ (with BuildKit support)
- Docker Compose v2.0+ (Compose Spec compatible)
- For GPU support: NVIDIA Docker runtime (nvidia-container-toolkit)

### System Requirements
- **Minimum**: 16GB RAM, 100GB disk space
- **Recommended**: 32GB RAM, 500GB disk space, NVIDIA GPU (24GB+ VRAM)
- **GPU Models**: Model service requires CUDA-compatible GPU for optimal performance

### GPU Setup (Required for Model Service)

Install NVIDIA Container Toolkit:

```bash
# Ubuntu/Debian
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

Verify GPU access:
```bash
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi
```

### Testing GPU Builds on macOS/CPU Systems

⚠️ **Important**: The `full` build mode with `DEVICE=gpu` cannot be fully built or tested on macOS or CPU-only systems because:
- macOS does not support NVIDIA CUDA (even with eGPUs)
- vLLM and SGLang require NVIDIA GPUs and will fail to compile on CPU/ARM64

**Options for testing GPU builds**:

1. **Use minimal/recommended modes locally** (works on all platforms):
   ```bash
   MODEL_BUILD_MODE=recommended docker compose build model-service
   docker compose up -d
   ```

2. **Test on cloud GPU instances** (AWS p3.2xlarge, Azure NC6, GCP T4):
   ```bash
   # On GPU instance
   docker compose --profile gpu build
   docker compose --profile gpu up -d
   ```

3. **Verify Dockerfile syntax only** (limited validation):
   ```bash
   docker buildx build --platform linux/amd64 \
     --build-arg DEVICE=gpu --build-arg BUILD_MODE=full \
     model-service/
   # May fail during vLLM compilation without actual GPU
   ```

## Quick Start

### Local Development (CPU)

For development on machines without GPUs (default):

1. **Clone the repository** (if not already done):
   ```bash
   cd /path/to/fovea
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your preferred settings
   ```

3. **Start all services with CPU mode** (default):
   ```bash
   docker compose up -d
   ```

The CPU model service runs by default with no additional flags needed.

### Production Deployment (GPU)

For production on servers with NVIDIA GPUs:

1. **Ensure GPU prerequisites are met** (see [GPU Setup](#gpu-setup-required-for-model-service))

2. **Start services with GPU profile**:
   ```bash
   docker compose --profile gpu up -d
   ```

This activates the `model-service-gpu` variant with NVIDIA GPU support.

4. **Check service health**:
   ```bash
   docker compose ps
   docker compose logs -f
   ```

5. **Access services**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001
   - Model Service: http://localhost:8000
   - Grafana: http://localhost:3002 (admin/admin)
   - Prometheus: http://localhost:9090

## Service Architecture

### Services

| Service | Port | Description | Dependencies |
|---------|------|-------------|--------------|
| frontend | 3000 | React SPA with Vite + nginx | backend |
| backend | 3001 | Node.js/Fastify API server | postgres, redis, otel-collector |
| model-service | 8000 | FastAPI ML inference service | GPU (optional) |
| postgres | 5432 | PostgreSQL 16 with pgvector | - |
| redis | 6379 | Redis cache and job queue | - |
| otel-collector | 4317/4318 | OpenTelemetry collector | - |
| prometheus | 9090 | Metrics storage | - |
| grafana | 3002 | Metrics visualization | prometheus |

### Volumes

- `model-cache`: HuggingFace model weights (can grow to 100GB+)
- `postgres-data`: Database persistence
- `redis-data`: Redis persistence
- `video-data`: Video file storage
- `prometheus-data`: Metrics storage
- `grafana-data`: Dashboard configuration

### Networks

- `fovea-network`: Internal bridge network for service communication

## Docker Compose Profiles

The project uses **Docker Compose profiles** to support both CPU and GPU deployments from a single configuration file.

### Profile Structure

| Profile | Service Name | Purpose | Activation |
|---------|-------------|---------|------------|
| *(default)* | `model-service` | CPU-only inference | Runs by default |
| `cpu` | `model-service` | CPU-only inference (explicit) | `--profile cpu` |
| `gpu` | `model-service-gpu` | GPU-accelerated inference | `--profile gpu` |

### How It Works

**CPU Development (default)**:
```bash
docker compose up -d  # Starts model-service (CPU)
```

**CPU Development (explicit)**:
```bash
docker compose --profile cpu up -d  # Same as default
```

**GPU Production**:
```bash
docker compose --profile gpu up -d  # Starts model-service-gpu instead
```

### Profile Benefits

- ✅ **Single configuration file**: No need for multiple compose files
- ✅ **Explicit intent**: `--profile gpu` clearly indicates GPU mode
- ✅ **No conflicts**: CPU and GPU services can't run simultaneously
- ✅ **Modern standard**: Uses Docker Compose profiles feature (v1.28+)

## Configuration

### Environment Variables

Key variables in `.env`:

```bash
# Database
POSTGRES_USER=fovea
POSTGRES_PASSWORD=fovea_password  # Change in production!
POSTGRES_DB=fovea

# GPU Configuration
CUDA_VISIBLE_DEVICES=0,1,2,3  # Adjust to available GPUs
PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512

# Security
GF_SECURITY_ADMIN_PASSWORD=admin  # Change in production!
```

### Model Service Build Configuration

The model service supports three build modes to balance features and build time:

#### Build Modes

| Mode | Device | Build Time | Image Size | Features | Use Case |
|------|--------|-----------|-----------|----------|----------|
| **minimal** | CPU/GPU | ~1-2 min | ~3-4GB | PyTorch, Transformers, Ultralytics, FastAPI | Local development, CI/CD |
| **recommended** | CPU/GPU | ~1-2 min | ~3-4GB | minimal + bitsandbytes quantization | Development with model optimization |
| **full** | GPU only | ~10-15 min | ~8-10GB | recommended + vLLM, SGLang, SAM-2 | Production GPU deployment |

#### Setting Build Mode

**Using Docker Compose** (recommended):
```bash
# CPU mode (default)
docker compose up -d

# CPU mode with recommended build
MODEL_BUILD_MODE=recommended docker compose build model-service
docker compose up -d

# GPU mode with full build (default for GPU profile)
docker compose --profile gpu up -d
```

**Using Docker directly**:
```bash
# Minimal (default)
docker build --build-arg DEVICE=cpu --build-arg BUILD_MODE=minimal model-service/

# Recommended
docker build --build-arg DEVICE=cpu --build-arg BUILD_MODE=recommended model-service/

# Full (GPU required)
docker build --build-arg DEVICE=gpu --build-arg BUILD_MODE=full model-service/
```

#### Build Mode Details

**minimal**: Fast iteration for development
- ✅ Video summarization (Transformers)
- ✅ Object detection (Ultralytics/YOLO)
- ✅ Basic inference
- ❌ Advanced quantization
- ❌ High-performance inference engines

**recommended**: Development with optimization
- ✅ All minimal features
- ✅ bitsandbytes for 4-bit/8-bit quantization
- ✅ Reduced VRAM usage
- ❌ vLLM/SGLang inference engines

**full**: Production deployment
- ✅ All recommended features
- ✅ vLLM for high-throughput LLM serving
- ✅ SGLang for structured generation
- ✅ SAM-2 for video segmentation
- ⚠️ Requires NVIDIA GPU with CUDA
- ⚠️ Will not build on CPU/ARM64 (macOS)

### Model Configuration

Edit `model-service/config/models.yaml` to select models:

```yaml
models:
  video_summarization:
    selected: "llama-4-maverick"  # Change to desired model
  ontology_augmentation:
    selected: "llama-4-scout"
  object_detection:
    selected: "yolo-world-v2"
  video_tracking:
    selected: "samurai"
```

## Common Operations

### Start Services
```bash
# Start all services (CPU mode, default)
docker compose up -d

# Start with GPU profile
docker compose --profile gpu up -d

# Start specific services
docker compose up -d frontend backend postgres redis

# Start with logs
docker compose up
```

### Stop Services
```bash
# Stop all services (works for any profile)
docker compose down

# Stop GPU services specifically
docker compose --profile gpu down

# Stop and remove volumes (WARNING: deletes data)
docker compose down -v
```

### Switch Between CPU and GPU
```bash
# Switch from CPU to GPU
docker compose down
docker compose --profile gpu up -d

# Switch from GPU to CPU
docker compose --profile gpu down
docker compose up -d

# View which services are running
docker compose ps
```

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend

# Last 100 lines
docker compose logs --tail=100 model-service
```

### Rebuild Services
```bash
# Rebuild all
docker compose build

# Rebuild specific service
docker compose build backend

# Rebuild without cache
docker compose build --no-cache frontend
```

### Database Operations
```bash
# Run migrations
docker compose exec backend npx prisma migrate deploy

# Access PostgreSQL
docker compose exec postgres psql -U fovea -d fovea

# Backup database
docker compose exec postgres pg_dump -U fovea fovea > backup.sql

# Restore database
cat backup.sql | docker compose exec -T postgres psql -U fovea fovea
```

### Scale Services
```bash
# Not recommended for stateful services (postgres, redis)
# Frontend can be scaled with load balancer
docker compose up -d --scale frontend=3
```

## Health Checks

All services include health checks that run automatically:

```bash
# Check health status
docker compose ps

# Manually test health endpoints
curl http://localhost:3001/health  # Backend
curl http://localhost:8000/health  # Model service
```

Health check intervals:
- Frontend: 30s
- Backend: 30s (40s start period)
- Model Service: 30s (60s start period for model loading)
- Postgres: 10s
- Redis: 10s

## Monitoring

### Grafana Dashboards

1. Access Grafana at http://localhost:3002
2. Login with admin/admin (change password on first login)
3. Dashboards are auto-provisioned from `grafana-dashboards/`

### Prometheus Metrics

Access Prometheus at http://localhost:9090

Key metrics:
- Service health: `up{job="fovea"}`
- Request latency: `http_request_duration_seconds`
- Model inference time: `model_inference_duration_seconds`

### OpenTelemetry Traces

Traces are collected via otel-collector on ports 4317 (gRPC) and 4318 (HTTP).

## Troubleshooting

### Services Won't Start

1. Check logs: `docker compose logs`
2. Verify ports aren't in use: `lsof -i :3000`
3. Check disk space: `df -h`
4. Verify Docker resources in Docker Desktop settings

### GPU Not Detected

First, ensure you're using the GPU profile:

```bash
# Are you using the GPU profile?
docker compose --profile gpu ps

# Verify nvidia-smi works in container
docker compose exec model-service-gpu nvidia-smi

# Check CUDA_VISIBLE_DEVICES
docker compose exec model-service-gpu env | grep CUDA

# Check GPU allocation in PyTorch
docker compose exec model-service-gpu python -c "import torch; print(torch.cuda.is_available())"
```

If GPUs still aren't detected:
1. Verify NVIDIA Container Toolkit is installed: `nvidia-ctk --version`
2. Check Docker can access GPUs: `docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi`
3. Restart Docker daemon: `sudo systemctl restart docker`
4. Ensure you started with `--profile gpu` flag

### Out of Memory (OOM)

Model service requires significant VRAM:
- Reduce `CUDA_VISIBLE_DEVICES` to fewer GPUs
- Select smaller models in `models.yaml`
- Increase `PYTORCH_CUDA_ALLOC_CONF` split size
- Add more RAM/swap to host

### Database Connection Issues

```bash
# Check postgres is healthy
docker compose ps postgres

# Test connection
docker compose exec backend npx prisma db push

# Reset database (WARNING: deletes data)
docker compose down -v
docker compose up -d postgres
docker compose exec backend npx prisma migrate deploy
```

### Model Download Slow

Models download from HuggingFace on first run:
- Check `model-cache` volume size: `docker volume inspect fovea_model-cache`
- Pre-download models: `docker compose exec model-service python -c "from transformers import AutoModel; AutoModel.from_pretrained('model-id')"`
- Use HuggingFace mirror if needed

## Production Deployment

### Security Checklist

- [ ] Change all default passwords in `.env`
- [ ] Use secrets management (Docker secrets, AWS Secrets Manager)
- [ ] Enable HTTPS with reverse proxy (nginx, Traefik)
- [ ] Restrict network access (firewall rules)
- [ ] Enable authentication on all services
- [ ] Regularly update base images
- [ ] Enable Docker Content Trust
- [ ] Use non-root users in containers
- [ ] Scan images for vulnerabilities

### Performance Optimization

- Enable BuildKit: `export DOCKER_BUILDKIT=1`
- Use Docker layer caching
- Pin base image versions for reproducibility
- Use multi-stage builds (already implemented)
- Configure resource limits in docker-compose.yml

### Backup Strategy

```bash
# Automated backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker compose exec postgres pg_dump -U fovea fovea | gzip > backup_$DATE.sql.gz
docker compose exec redis redis-cli SAVE
docker cp fovea-redis-1:/data/dump.rdb redis_backup_$DATE.rdb
```

## Development Mode

For development without Docker:

```bash
# Frontend
cd annotation-tool
npm install
npm run dev  # Port 5173

# Backend
cd server
npm install
npm run dev  # Port 3001

# Model Service
cd model-service
python -m venv venv
source venv/bin/activate
pip install -e ".[dev]"
uvicorn src.main:app --reload  # Port 8000
```

## Additional Resources

- Docker Compose Spec: https://docs.docker.com/compose/compose-file/
- NVIDIA Container Toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/
- FastAPI Deployment: https://fastapi.tiangolo.com/deployment/
- Prometheus Monitoring: https://prometheus.io/docs/

## Support

For issues and questions:
- Check logs: `docker compose logs -f`
- Review health checks: `docker compose ps`
- Consult service documentation in respective directories
- Check GitHub issues
