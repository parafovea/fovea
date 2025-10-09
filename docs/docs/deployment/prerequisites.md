---
sidebar_position: 2
title: Prerequisites
description: System requirements and software prerequisites for FOVEA deployment
keywords: [prerequisites, requirements, gpu, nvidia, docker, system requirements]
---

# Prerequisites

This page lists all hardware and software requirements for deploying FOVEA. Review these prerequisites before proceeding with installation.

## Hardware Requirements

### CPU Mode Minimum

- **CPU**: 4 cores
- **RAM**: 16GB
- **Disk**: 100GB free space

Minimum configuration for running all services (PostgreSQL, Redis, Backend, Frontend, Model Service) in Docker.

### CPU Mode Recommended

- **CPU**: 8 cores
- **RAM**: 32GB
- **Disk**: 500GB free space

Recommended for active development and production deployments without GPU.

### GPU Mode Minimum

- **CPU**: 8 cores
- **RAM**: 16GB
- **NVIDIA GPU**: 8GB VRAM (RTX 3070 or equivalent)
- **Disk**: 100GB free space

Minimum configuration for GPU-accelerated inference.

### GPU Mode Recommended

- **CPU**: 16 cores
- **RAM**: 32GB
- **NVIDIA GPU**: 24GB VRAM (RTX 4090, A100, or equivalent)
- **Disk**: 500GB free space

Recommended for production deployments with full feature set.

## Software Requirements

### Required for All Deployments

- **Docker Engine**: 24.0 or later
  - Ensure BuildKit support is enabled
  - Check version: `docker --version`

- **Docker Compose**: 2.20 or later
  - Compose Spec compatible (v2.x required, not v1.x)
  - Check version: `docker compose version`

### Required for GPU Mode Only

- **NVIDIA Driver**: 525.60 or later
  - Check version: `nvidia-smi`

- **CUDA Toolkit**: 11.8 or later
  - Required for GPU-accelerated inference

- **NVIDIA Container Toolkit** (nvidia-docker2)
  - Enables GPU access from Docker containers

## Network Requirements

### Required Ports

The following ports must be available on the host:

- **5173**: Frontend (Vite development server)
- **3001**: Backend API
- **8000**: Model service API

### Optional Ports

These ports are used for monitoring and observability:

- **3002**: Grafana dashboards
- **9090**: Prometheus metrics
- **4317**: OpenTelemetry Collector (gRPC)
- **4318**: OpenTelemetry Collector (HTTP)
- **8889**: OTEL Collector metrics endpoint

### Internet Access

Internet access is required for:
- Downloading Docker images from Docker Hub
- Pulling AI models from HuggingFace on first run
- Installing dependencies during build

## GPU Setup

GPU mode requires NVIDIA GPU with CUDA support. Follow these steps to set up GPU access for Docker.

### Step 1: Install NVIDIA Driver

#### Ubuntu 22.04

```bash
sudo apt update
sudo apt install nvidia-driver-525
```

#### Verify Installation

```bash
nvidia-smi
```

Expected output shows GPU information, driver version, and CUDA version.

### Step 2: Install CUDA Toolkit

#### Ubuntu 22.04

```bash
# Add CUDA repository
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-ubuntu2204.pin
sudo mv cuda-ubuntu2204.pin /etc/apt/preferences.d/cuda-repository-pin-600

# Add CUDA GPG key
sudo apt-key adv --fetch-keys https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/3bf863cc.pub

# Add CUDA repository
sudo add-apt-repository "deb https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/ /"

# Install CUDA 11.8
sudo apt update
sudo apt install cuda-11-8
```

#### Verify Installation

```bash
nvcc --version
```

### Step 3: Install NVIDIA Container Toolkit

#### Ubuntu 22.04

```bash
# Get distribution information
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)

# Add NVIDIA Container Toolkit repository
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# Install nvidia-docker2
sudo apt update
sudo apt install nvidia-docker2

# Restart Docker to apply changes
sudo systemctl restart docker
```

#### Verify Docker GPU Access

```bash
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi
```

This should display GPU information from inside a Docker container. If successful, GPU setup is complete.

### Alternative Distributions

For other Linux distributions, see:
- [NVIDIA CUDA Installation Guide](https://docs.nvidia.com/cuda/cuda-installation-guide-linux/)
- [NVIDIA Container Toolkit Installation Guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)

### macOS and Windows

GPU mode is not supported on macOS or Windows due to limitations of NVIDIA CUDA:
- **macOS**: No NVIDIA CUDA support (even with eGPU)
- **Windows**: GPU passthrough to Docker Desktop is limited and not recommended

For development on these platforms, use CPU mode or deploy to a Linux instance with GPU.

## Verification Steps

Before proceeding with deployment, verify all prerequisites are met.

### Verify Docker

```bash
docker --version
docker compose version
```

Expected:
- Docker Engine 24.0 or later
- Docker Compose 2.20 or later

### Verify Docker is Running

```bash
docker ps
```

Should return a list of containers (may be empty) without errors.

### Verify GPU Access (GPU Mode Only)

```bash
# Check NVIDIA driver
nvidia-smi

# Check CUDA
nvcc --version

# Check Docker GPU access
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi
```

All commands should complete successfully and display version information.

### Verify Network Ports

```bash
# Check if required ports are available
lsof -i :5173
lsof -i :3001
lsof -i :8000
```

If any port is in use, stop the conflicting service or change FOVEA port configuration.

### Verify Disk Space

```bash
df -h
```

Ensure at least 100GB free for CPU mode or 500GB free for production deployments.

## Common Issues

### Docker Permission Denied

If you see "permission denied" errors when running Docker commands:

```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Log out and back in for changes to take effect
# Or run:
newgrp docker
```

### NVIDIA Driver Not Found

If `nvidia-smi` fails after installation:

```bash
# Check if driver is loaded
lsof /dev/nvidia*

# Reboot system
sudo reboot
```

### CUDA Toolkit Version Mismatch

Ensure CUDA Toolkit version is compatible with NVIDIA driver:

```bash
# Check driver CUDA version (shown by nvidia-smi)
nvidia-smi

# Check toolkit version
nvcc --version
```

Toolkit version must not exceed driver CUDA version.

## Next Steps

Once all prerequisites are met:

1. **Quick Start**: [Docker Quick Start](./docker-quickstart.md) for immediate deployment
2. **CPU Mode**: [CPU Mode Guide](./cpu-mode.md) for detailed CPU deployment
3. **GPU Mode**: [GPU Mode Guide](./gpu-mode.md) for detailed GPU deployment
