---
title: Configuration
---

# Model Service Configuration

The model service uses `config/models.yaml` to define available models, inference settings, and hardware allocation. Configuration determines which models load and how they run.

## Configuration File Structure

The configuration file has two main sections:

```yaml
models:
  # Task-specific model definitions
  video_summarization:
    selected: "model-name"
    options: {...}

inference:
  # Global inference settings
  max_memory_per_model: "auto"
  offload_threshold: 0.85
```

### Models Section

Defines available models for each task type. Each task has:

- `selected`: Currently active model
- `options`: Available model configurations

### Inference Section

Global settings for model loading and memory management:

- `max_memory_per_model`: VRAM limit per model
- `offload_threshold`: Memory usage trigger for CPU offloading
- `warmup_on_startup`: Load models at startup (default: false)
- `default_batch_size`: Batch size for inference
- `max_batch_size`: Maximum batch size allowed

## Task Types

### Video Summarization

VLM models for video frame analysis and description generation.

```yaml
video_summarization:
  selected: "llama-4-maverick"
  options:
    llama-4-maverick:
      model_id: "meta-llama/Llama-4-Maverick"
      quantization: "4bit"
      framework: "sglang"
      vram_gb: 62
      speed: "fast"
      description: "MoE model with 17B active parameters, multimodal, 10M context"
```

**Available models**:

| Model | VRAM (4-bit) | Speed | Context Length | Notes |
|-------|--------------|-------|----------------|-------|
| llama-4-maverick | 62 GB | Fast | 10M tokens | MoE with 17B active params |
| gemma-3-27b | 14 GB | Very fast | 8K tokens | Document analysis, OCR |
| internvl3-78b | 40 GB | Medium | 32K tokens | High accuracy benchmarks |
| pixtral-large | 62 GB | Medium | 128K tokens | Long context processing |
| qwen2-5-vl-72b | 36 GB | Fast | 32K tokens | Stable baseline model |

### Ontology Augmentation

LLM models for generating ontology suggestions.

```yaml
ontology_augmentation:
  selected: "llama-4-scout"
  options:
    llama-4-scout:
      model_id: "meta-llama/Llama-4-Scout"
      quantization: "4bit"
      framework: "sglang"
      vram_gb: 55
      speed: "very_fast"
      description: "MoE model with 17B active, 10M context, multimodal"
```

**Available models**:

| Model | VRAM (4-bit) | Speed | Context Length | Notes |
|-------|--------------|-------|----------------|-------|
| llama-4-scout | 55 GB | Very fast | 10M tokens | MoE, multimodal capable |
| llama-3-3-70b | 35 GB | Fast | 128K tokens | Matches 405B quality |
| deepseek-v3 | 85 GB | Fast | 128K tokens | MoE, 37B active params |
| gemma-3-27b-text | 14 GB | Very fast | 8K tokens | Lightweight, fast iteration |

### Object Detection

Models for detecting and localizing objects in video frames.

```yaml
object_detection:
  selected: "yolo-world-v2"
  options:
    yolo-world-v2:
      model_id: "ultralytics/yolo-world-v2-l"
      framework: "pytorch"
      vram_gb: 2
      speed: "real_time"
      fps: 52
      description: "Speed and accuracy balance, image prompts"
```

**Available models**:

| Model | VRAM | FPS (GPU) | Type | Notes |
|-------|------|-----------|------|-------|
| yolo-world-v2 | 2 GB | 52 | Open-world | Image prompt support |
| grounding-dino-1-5 | 4 GB | 20 | Zero-shot | Text prompt, 52.5 AP |
| owlv2 | 6 GB | 15 | Zero-shot | Rare class detection |
| florence-2 | 2 GB | 30 | Unified | Captioning support |

### Video Tracking

Models for tracking objects across multiple frames.

