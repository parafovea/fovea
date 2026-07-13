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
#     - recommended: Base + bitsandbytes for model quantization
#     - full: All features including vLLM, SGLang, SAM-2 inference engines
#               NOTE: Requires DEVICE=gpu, will fail on CPU/ARM64
#
# Python: the model-service requires Python 3.14 (pyproject.toml declares
# requires-python >=3.14). The CPU stages build on the official
# python:3.14-slim-bookworm image; the GPU stages install python3.14 from the
# deadsnakes PPA on top of the CUDA base. On 3.14 the cpu extra's
# llama-cpp-python has no cp314 wheel and SOURCE-BUILDS via cmake + the C/C++
# toolchain installed in the builder stage, which adds a few minutes to the
# CPU build; the python_version < '3.14'-gated extras (vLLM, SGLang,
# openai-whisper, bitsandbytes, SAM-2) are skipped automatically by pip.
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

# Base stage - CPU version.
# The official python:3.14 slim image ships the 3.14 interpreter, pip, and the
# C headers under /usr/local, so no separate Python install is needed here.
FROM python:3.14-slim-bookworm AS base-cpu

# Base stage - GPU version with CUDA support.
# Ubuntu 24.04 ships Python 3.12 as its system python3; the deadsnakes PPA
# provides the 3.14 interpreter the model-service requires. Repoint
# python/python3 at 3.14 and bootstrap pip with ensurepip so the runtime
# stage runs 3.14.
FROM nvidia/cuda:12.6.0-cudnn-runtime-ubuntu24.04 AS base-gpu
RUN for i in 1 2 3; do \
        apt-get update && \
        apt-get install -y software-properties-common && break || \
        { echo "apt-get failed (attempt $i/3), retrying in 30s..."; sleep 30; }; \
    done \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y python3.14 python3.14-venv \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.14 /usr/bin/python3 \
    && ln -sf /usr/bin/python3.14 /usr/bin/python \
    && rm -f /usr/lib/python*/EXTERNALLY-MANAGED \
    && python3.14 -m ensurepip --upgrade

# Select base based on DEVICE argument
FROM base-${DEVICE} AS base

# Install the runtime OS dependencies (Python itself comes from the
# device-specific base above). Retry apt-get update to handle transient
# mirror syncs.
RUN for i in 1 2 3; do apt-get update && break || { echo "apt-get update failed (attempt $i/3), retrying in 30s..."; sleep 30; }; done \
    && apt-get install -y \
    git \
    curl \
    ffmpeg \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Build stage with development tools for compiling Python packages
# Builder for CPU
FROM python:3.14-slim-bookworm AS builder-cpu

# Builder for GPU: CUDA devel base + deadsnakes python3.14 (with headers).
FROM nvidia/cuda:12.6.0-cudnn-devel-ubuntu24.04 AS builder-gpu
RUN for i in 1 2 3; do \
        apt-get update && \
        apt-get install -y software-properties-common && break || \
        { echo "apt-get failed (attempt $i/3), retrying in 30s..."; sleep 30; }; \
    done \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y python3.14 python3.14-dev python3.14-venv \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.14 /usr/bin/python3 \
    && ln -sf /usr/bin/python3.14 /usr/bin/python \
    && rm -f /usr/lib/python*/EXTERNALLY-MANAGED \
    && python3.14 -m ensurepip --upgrade

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

# Install the C/C++ build toolchain shared by both device variants. Python
# itself comes from the device-specific builder base above (official
# python:3.14 image for CPU, deadsnakes python3.14 for the CUDA GPU base).
# - build-essential + cmake are required to SOURCE-BUILD llama-cpp-python (the
#   cpu extra), which ships no cp314 wheel and compiles against the 3.14 headers.
# - the whole apt-get update + install is retried, since the mirror flake
#   can hit either step (apt-get update succeeded but archive.ubuntu.com
#   was unreachable for the .deb fetches in CI on 2026-05-04).
RUN for i in 1 2 3; do \
        apt-get update && \
        apt-get install -y \
            git \
            build-essential \
            cmake \
            kmod && break || { echo "apt-get failed (attempt $i/3), retrying in 30s..."; sleep 30; }; \
    done \
    && rm -rf /var/lib/apt/lists/*

# Force g++ as the C++ compiler for every CMake source build (scikit-build-core
# reads CMAKE_ARGS). On 3.14 llama-cpp-python (the cpu extra) has no cp314 wheel
# and source-builds its ggml C++ libraries; if CMake instead selects gcc as the
# CXX compiler the final link omits libstdc++, and the resulting
# libggml-base.so fails to load at import with
# "undefined symbol: _ZTVN10__cxxabiv117__class_type_infoE". Pinning the
# compilers keeps the link correct and is a no-op where g++ is already the default.
ENV CMAKE_ARGS="-DCMAKE_C_COMPILER=gcc -DCMAKE_CXX_COMPILER=g++"

WORKDIR /app

# Copy project files
COPY pyproject.toml ./

# Install PyTorch based on device type (CPU or CUDA) with pip cache mount. The
# PyTorch CPU index serves cp314 wheels, so torch/torchvision resolve without a
# source build on 3.14. Retry up to 3 times to handle transient PyPI/PyTorch
# index mirror flakes that otherwise cause the release.yml model-service-cpu
# image build to fail.
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

# Copy the installed 3.14 site-packages and entry-point scripts from the
# builder. For the CPU image this is python:3.14-slim's
# /usr/local/lib/python3.14/site-packages; for the GPU image it is the
# deadsnakes /usr/local/lib/python3.14/dist-packages. The runtime base
# provides the matching 3.14 interpreter + stdlib.
COPY --link --from=builder-base /usr/local/lib/python3.14 /usr/local/lib/python3.14
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
