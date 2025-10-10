---
sidebar_position: 5
title: GPU Mode Deployment
description: Detailed guide for deploying FOVEA with GPU acceleration for production performance
keywords: [gpu, deployment, nvidia, cuda, production, performance]
---

# GPU Mode Deployment

GPU mode enables GPU-accelerated inference for significantly faster processing. This mode requires NVIDIA GPU with CUDA support and is recommended for production deployments.

## Overview

GPU mode uses Docker Compose GPU profiles to start the GPU-enabled model service. All inference operations run on GPU, providing 5-10x speedup compared to CPU mode.

**Best for:**
- Production deployments
- High-volume video processing (10+ videos/day)
- Real-time or near-real-time inference
- Processing high-resolution video
- Running large AI models

## Prerequisites

Ensure you have met the [GPU mode prerequisites](./prerequisites.md#gpu-mode-minimum):
- Docker Engine 24.0+
- Docker Compose 2.20+
- NVIDIA GPU with 8GB+ VRAM (24GB recommended)
- NVIDIA Driver 525.60+
- CUDA Toolkit 11.8+
- NVIDIA Container Toolkit (nvidia-docker2)
- 8 cores minimum (16 cores recommended)
- 16GB RAM minimum (32GB recommended)
- 50GB disk space minimum (100GB recommended)

**Important**: Complete [GPU setup](./prerequisites.md#gpu-setup) before proceeding.

## Step-by-Step Deployment

### Step 1: Verify GPU Access

Before deployment, verify Docker can access GPU:

```bash
nvidia-smi
```

Expected output shows GPU information, driver version, and CUDA version.

Test Docker GPU access:

```bash
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi
```

This should display GPU information from inside a container.

### Step 2: Clone Repository

```bash
git clone https://github.com/parafovea/fovea.git
cd fovea
```

### Step 3: Configure Environment (Optional)

Default GPU configuration is suitable for most deployments. To customize:

```bash
cp .env.example .env
```

Key GPU-related settings in `.env`:

```bash
# GPU Configuration
CUDA_VISIBLE_DEVICES=0,1,2,3  # GPU indices to use
PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512  # Memory management
```

See [Configuration](./configuration.md) for details.

### Step 4: Start Services with GPU Profile

Start all services with GPU acceleration:

```bash
docker compose --profile gpu up -d
```

This command:
- Downloads Docker images (first run only)
- Creates persistent volumes
- Starts model-service-gpu with GPU access
- Enables GPU-accelerated inference

Initial startup takes 5-10 minutes for image download and model loading.

### Step 5: Verify GPU Detection

Check GPU is detected by model service:

```bash
docker compose exec model-service-gpu nvidia-smi
```

Expected output shows GPU information from inside the container.

Check CUDA availability in PyTorch:

```bash
docker compose exec model-service-gpu python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}'); print(f'GPU count: {torch.cuda.device_count()}')"
```

Expected output:
```
CUDA available: True
GPU count: 1
```

### Step 6: Verify Service Health

Check model service is using GPU:

```bash
curl http://localhost:8000/health
```

Expected response includes `"device":"cuda"`.

Check backend connectivity:

```bash
curl http://localhost:3001/health
```

Expected response: `{"status":"ok"}`

### Step 7: Access Application

Open your browser and navigate to:

**Frontend**: http://localhost:3000

**Model Service docs**: http://localhost:8000/docs (Swagger UI)

**Grafana dashboards**: http://localhost:3002 (admin/admin)

## Performance Expectations

GPU mode provides significant performance improvements over CPU mode. Performance varies based on:
- GPU VRAM (larger models require more memory)
- GPU compute capability (newer GPUs perform better)
- Batch size configuration
- Model size and precision settings

Typical speedup compared to CPU mode: 5-10x for most inference operations.

Performance scales with GPU capabilities. High-end GPUs (RTX 4090, A100) provide faster inference than entry-level GPUs (RTX 3070).

## Resource Usage

Typical resource consumption in GPU mode:

| Resource | Usage | Notes |
|----------|-------|-------|
| RAM | 8-12GB | System memory |
| GPU VRAM | 4-8GB | Model and batch data |
| GPU Utilization | 60-90% | During inference |
| Disk | 20GB | Larger images with full build |

Monitor GPU usage:

```bash
# From host
nvidia-smi -l 1

# From container
docker compose exec model-service-gpu nvidia-smi -l 1
```

Monitor overall resource usage:

```bash
docker stats
```

## Troubleshooting GPU Issues

### GPU Not Detected

If GPU is not visible inside container:

```bash
# Check GPU profile is active
docker compose --profile gpu ps

# Verify CUDA_VISIBLE_DEVICES
docker compose exec model-service-gpu env | grep CUDA

# Check Docker runtime
docker info | grep -i runtime
```

Ensure you started with `--profile gpu` flag.

### CUDA Out of Memory

If you see "CUDA out of memory" errors:

1. **Reduce batch sizes** in `model-service/config/models.yaml`
2. **Use fewer GPUs**: Set `CUDA_VISIBLE_DEVICES=0` in `.env`
3. **Use smaller models**: Switch to lighter models in configuration
4. **Increase GPU memory**: Upgrade to GPU with more VRAM

### Driver Version Mismatch

If you see CUDA version incompatibility errors:

```bash
# Check driver CUDA version
nvidia-smi

# Check toolkit version in container
docker compose exec model-service-gpu nvcc --version
```

Update NVIDIA driver to 525.60+ if needed.

### Container Fails to Start

Check logs for specific errors:

```bash
docker compose --profile gpu logs model-service-gpu
```

Common issues:
- NVIDIA Container Toolkit not installed
- Docker not restarted after toolkit installation
- Insufficient permissions to access `/dev/nvidia*`

## GPU Memory Management

### Monitor Memory Usage

Check current memory usage:

```bash
nvidia-smi --query-gpu=memory.used,memory.free,memory.total --format=csv
```

### Optimize Memory Usage

Edit `.env` for memory optimization:

```bash
# Limit memory fragmentation
PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512,roundup_power2_divisions:16

# Use mixed precision training/inference
MIXED_PRECISION=true
```

### Clear GPU Cache

If memory is not released:

```bash
docker compose restart model-service-gpu
```

## Multi-GPU Setup

To use multiple GPUs:

1. **Configure GPU indices** in `.env`:
```bash
CUDA_VISIBLE_DEVICES=0,1,2,3  # Use GPUs 0-3
```

2. **Restart services**:
```bash
docker compose --profile gpu down
docker compose --profile gpu up -d
```

3. **Verify all GPUs detected**:
```bash
docker compose exec model-service-gpu python -c "import torch; print(torch.cuda.device_count())"
```

Model service will automatically distribute workload across available GPUs.

## Production Considerations

### Security

- Change default passwords in `.env`
- Restrict access to ports 3001, 8000
- Use HTTPS reverse proxy (nginx, Traefik)
- Enable authentication on Grafana

### Monitoring

- Set up alerts for GPU memory usage >90%
- Monitor GPU temperature
- Track inference latency via Prometheus
- Review Grafana dashboards regularly

See [Monitoring Overview](../operations/monitoring/overview.md) for details.

### Backup Strategy

- Backup PostgreSQL database regularly
- Store video files on reliable storage
- Keep `.env` configuration in secure location

See [Common Tasks](../operations/common-tasks.md) for backup commands.

## Switching from CPU to GPU

To switch existing CPU deployment to GPU:

```bash
# Stop CPU services
docker compose down

# Start GPU services
docker compose --profile gpu up -d
```

Data in volumes is preserved during the switch.

## Next Steps

- **[Build Modes](./build-modes.md)**: Understand minimal vs full builds
- **[Configuration](./configuration.md)**: Advanced GPU configuration
- **[Monitoring](../operations/monitoring/overview.md)**: Set up monitoring
- **[Common Tasks](../operations/common-tasks.md)**: Daily operations