```yaml
video_tracking:
  selected: "samurai"
  options:
    samurai:
      model_id: "yangchris11/samurai"
      framework: "pytorch"
      vram_gb: 3
      speed: "real_time"
      description: "Motion-aware, occlusion handling, 7.1% better"
```

**Available models**:

| Model | VRAM | Speed | Notes |
|-------|------|-------|-------|
| samurai | 3 GB | Real-time | Motion-aware, occlusion handling |
| sam2long | 3 GB | Real-time | Long video support, error correction |
| sam2-1 | 3 GB | Real-time | Baseline SAM2 model |
| yolo11n-seg | 1 GB | Very fast | Lightweight segmentation |

## Model Selection Strategies

### Automatic Selection (Default)

The service uses the `selected` field for each task type.

```yaml
video_summarization:
  selected: "gemma-3-27b"  # This model loads automatically
```

When a request arrives:
1. Service reads `selected` field
2. Loads model if not already cached
3. Performs inference
4. Keeps model in memory for future requests

### Manual Selection

Override the default model per request using the `model` parameter:

```bash
curl -X POST http://localhost:8000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/example.mp4",
    "model": "qwen2-5-vl-72b",
    "frame_count": 8
  }'
```

This loads `qwen2-5-vl-72b` instead of the configured default.

### Switching Models

To permanently switch models:

1. Edit `config/models.yaml`:
```yaml
video_summarization:
  selected: "qwen2-5-vl-72b"  # Changed from gemma-3-27b
```

2. Restart the service:
```bash
docker compose restart model-service
```

The new model loads on the next inference request.

## Device Configuration

### Environment Variables

**DEVICE**: Target device for inference

```bash
# CPU mode
export DEVICE=cpu

# CUDA GPU mode
export DEVICE=cuda

# Specific GPU
export DEVICE=cuda:0

# Apple Silicon (experimental)
export DEVICE=mps
```

**CUDA_VISIBLE_DEVICES**: Control GPU visibility

```bash
# Use only GPU 0
export CUDA_VISIBLE_DEVICES=0

# Use GPUs 0 and 1
export CUDA_VISIBLE_DEVICES=0,1

# Use all GPUs
export CUDA_VISIBLE_DEVICES=0,1,2,3
```

**BUILD_MODE**: Build profile selection

```bash
# Minimal build (PyTorch only, fast builds)
export BUILD_MODE=minimal

# Recommended build (adds bitsandbytes)
export BUILD_MODE=recommended

# Full build (adds vLLM, SGLang, requires GPU)
export BUILD_MODE=full
```

### Docker Compose Configuration

Set device in `.env` file:

```bash
# For CPU development
DEVICE=cpu
BUILD_MODE=minimal

# For GPU production
DEVICE=cuda
BUILD_MODE=full
CUDA_VISIBLE_DEVICES=0,1,2,3
```

Start with appropriate profile:

```bash
# CPU mode
docker compose up

# GPU mode
docker compose --profile gpu up
```

## Memory Requirements

### VRAM Requirements by Model

Full precision (FP16/BF16):

| Model | VRAM |
|-------|------|
| Llama-4-Maverick | 240 GB |
| Llama-4-Scout | 220 GB |
| DeepSeek-V3 | 340 GB |
| InternVL3-78B | 156 GB |
| Qwen2.5-VL-72B | 144 GB |
| Llama-3.3-70B | 140 GB |
| Gemma-3-27b | 54 GB |

4-bit quantization (AWQ/GPTQ):

| Model | VRAM | Reduction |
|-------|------|-----------|
| Llama-4-Maverick | 62 GB | 74% |
| Llama-4-Scout | 55 GB | 75% |
| DeepSeek-V3 | 85 GB | 75% |
| InternVL3-78B | 40 GB | 74% |
| Qwen2.5-VL-72B | 36 GB | 75% |
| Llama-3.3-70B | 35 GB | 75% |
| Gemma-3-27b | 14 GB | 74% |

