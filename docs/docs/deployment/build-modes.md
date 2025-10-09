---
sidebar_position: 6
title: Build Modes
description: Understanding minimal, recommended, and full build modes for the model service
keywords: [build, docker, models, vllm, sglang, minimal, full]
---

# Build Modes

The model service supports three build modes to balance features, build time, and image size. Choose the mode that best fits your development workflow and deployment requirements.

## Build Modes Comparison

| Aspect | Minimal | Recommended | Full |
|--------|---------|-------------|------|
| Build time | 1-2 min | 1-2 min | 10-15 min |
| Image size | 3-4GB | 3-4GB | 8-10GB |
| Inference engines | Basic | Basic | All engines |
| Quantization | No | Yes (bitsandbytes) | Yes |
| vLLM/SGLang | No | No | Yes |
| SAM-2 segmentation | No | No | Yes |
| Best for | Development, CI/CD | Development with optimization | Production |
| Platforms | CPU, GPU, ARM64 | CPU, GPU, ARM64 | GPU only (Linux) |

## Minimal Build

Minimal build includes only essential dependencies for basic functionality.

### Included Features

- PyTorch 2.5+
- Transformers 4.47+
- Ultralytics (YOLO detection)
- FastAPI
- Basic video processing (OpenCV)
- Standard tracking models

### Use Cases

- Fast iteration during development
- CI/CD pipelines with time constraints
- Testing basic functionality
- Limited disk space or bandwidth
- Quick experimentation

### Building Minimal Mode

```bash
# Default for CPU mode
docker compose build model-service

# Explicit minimal build
MODEL_BUILD_MODE=minimal docker compose build model-service

# GPU with minimal build
MODEL_BUILD_MODE=minimal docker compose --profile gpu build model-service-gpu
```

## Recommended Build

Recommended build adds quantization support for memory-efficient inference.

### Included Features

All minimal features plus:

- bitsandbytes for 4-bit and 8-bit quantization
- Reduced VRAM usage with quantized models
- Better memory efficiency

### Use Cases

- Development with model optimization
- Memory-constrained environments
- Testing quantization strategies
- Balanced performance and build time

### Building Recommended Mode

```bash
# CPU mode
MODEL_BUILD_MODE=recommended docker compose build model-service

# GPU mode
MODEL_BUILD_MODE=recommended docker compose --profile gpu build model-service-gpu
```

## Full Build

Full build includes all inference engines and features for production use.

### Included Features

All recommended features plus:

- vLLM 0.6+ for high-throughput LLM serving
- SGLang 0.4+ for structured generation
- SAM-2 for video segmentation
- All tracking models (SAMURAI, ByteTrack, BoT-SORT)
- Production-optimized inference

### Use Cases

- Production deployments
- Maximum feature set
- High-throughput inference
- Video segmentation tasks

### Requirements

- **GPU Required**: vLLM and SGLang require NVIDIA GPU with CUDA
- **Linux only**: Will not build on macOS or Windows
- **CUDA 11.8+**: Minimum CUDA version required
- **20GB disk space**: Large dependencies

### Building Full Mode

```bash
# GPU mode (default for GPU profile)
docker compose --profile gpu build model-service-gpu

# Explicit full build
MODEL_BUILD_MODE=full docker compose --profile gpu build model-service-gpu
```

**Note**: Full build will fail on CPU-only systems or macOS due to GPU-specific dependencies.

## Setting Build Mode

### Using Environment Variables

Set `MODEL_BUILD_MODE` before building:

```bash
# Minimal (default)
MODEL_BUILD_MODE=minimal docker compose build model-service

# Recommended
MODEL_BUILD_MODE=recommended docker compose build model-service

# Full (GPU only)
MODEL_BUILD_MODE=full docker compose --profile gpu build model-service-gpu
```

### Using .env File

Add to `.env`:

```bash
MODEL_BUILD_MODE=recommended
```

Then build:

```bash
docker compose build model-service
```

### Default Build Modes

Without explicit configuration:

- **CPU mode**: Uses minimal build
- **GPU mode**: Uses full build

## Switching Between Modes

To switch build modes, rebuild the service:

```bash
# Stop service
docker compose down

# Rebuild with new mode
MODEL_BUILD_MODE=recommended docker compose build model-service

# Start service
docker compose up -d
```

Data in volumes is preserved during rebuild.

## Build Mode Details

### Minimal Dependencies

```dockerfile
# Core packages (minimal mode)
torch==2.5.0
transformers==4.47.1
ultralytics
opencv-python
fastapi
```

### Recommended Dependencies

```dockerfile
# Minimal + quantization
bitsandbytes
accelerate
```

### Full Dependencies

```dockerfile
# Recommended + inference engines
vllm==0.6.0
sglang==0.4.0
sam2
supervision
```

## Platform Compatibility

| Build Mode | Linux CPU | Linux GPU | macOS | Windows |
|------------|-----------|-----------|-------|---------|
| Minimal | Yes | Yes | Yes | Yes* |
| Recommended | Yes | Yes | Yes | Yes* |
| Full | No | Yes | No | No |

*Windows requires WSL2 for Docker

## Build Time Optimization

### Use BuildKit

Enable BuildKit for faster builds:

```bash
export DOCKER_BUILDKIT=1
docker compose build
```

### Use Build Cache

BuildKit caches layers automatically. Subsequent builds are faster:

```bash
# First build: 10 minutes
docker compose --profile gpu build

# Rebuild after code change: 1-2 minutes
docker compose --profile gpu build
```

### Parallel Builds

Build multiple services in parallel:

```bash
docker compose build --parallel
```

## Troubleshooting

### Build Fails on macOS/Windows

If building full mode fails:

- **Solution**: Use minimal or recommended mode
- **Reason**: vLLM and SGLang require Linux + NVIDIA GPU
- **Alternative**: Build on Linux GPU instance or cloud

### Out of Disk Space

If build fails with disk space errors:

```bash
# Clean Docker cache
docker system prune -a

# Check available space
df -h
```

### Build Takes Too Long

If builds are slow:

- Use minimal mode for development
- Enable BuildKit caching
- Ensure adequate internet bandwidth for package downloads
- Use Docker layer caching in CI/CD

### ImportError After Switching Modes

If you see import errors after switching modes:

```bash
# Rebuild completely without cache
docker compose build --no-cache model-service

# Restart service
docker compose up -d model-service
```

## Recommendations by Use Case

### Local Development

- **Mode**: Minimal
- **Reason**: Fast builds, quick iteration
- **Command**: `docker compose up -d`

### Development with Optimization

- **Mode**: Recommended
- **Reason**: Test quantization without long builds
- **Command**: `MODEL_BUILD_MODE=recommended docker compose up -d --build`

### CI/CD Pipeline

- **Mode**: Minimal
- **Reason**: Minimize build time, test core functionality
- **Command**: `MODEL_BUILD_MODE=minimal docker compose build`

### Production Deployment

- **Mode**: Full (GPU only)
- **Reason**: All features, maximum performance
- **Command**: `docker compose --profile gpu up -d`

## Next Steps

- **[Configuration](./configuration.md)**: Configure model settings
- **[Service Architecture](./service-architecture.md)**: Understand service dependencies
- **[GPU Mode](./gpu-mode.md)**: Deploy with GPU acceleration
- **[Common Tasks](../operations/common-tasks.md)**: Daily operations
