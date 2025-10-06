---
sidebar_position: 4
title: CPU Mode Deployment
description: Detailed guide for deploying FOVEA in CPU mode for development and testing
keywords: [cpu, deployment, docker, development, testing]
---

# CPU Mode Deployment

CPU mode runs all inference on the CPU without requiring GPU hardware. This mode is suitable for local development, testing, CI/CD pipelines, and deployments without GPU access.

## Overview

CPU mode uses the default Docker Compose configuration without GPU profiles. All services run on CPU, including the model service which performs AI inference.

**Best for:**
- Local development on machines without GPU
- CI/CD testing pipelines
- Systems without NVIDIA GPU
- Processing fewer than 10 videos per day
- Budget-constrained deployments

## Prerequisites

Ensure you have met the [CPU mode prerequisites](./prerequisites.md#cpu-mode-minimum):
- Docker Engine 24.0+
- Docker Compose 2.20+
- 4 cores minimum (8 cores recommended)
- 8GB RAM minimum (16GB recommended)
- 20GB disk space minimum (50GB recommended)

## Step-by-Step Deployment

### Step 1: Clone Repository

Clone the FOVEA repository to your local machine:

```bash
git clone https://github.com/your-org/fovea.git
cd fovea
```

### Step 2: Configure Environment (Optional)

The default configuration works for most development scenarios. To customize:

```bash
cp .env.example .env
```

Edit `.env` to adjust settings. See [Configuration](./configuration.md) for details.

### Step 3: Start Services

Start all services in CPU mode:

```bash
docker compose up -d
```

This command:
- Downloads Docker images (first run only)
- Creates persistent volumes for data
- Starts all services in detached mode
- Uses CPU-only model service

Initial startup takes 2-5 minutes for image download and service initialization.

### Step 4: Verify Deployment

Check that all services are running:

```bash
docker compose ps
```

Expected output shows all services with status "Up" or "Up (healthy)":
- frontend
- backend
- model-service (CPU variant)
- postgres
- redis
- otel-collector
- prometheus
- grafana

### Step 5: Verify Service Health

Check backend health:

```bash
curl http://localhost:3001/health
```

Expected response: `{"status":"ok"}`

Check model service health:

```bash
curl http://localhost:8000/health
```

Expected response: `{"status":"healthy","device":"cpu"}`

### Step 6: Access Application

Open your browser and navigate to:

**Frontend**: http://localhost:3000

You should see the FOVEA application interface. If the page is blank, check backend connectivity.

**Backend API docs**: http://localhost:3001/api

**Model Service docs**: http://localhost:8000/docs (Swagger UI)

**Grafana dashboards**: http://localhost:3002 (admin/admin)

## Performance Expectations

CPU mode inference is slower than GPU mode. Processing times vary significantly based on:
- Number of CPU cores
- Available RAM
- Model size and configuration
- Video resolution
- System load

Expect inference operations to take several seconds to minutes depending on complexity. For production workloads requiring fast inference, GPU mode provides 5-10x speedup.

## Resource Usage

Typical resource consumption in CPU mode:

| Resource | Usage | Notes |
|----------|-------|-------|
| Memory | 4-6GB | Peak during inference |
| CPU | 50-80% | During active inference |
| Disk | 10GB | For images, variable for data |

Monitor resource usage with:

```bash
docker stats
```

## Best Use Cases

CPU mode is appropriate for:

### Development and Testing
- Rapid iteration on features
- Unit and integration testing
- CI/CD pipelines
- Local development without GPU

### Low-Volume Production
- Small teams (fewer than 5 users)
- Infrequent video processing (fewer than 10 videos/day)
- Non-real-time workflows
- Budget-constrained deployments

### Environments Without GPU
- Cloud instances without GPU (cost savings)
- On-premise servers without NVIDIA hardware
- Kubernetes clusters on CPU-only nodes

## Limitations

Be aware of these CPU mode limitations:

- **Slower inference**: 5-10x slower than GPU mode
- **Limited throughput**: Processing queue backs up with heavy load
- **Model size constraints**: Large models may exceed available RAM
- **No real-time processing**: Not suitable for live video analysis

For production workloads with high volume or real-time requirements, see [GPU Mode](./gpu-mode.md).

## Troubleshooting

### Services Won't Start

Check Docker is running:

```bash
docker ps
```

Check logs for errors:

```bash
docker compose logs
```

### Model Service Out of Memory

Reduce model size in `model-service/config/models.yaml` or increase available RAM.

### Slow Performance

Ensure adequate resources:
- Close other applications
- Increase Docker memory limit in Docker Desktop
- Use minimal build mode for faster model loading

### Port Conflicts

Check for port conflicts:

```bash
lsof -i :5173
lsof -i :3001
lsof -i :8000
```

Kill conflicting processes or change ports in `docker-compose.yml`.

## Next Steps

- **[Build Modes](./build-modes.md)**: Understand minimal vs full builds
- **[Configuration](./configuration.md)**: Customize environment variables
- **[Common Tasks](../operations/common-tasks.md)**: Daily operations
- **[GPU Mode](./gpu-mode.md)**: Upgrade to GPU for better performance