Detection and tracking models use 1-6 GB regardless of quantization.

### RAM Requirements

| Mode | Minimum | Recommended |
|------|---------|-------------|
| CPU | 16 GB | 32 GB |
| GPU | 32 GB | 64 GB |

CPU mode requires extra RAM for model weights when VRAM unavailable.

## Model Caching

### Cache Directory Structure

Models download to cache directories:

```
~/.cache/huggingface/hub/
├── models--meta-llama--Llama-4-Maverick/
│   └── snapshots/
│       └── abc123def456/
│           ├── config.json
│           ├── model-00001-of-00005.safetensors
│           └── tokenizer.json
├── models--ultralytics--yolo-world-v2-l/
│   └── snapshots/
│       └── def789ghi012/
│           └── yolo_world_v2_l.pt
```

### Environment Variables

**TRANSFORMERS_CACHE**: HuggingFace cache location

```bash
export TRANSFORMERS_CACHE=/path/to/cache
```

**HF_HOME**: Alternative cache location

```bash
export HF_HOME=/mnt/models
```

**MODEL_CACHE_DIR**: Service-specific cache

```bash
export MODEL_CACHE_DIR=/data/model-cache
```

### Cache Behavior

**First run**: Models download from HuggingFace Hub. This requires internet and takes 5-60 minutes depending on model size.

**Subsequent runs**: Models load from local cache in seconds.

**Shared cache**: Multiple services can share the same cache directory.

### Clearing Cache

Remove specific model:

```bash
rm -rf ~/.cache/huggingface/hub/models--meta-llama--Llama-4-Maverick
```

Clear entire cache:

```bash
rm -rf ~/.cache/huggingface/hub/
```

Note: Models re-download on next use.

## Build Profiles

### Minimal Profile

**Purpose**: Fast builds for development and CI/CD

**Includes**:
- PyTorch 2.5+
- Transformers 4.47+
- Ultralytics (YOLO)
- FastAPI
- OpenCV

**Excludes**:
- vLLM
- SGLang
- SAM-2
- bitsandbytes

**Build time**: 1-2 minutes

**Use when**:
- Developing API endpoints
- Testing business logic
- Running CI/CD pipelines
- CPU-only environments

### Recommended Profile

**Purpose**: Development with model optimization

**Includes**:
- All minimal components
- bitsandbytes (4-bit/8-bit quantization)

**Excludes**:
- vLLM
- SGLang
- SAM-2

**Build time**: 1-2 minutes

**Use when**:
- GPU available but limited VRAM
- Need quantization for lighter models
- Development with actual inference

### Full Profile

**Purpose**: Production deployment with all features

**Includes**:
- All recommended components
- vLLM 0.6+ (LLM serving)
- SGLang 0.4+ (structured generation)
- SAM-2 (segmentation)

**Build time**: 10-15 minutes

**Image size**: 8-10 GB

**Use when**:
- Production GPU deployment
- Need all model types
- Performance critical workloads

## Adding Custom Models

### Step 1: Add to Configuration

Edit `config/models.yaml`:

```yaml
video_summarization:
  options:
    my-custom-model:
      model_id: "organization/model-name"
      quantization: "4bit"
      framework: "sglang"
      vram_gb: 20
      speed: "fast"
      description: "Custom model for specific use case"
```

### Step 2: Set as Selected

```yaml
video_summarization:
  selected: "my-custom-model"
```

### Step 3: Verify Model ID

Ensure model exists on HuggingFace Hub:

```bash
curl https://huggingface.co/api/models/organization/model-name
```

### Step 4: Test Loading

Restart service and check logs:

```bash
docker compose restart model-service
docker compose logs -f model-service
```

Look for:
```
INFO: Loading model organization/model-name
INFO: Model loaded successfully in 15.3s
```

### Step 5: Test Inference

```bash
curl -X POST http://localhost:8000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/test.mp4",
    "model": "my-custom-model",
    "frame_count": 4
  }'
```

