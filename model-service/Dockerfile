# Multi-stage Dockerfile for fovea model service
#
# Build Arguments:
#   DEVICE: Hardware target (default: cpu)
#     - cpu: Local development on macOS/Linux without GPU
#     - gpu: Production deployment with NVIDIA GPU + CUDA support
#
#   BUILD_MODE: Feature set to include (default: minimal)
#     - minimal: Base dependencies only (PyTorch CPU, Transformers, Ultralytics, FastAPI)
#               Build time: ~1-2 minutes | Image size: ~3-4GB
#     - recommended: Base + bitsandbytes for model quantization
#               Build time: ~1-2 minutes | Image size: ~3-4GB
#     - full: All features including vLLM, SGLang, SAM-2 inference engines
#               Build time: ~10-15 minutes | Image size: ~8-10GB
#               NOTE: Requires DEVICE=gpu, will fail on CPU/ARM64
#
# Examples:
#   docker build --build-arg DEVICE=cpu --build-arg BUILD_MODE=minimal .
#   docker build --build-arg DEVICE=cpu --build-arg BUILD_MODE=recommended .
#   docker build --build-arg DEVICE=gpu --build-arg BUILD_MODE=full .
#
# Docker Compose:
#   export MODEL_DEVICE=cpu MODEL_BUILD_MODE=minimal
#   docker compose build model-service

# Build argument for CPU vs GPU
ARG DEVICE=cpu
# Options: cpu (for local dev without GPU), gpu (for production with NVIDIA GPU)

# Base stage - CPU version
FROM ubuntu:24.04 AS base-cpu

# Base stage - GPU version with CUDA support
FROM nvidia/cuda:12.6.0-cudnn-runtime-ubuntu24.04 AS base-gpu

# Select base based on DEVICE argument
FROM base-${DEVICE} AS base

# Install Python 3.12 and system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-dev \
    python3-pip \
    git \
    curl \
    ffmpeg \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Create python symlink (python3 is already 3.12 on Ubuntu 24.04)
RUN ln -s /usr/bin/python3 /usr/bin/python

# Remove EXTERNALLY-MANAGED file to allow pip installs (safe in Docker)
RUN rm -f /usr/lib/python*/EXTERNALLY-MANAGED

# Build stage with development tools for compiling Python packages
# Builder for CPU
FROM ubuntu:24.04 AS builder-cpu

# Builder for GPU
FROM nvidia/cuda:12.6.0-cudnn-devel-ubuntu24.04 AS builder-gpu

# Select builder based on DEVICE argument
FROM builder-${DEVICE} AS builder-base

# Build argument for deployment mode
ARG BUILD_MODE=minimal
ARG DEVICE=cpu
# BUILD_MODE options: minimal (base only), recommended (+ bitsandbytes), full (+ all inference engines)
# DEVICE options: cpu (local dev), gpu (production)

# Install Python and build tools
RUN apt-get update && apt-get install -y \
    python3 \
    python3-dev \
    python3-pip \
    git \
    build-essential \
    kmod \
    && rm -rf /var/lib/apt/lists/*

# Remove EXTERNALLY-MANAGED file
RUN rm -f /usr/lib/python*/EXTERNALLY-MANAGED

WORKDIR /app

# Copy project files
COPY pyproject.toml ./

# Install PyTorch based on device type (CPU or CUDA)
RUN if [ "$DEVICE" = "cpu" ]; then \
        pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu; \
    else \
        pip install --no-cache-dir torch torchvision; \
    fi

# Install dependencies based on BUILD_MODE
RUN if [ "$BUILD_MODE" = "full" ]; then \
        pip install --no-cache-dir -e ".[inference-engines]"; \
    elif [ "$BUILD_MODE" = "recommended" ]; then \
        pip install --no-cache-dir -e ".[recommended]"; \
    else \
        pip install --no-cache-dir -e .; \
    fi

# Production stage
FROM base AS production

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder-base /usr/local/lib/python3.12 /usr/local/lib/python3.12
COPY --from=builder-base /usr/local/bin /usr/local/bin

# Copy application code
COPY src ./src
COPY config ./config

# Create cache directories
RUN mkdir -p /models /videos

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV TRANSFORMERS_CACHE=/models
ENV HF_HOME=/models

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Start FastAPI server
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
