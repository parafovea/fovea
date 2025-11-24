---
sidebar_position: 1
title: Deployment Overview
description: Overview of deployment options for FOVEA video annotation tool
keywords: [deployment, docker, cpu, gpu, installation]
---

# Deployment Overview

FOVEA supports multiple deployment options to accommodate different environments and use cases. This page provides an overview of available deployment methods and guidance on selecting the best option for your needs.

## Deployment Options

| Option | Setup Time | Performance | Best For |
|--------|------------|-------------|----------|
| Docker CPU (minimal) | 5 min | Moderate | Development, testing |
| Docker CPU (full) | 15 min | Good | Production without GPU |
| Docker GPU (minimal) | 10 min | Fast | Quick GPU testing |
| Docker GPU (full) | 20 min | Very Fast | Production with GPU |
| Manual setup | 30+ min | Variable | Custom deployments |

## When to Use Each Option

### Docker CPU Mode

Use CPU mode when:
- Developing locally without GPU hardware
- Running in CI/CD pipelines
- Deploying to systems without GPU access
- Processing fewer than 10 videos per day

CPU mode uses Docker Compose without GPU profiles and runs all inference on the CPU. Model loading and inference times are longer compared to GPU mode.

### Docker GPU Mode

Use GPU mode when:
- Deploying to production with NVIDIA GPU
- Processing many videos daily
- Requiring fast inference times (5-10x speedup)
- Running tracking or detection on high-resolution video

GPU mode requires NVIDIA Container Toolkit and CUDA-compatible GPU. Model inference runs on GPU with significantly reduced processing time.

### Minimal Build

Use minimal build when:
- Iterating quickly during development
- Testing basic functionality
- Working with limited disk space or bandwidth
- Building in CI/CD with time constraints

Minimal build includes PyTorch, Transformers, and Ultralytics but excludes vLLM, SGLang, and SAM-2. Build time is 1-2 minutes with image size around 3-4GB.

### Full Build

Use full build when:
- Deploying to production
- Requiring all AI features
- Using high-throughput inference engines (vLLM, SGLang)
- Needing video segmentation (SAM-2)

Full build includes all inference engines and models. Build time is 10-15 minutes with image size around 8-10GB. Requires GPU for some dependencies.

### Manual Setup

Use manual setup when:
- Customizing service configurations
- Debugging specific components
- Developing without Docker
- Running services individually

Manual setup requires installing Node.js, Python, PostgreSQL, and Redis manually.

## System Requirements Summary

### CPU Mode Minimum
- CPU: 4 cores
- RAM: 16GB
- Disk: 100GB

### CPU Mode Recommended
- CPU: 8 cores
- RAM: 32GB
- Disk: 500GB

### GPU Mode Minimum
- CPU: 8 cores
- RAM: 16GB
- NVIDIA GPU: 8GB VRAM (RTX 3070 or equivalent)
- Disk: 100GB

### GPU Mode Recommended
- CPU: 16 cores
- RAM: 32GB
- NVIDIA GPU: 24GB VRAM (RTX 4090, A100, or equivalent)
- Disk: 500GB

See [Prerequisites](./prerequisites.md) for detailed requirements and setup instructions.

## Quick Start Links

Choose your deployment path:

- **[Prerequisites](./prerequisites.md)**: System requirements and GPU setup
- **[Docker Quick Start](./docker-quickstart.md)**: Get running in 5 minutes
- **[CPU Mode](./cpu-mode.md)**: Detailed CPU deployment guide
- **[GPU Mode](./gpu-mode.md)**: Detailed GPU deployment guide
- **[Build Modes](./build-modes.md)**: Understanding minimal vs full builds
- **[Configuration](./configuration.md)**: Environment variables and settings
- **[Service Architecture](./service-architecture.md)**: Services, volumes, and networks

## Next Steps

After deployment:

1. Verify all services are running: `docker compose ps`
2. Access the frontend at http://localhost:3000 (port 5173 for manual dev setup)
3. Check service health endpoints
4. Review [Common Tasks](../operations/common-tasks.md) for daily operations
5. Configure [Monitoring](../operations/monitoring/overview.md) dashboards