## Inference Settings

### Max Memory Per Model

Controls VRAM allocation per model:

```yaml
inference:
  max_memory_per_model: "auto"  # Automatic allocation
  # or
  max_memory_per_model: "20GB"  # Fixed limit
```

**auto**: Service calculates based on available VRAM and model requirements.

**Fixed value**: Hard limit in GB. Model loading fails if exceeded.

### Offload Threshold

Triggers CPU offloading when VRAM usage exceeds threshold:

```yaml
inference:
  offload_threshold: 0.85  # 85% VRAM usage
```

When VRAM usage exceeds 85%:
1. Service identifies least recently used model
2. Offloads model layers to CPU RAM
3. Frees VRAM for new models

### Warmup on Startup

Load models at service startup instead of on first request:

```yaml
inference:
  warmup_on_startup: true
```

**Advantages**:
- Faster first request
- Validate models at startup
- Detect configuration errors early

**Disadvantages**:
- Slower startup time (30-60 seconds)
- VRAM allocated immediately
- Not suitable for CPU mode

**When to use**: Production GPU deployments with predictable model usage.

### Batch Size

Control batch processing:

```yaml
inference:
  default_batch_size: 1
  max_batch_size: 8
```

**default_batch_size**: Batch size when not specified in request.

**max_batch_size**: Maximum allowed batch size. Requests exceeding this split into multiple batches.

Example batch request:

```bash
curl -X POST http://localhost:8000/api/detect \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/example.mp4",
    "frame_numbers": [0, 10, 20, 30, 40, 50, 60, 70],
    "batch_size": 4
  }'
```

Processes frames in 2 batches of 4.

## Troubleshooting

### Model Not Found

**Symptom**: Error "Model organization/model-name not found"

**Causes**:
- Typo in model_id
- Model not on HuggingFace Hub
- Private model without authentication

**Solutions**:

1. Verify model ID:
```bash
curl https://huggingface.co/api/models/organization/model-name
```

2. Check for typos in config.

3. Add HuggingFace token for private models:
```bash
export HF_TOKEN=hf_xxxxxxxxxxxxx
```

### Quantization Error

**Symptom**: Error "bitsandbytes not installed"

**Cause**: Using `quantization: "4bit"` with minimal build profile.

**Solutions**:

1. Use recommended or full build profile:
```bash
BUILD_MODE=recommended docker compose build model-service
```

2. Or remove quantization:
```yaml
quantization: null  # Use full precision
```

### VRAM Limit Exceeded

**Symptom**: Error "CUDA out of memory"

**Causes**:
- Model too large for GPU
- Multiple models loaded
- Batch size too large

**Solutions**:

1. Enable quantization:
```yaml
quantization: "4bit"
```

2. Reduce max_memory_per_model:
```yaml
max_memory_per_model: "10GB"
```

3. Lower offload_threshold:
```yaml
offload_threshold: 0.7  # Offload earlier
```

4. Use smaller model:
```yaml
video_summarization:
  selected: "gemma-3-27b"  # Only 14GB
```

### Slow Model Loading

**Symptom**: Model takes 5+ minutes to load

**Causes**:
- Downloading from HuggingFace Hub
- Slow disk I/O
- Large model size

**Solutions**:

1. Pre-download models:
```bash
python -c "
from transformers import AutoModel
AutoModel.from_pretrained('meta-llama/Llama-4-Maverick')
"
```

2. Use faster storage for cache (NVMe SSD).

3. Use HuggingFace CDN mirror if available.

4. Enable warmup_on_startup to load during service initialization.

## Next Steps

- [Use video summarization](./video-summarization.md)
- [Configure object detection](./object-detection.md)
- [Set up video tracking](./video-tracking.md)
- [Enable ontology augmentation](./ontology-augmentation.md)
- [Return to overview](./overview.md)
