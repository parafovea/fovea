---
title: Installation
sidebar_position: 1
---

# Installation

FOVEA (Flexible Ontology Visual Event Analyzer) is a web-based video annotation tool that runs in Docker containers. This guide will help you install and set up FOVEA on your system.

## Prerequisites

### Required Software

- **Docker Desktop** 4.0 or later ([download here](https://www.docker.com/products/docker-desktop/))
- **8GB RAM minimum** (16GB recommended for video processing)
- **10GB free disk space** (more if storing many videos)

### Optional (for GPU acceleration)

- NVIDIA GPU with CUDA support
- NVIDIA Docker runtime ([installation guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html))
- For production deployments with AI model inference

### Video Files

- Video files in MP4 format
- Accompanying metadata JSON files (`.info.json`)
- Place files in the `/data` directory

## Quick Install with Docker Compose

The fastest way to get FOVEA running is with Docker Compose:

```bash
# Clone the repository (if not already done)
git clone https://github.com/parafovea/fovea.git
cd fovea

# Start all services in CPU mode (default)
docker compose up
```

This command starts all required services:
- **Frontend**: React application on port 3000
- **Backend API**: Fastify server on port 3001
- **Model Service**: FastAPI AI service on port 8000 (CPU mode)
- **PostgreSQL**: Database on port 5432
- **Redis**: Job queue on port 6379
- **OpenTelemetry Collector**: Observability on port 4318
- **Prometheus**: Metrics storage on port 9090
- **Grafana**: Monitoring dashboards on port 3002

### Accessing the Application

Once all services are running, open your browser and navigate to:

```
http://localhost:3000
```

The default login credentials will be displayed in the terminal output on first run.

## GPU Mode Installation

For production deployments with NVIDIA GPUs, use the GPU profile:

```bash
docker compose --profile gpu up
```

This enables GPU-accelerated inference for:
- Video summarization with Vision Language Models
- Object detection and tracking
- Faster processing of large videos

:::note
GPU mode requires NVIDIA Docker runtime. See [GPU Mode Deployment](../deployment/gpu-mode.md) for detailed setup instructions.
:::

## Verify Installation

After starting the services, verify everything is working:

1. **Check service status**:
   ```bash
   docker compose ps
   ```
   All services should show "Up" status.

2. **Access the frontend**: Open http://localhost:3000

3. **Check backend health**: http://localhost:3001/health should return `{"status":"ok"}`

4. **Verify model service**: http://localhost:8000/docs should show FastAPI documentation

## Troubleshooting Common Issues

### Port Already in Use

If you see "port is already allocated" errors:

```bash
# Find and stop the conflicting process
lsof -i :3000  # Replace 3000 with the conflicting port
kill <PID>
```

Or change the port mapping in `docker-compose.yml`.

### Out of Memory Errors

If containers crash with OOM errors:

1. Increase Docker Desktop memory limit (Preferences > Resources > Memory)
2. Set to at least 8GB, preferably 16GB
3. Restart Docker Desktop

### Database Connection Errors

If the backend cannot connect to PostgreSQL:

```bash
# Restart the PostgreSQL container
docker compose restart postgres

# Check PostgreSQL logs
docker compose logs postgres
```

### Model Service Fails to Start

If the AI model service crashes on startup:

1. Check if you have enough disk space (models are large)
2. Verify you're using CPU mode if no GPU is available
3. Check logs: `docker compose logs model-service`

For more troubleshooting help, see [Common Issues](../operations/troubleshooting/common-issues.md).

## Next Steps

- [Quick Start Guide](./quick-start.md): Annotate your first video in 5 minutes
- [Manual Setup](./manual-setup.md): Development environment setup for contributors
- [First Video Tutorial](./first-video.md): Working with your own video files
