# syntax=docker/dockerfile:1.4
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
#   CPU build: docker build --build-arg DEVICE=cpu --build-arg BUILD_MODE=minimal -t fovea-model-service:cpu .
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

# Install Python 3.12 and system dependencies (retry apt-get update to handle transient mirror syncs)
RUN for i in 1 2 3; do apt-get update && break || { echo "apt-get update failed (attempt $i/3), retrying in 30s..."; sleep 30; }; done \
    && apt-get install -y \
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
ARG ENABLE_AUDIO=0
# BUILD_MODE options: minimal (base only), recommended (+ bitsandbytes), full (+ all inference engines)
# DEVICE options: cpu (local dev), gpu (production)
# ENABLE_AUDIO: when set to 1, pulls the `[audio]` extras (faster-whisper,
# pyannote.audio, torch-audiomentations, pydub, AssemblyAI/Deepgram/AWS
# SDKs) so the model-service can serve transcription, diarization, and
# voice activity detection. Off by default to keep image size down.

# Install Python and build tools
# - cmake is needed for llama-cpp-python on CPU
# - the whole apt-get update + install is retried, since the mirror flake
#   can hit either step (apt-get update succeeded but archive.ubuntu.com
#   was unreachable for the .deb fetches in CI on 2026-05-04).
RUN for i in 1 2 3; do \
        apt-get update && \
        apt-get install -y \
            python3 \
            python3-dev \
            python3-pip \
            git \
            build-essential \
            cmake \
            kmod && break || { echo "apt-get failed (attempt $i/3), retrying in 30s..."; sleep 30; }; \
    done \
    && rm -rf /var/lib/apt/lists/*

# Remove EXTERNALLY-MANAGED file
RUN rm -f /usr/lib/python*/EXTERNALLY-MANAGED

WORKDIR /app

# Copy project files
COPY pyproject.toml ./

# Install PyTorch based on device type (CPU or CUDA) with pip cache mount
# Retry up to 3 times to handle transient PyPI/PyTorch index mirror flakes that
# otherwise cause the release.yml model-service-cpu image build to fail.
RUN --mount=type=cache,target=/root/.cache/pip \
    for i in 1 2 3; do \
        if [ "$DEVICE" = "cpu" ]; then \
            pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu && break; \
        else \
            pip install --no-cache-dir torch torchvision && break; \
        fi; \
        echo "pip install torch failed (attempt $i/3), retrying in 30s..." && sleep 30; \
    done

# Install dependencies based on BUILD_MODE with pip cache mount; retry to
# survive transient PyPI mirror failures that previously broke release.yml.
RUN --mount=type=cache,target=/root/.cache/pip \
    for i in 1 2 3; do \
        ( if [ "$BUILD_MODE" = "full" ]; then \
              pip install --no-cache-dir -e ".[inference-engines]"; \
          elif [ "$BUILD_MODE" = "recommended" ]; then \
              pip install --no-cache-dir -e ".[recommended]"; \
          else \
              pip install --no-cache-dir -e .; \
          fi ) && \
        ( if [ "$DEVICE" = "cpu" ]; then \
              pip install --no-cache-dir -e ".[cpu]"; \
          fi ) && \
        ( if [ "$ENABLE_AUDIO" = "1" ]; then \
              # Several packages in the audio extras (torch-pitch-shift,
              # asteroid-filterbanks, older openai-whisper releases)
              # still import `pkg_resources` at setup time, but
              # setuptools >=81 removed that module. Pin setuptools to
              # the last release that ships pkg_resources before the
              # audio install so the wheel build doesn't blow up with
              # "ModuleNotFoundError: No module named 'pkg_resources'".
              # `--ignore-installed wheel` skips the Debian-shipped
              # wheel (which has no RECORD file and pip refuses to
              # uninstall), letting the newer wheel land alongside.
              pip install --no-cache-dir --ignore-installed wheel \
                  "setuptools<81" "wheel>=0.45" && \
              # Force CPU-only torch wheels before pulling audio extras
              # so `pyannote.audio` and `torch-audiomentations` don't
              # transitively reinstall the CUDA-enabled wheel (which
              # links libcudart.so at import time and crashes pyannote
              # / Silero VAD load on CPU-only hosts). The CUDA wheels
              # also bring in ~6 GB of nvidia-* dependencies that the
              # demo image has no use for.
              if [ "$DEVICE" = "cpu" ]; then \
                  # Install torch / torchvision / torchaudio together
                  # from PyTorch's CPU index so all three land at the
                  # same major and share an ABI. Letting pip choose
                  # versions within the CPU index keeps the trio
                  # current without dragging in the CUDA-flavored
                  # wheel (which links libcudart.so at import time
                  # and breaks pyannote / Silero VAD load on CPU-only
                  # hosts).
                  pip install --no-cache-dir \
                      --index-url https://download.pytorch.org/whl/cpu \
                      torch torchvision torchaudio; \
              fi && \
              # `--no-build-isolation` makes setup.py-driven packages
              # (notably openai-whisper, asteroid-filterbanks, and
              # torch-pitch-shift) reuse the venv's `setuptools<81`
              # instead of pulling the latest setuptools into a fresh
              # build env where `pkg_resources` is no longer shipped.
              pip install --no-cache-dir --no-build-isolation \
                  -e ".[audio]"; \
          fi ) && break; \
        echo "pip install -e failed (attempt $i/3), retrying in 30s..." && sleep 30; \
    done

# Production stage
FROM base AS production

ARG DEVICE=cpu

WORKDIR /app

# Copy installed packages from builder with link for better caching
COPY --link --from=builder-base /usr/local/lib/python3.12 /usr/local/lib/python3.12
COPY --link --from=builder-base /usr/local/bin /usr/local/bin

# Copy application code with link
COPY --link src ./src
COPY --link config ./config
COPY --link scripts ./scripts

# Create cache directories
RUN mkdir -p /models /videos

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV TRANSFORMERS_CACHE=/models
ENV HF_HOME=/models
# Create symlink to active model config based on DEVICE; override at runtime via env var
RUN if [ "$DEVICE" = "cpu" ]; then \
        ln -sf /app/config/models-cpu.yaml /app/config/active-models.yaml; \
    else \
        ln -sf /app/config/models.yaml /app/config/active-models.yaml; \
    fi
ENV MODEL_CONFIG_PATH=/app/config/active-models.yaml

# Optionally pre-download default models at build time
ARG PRELOAD_MODELS=false
RUN --mount=type=secret,id=hf_token,required=false \
    if [ "$PRELOAD_MODELS" = "true" ]; then \
        echo "Pre-downloading default models..." && \
        export HF_TOKEN=$(cat /run/secrets/hf_token 2>/dev/null || echo "") && \
        python scripts/preload_models.py --config /app/config/active-models.yaml --cache-dir /models; \
    else \
        echo "Skipping model pre-download (PRELOAD_MODELS=false)"; \
    fi

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Start FastAPI server
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
