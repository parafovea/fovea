---
title: Overview
---

# Model Service Overview

The model service provides AI inference capabilities for video analysis, object detection, tracking, and ontology augmentation. Built with FastAPI, PyTorch, and Transformers, it supports both CPU and GPU execution.

## Architecture

The model service uses a layered architecture:

```
FastAPI Application Layer
    ↓
Model Manager (Lazy Loading)
    ↓
Inference Engines (SGLang, vLLM, PyTorch)
    ↓
Model Weights Cache
```

### Core Components

**FastAPI Application** (`src/main.py`): HTTP API server handling requests and responses.

**Model Manager** (`src/model_manager.py`): Lazy model loading and memory management. Models load on first use, not at startup.

**Inference Engines**:
- SGLang: Primary engine for LLM and VLM inference
- vLLM: Fallback engine for high-throughput LLM serving
- PyTorch: Direct inference for detection and tracking models

**Configuration** (`config/models.yaml`): Model selection and parameters.

### Lazy Loading System

Models load only when needed. This approach:

- Reduces startup time from minutes to seconds
- Allows running without GPU during development
- Enables selective model loading based on usage
- Conserves VRAM by loading models on demand

Example: A video summarization request triggers VLM loading, but detection models remain unloaded until needed.

## Available Tasks

### Video Summarization

VLM-based analysis generates text descriptions from video frames.

**Endpoint**: `POST /api/summarize`

**Models**: Llama-4-Maverick, Gemma-3-27b, InternVL3-78B, Pixtral-Large, Qwen2.5-VL-72B

**Use cases**:
- Generate video summaries for annotation context
- Extract text from video frames (OCR)
- Identify key events in footage

See [Video Summarization](./video-summarization.md) for details.

### Object Detection

Detect and localize objects in video frames.

**Endpoint**: `POST /api/detect`

**Models**: YOLO-World-v2, GroundingDINO 1.5, OWLv2, Florence-2

**Use cases**:
- Initialize bounding boxes for annotation
- Detect specific object classes (COCO dataset)
- Zero-shot detection with text prompts

See [Object Detection](./object-detection.md) for details.

### Video Tracking

Track objects across multiple frames.

**Endpoint**: `POST /api/track`

**Models**: SAMURAI, SAM2Long, SAM2.1, YOLO11n-seg

**Use cases**:
- Generate annotation sequences automatically
- Track moving objects through occlusions
- Reduce manual keyframe placement

See [Video Tracking](./video-tracking.md) for details.

### Ontology Augmentation

LLM-based suggestions for ontology types and relationships.

**Endpoint**: `POST /api/augment`

**Models**: Llama-4-Scout, Llama-3.3-70B, DeepSeek-V3, Gemma-3-27b

**Use cases**:
- Suggest entity types based on domain
- Generate relationship definitions
- Expand ontologies with persona context

See [Ontology Augmentation](./ontology-augmentation.md) for details.

## Inference Engines

### SGLang (Primary)

SGLang provides fast inference with structured generation support.

**Advantages**:
- Supports both LLM and VLM models
- 10M context length for Llama-4 models
- Batching and continuous batching
- JSON mode for structured outputs

**When to use**: Default for all VLM and LLM tasks.

### vLLM (Fallback)

vLLM offers high-throughput serving for large batches.

**Advantages**:
- PagedAttention for memory efficiency
- Dynamic batching
- Tensor parallelism for multi-GPU

**When to use**: When SGLang unavailable or for batch processing.

### PyTorch (Direct)

Direct PyTorch inference for detection and tracking.

**Advantages**:
- Full control over inference pipeline
- Custom preprocessing and postprocessing
- Lower overhead for single predictions

**When to use**: Object detection and tracking tasks.

## System Requirements

### CPU Mode (Development)

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 8 cores | 16 cores |
| RAM | 16 GB | 32 GB |
| Storage | 50 GB | 100 GB |
| OS | Linux, macOS, Windows | Linux |

**Model availability**: PyTorch models only (detection, tracking). VLM inference runs but is slow (30-60 seconds per frame).

**When to use**:
- Local development without GPU
- Testing API endpoints
- Annotation workflows without AI assistance

### GPU Mode (Production)

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| GPU | NVIDIA T4 (16GB VRAM) | A100 (40GB VRAM) |
| CPU | 8 cores | 16 cores |
| RAM | 32 GB | 64 GB |
| Storage | 100 GB | 500 GB |
| OS | Linux with CUDA 12.1+ | Ubuntu 22.04 |

**Model availability**: All models supported.

**When to use**:
- Production deployments
- Real-time video processing
- Multiple concurrent users

### VRAM Requirements by Model

| Model | Task | VRAM (4-bit) | VRAM (full) |
|-------|------|--------------|-------------|
| Llama-4-Maverick | Summarization | 62 GB | 240 GB |
| Gemma-3-27b | Summarization | 14 GB | 54 GB |
| InternVL3-78B | Summarization | 40 GB | 156 GB |
| Qwen2.5-VL-72B | Summarization | 36 GB | 144 GB |
| Llama-4-Scout | Augmentation | 55 GB | 220 GB |
| DeepSeek-V3 | Augmentation | 85 GB | 340 GB |
| YOLO-World-v2 | Detection | 2 GB | 2 GB |
| GroundingDINO 1.5 | Detection | 4 GB | 4 GB |
| SAMURAI | Tracking | 3 GB | 3 GB |
| SAM2.1 | Tracking | 3 GB | 3 GB |

4-bit quantization reduces VRAM usage by approximately 75% with minimal accuracy loss.

## Service Endpoints

### Health Check

```bash
curl http://localhost:8000/health
```

Response:
```json
{
  "status": "healthy",
  "models_loaded": ["llama-4-maverick"],
  "device": "cuda",
  "gpu_memory_allocated": "14.5 GB",
  "gpu_memory_reserved": "16.0 GB"
}
```

### Model Info

```bash
curl http://localhost:8000/models/info
```

Response:
```json
{
  "available_models": {
    "video_summarization": ["llama-4-maverick", "gemma-3-27b", "qwen2-5-vl-72b"],
    "ontology_augmentation": ["llama-4-scout", "llama-3-3-70b"],
    "object_detection": ["yolo-world-v2", "grounding-dino-1-5"],
    "video_tracking": ["samurai", "sam2-1"]
  },
  "loaded_models": ["llama-4-maverick"],
  "device": "cuda:0"
}
```

### Summarize Video

```bash
curl -X POST http://localhost:8000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/example.mp4",
    "persona_context": "Baseball game analyst",
    "frame_count": 8,
    "sampling_strategy": "uniform"
  }'
```

See [Video Summarization](./video-summarization.md) for full API.

### Detect Objects

```bash
curl -X POST http://localhost:8000/api/detect \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/example.mp4",
    "frame_numbers": [0, 10, 20],
    "model": "yolo-world-v2",
    "confidence_threshold": 0.5
  }'
```

See [Object Detection](./object-detection.md) for full API.

### Track Objects

```bash
curl -X POST http://localhost:8000/api/track \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/example.mp4",
    "frame_range": {"start": 0, "end": 100},
    "tracking_model": "samurai",
    "confidence_threshold": 0.7
  }'
```

See [Video Tracking](./video-tracking.md) for full API.

### Augment Ontology

```bash
curl -X POST http://localhost:8000/api/augment \
  -H "Content-Type: application/json" \
  -d '{
    "persona_name": "Baseball Analyst",
    "existing_ontology": {"entity_types": ["Player", "Ball"]},
    "domain_context": "Baseball game analysis",
    "task_description": "Annotating pitcher actions"
  }'
```

See [Ontology Augmentation](./ontology-augmentation.md) for full API.

## Performance Characteristics

### Throughput

| Task | Model | CPU | GPU (T4) | GPU (A100) |
|------|-------|-----|----------|------------|
| Summarization | Gemma-3-27b | 0.5 frames/sec | 4 frames/sec | 12 frames/sec |
| Summarization | Qwen2.5-VL-72B | 0.2 frames/sec | 2 frames/sec | 8 frames/sec |
| Detection | YOLO-World-v2 | 15 frames/sec | 52 frames/sec | 85 frames/sec |
| Detection | GroundingDINO | 8 frames/sec | 20 frames/sec | 35 frames/sec |
| Tracking | SAMURAI | 5 frames/sec | 25 frames/sec | 45 frames/sec |
| Tracking | SAM2.1 | 6 frames/sec | 30 frames/sec | 50 frames/sec |

### Latency

| Task | First Request | Subsequent Requests |
|------|---------------|---------------------|
| Summarization | 15-30 seconds (model load) | 0.5-2 seconds |
| Detection | 5-10 seconds (model load) | 0.05-0.2 seconds |
| Tracking | 5-10 seconds (model load) | 0.1-0.5 seconds |
| Augmentation | 15-30 seconds (model load) | 1-5 seconds |

First request includes model loading time. Subsequent requests use cached models.

## When to Use Model Service

### Use Model Service When:

1. **Automating repetitive tasks**: Detecting hundreds of objects across video frames.
2. **Bootstrapping annotations**: Generating initial bounding boxes for manual refinement.
3. **Analyzing large video datasets**: Processing hours of footage efficiently.
4. **Enriching ontologies**: Suggesting types and relationships from domain knowledge.
5. **Extracting video content**: OCR, scene detection, or summarization.

### Skip Model Service When:

1. **Annotating small datasets**: Manual annotation may be faster for 10-20 objects.
2. **Complex edge cases**: AI struggles with unusual perspectives or rare objects.
3. **Precision requirements**: Manual annotation provides exact bounding boxes.
4. **Resource constraints**: CPU inference is too slow for interactive use.
5. **Offline environments**: Model downloads require internet connection.

## Troubleshooting

### Model Loading Fails

**Symptom**: Error "Failed to load model llama-4-maverick"

**Causes**:
- Insufficient VRAM
- Missing model files in cache
- Incorrect model configuration

**Solutions**:

1. Check VRAM availability:
```bash
nvidia-smi
```

2. Verify model cache:
```bash
ls ~/.cache/huggingface/hub/
```

3. Switch to smaller model in `config/models.yaml`:
```yaml
video_summarization:
  selected: "gemma-3-27b"  # Requires only 14GB VRAM
```

### Slow Inference on CPU

**Symptom**: Summarization takes 60+ seconds per frame

**Cause**: CPU inference is inherently slow for large models.

**Solutions**:

1. Use GPU mode if available.
2. Switch to lighter models (Gemma-3-27b instead of Llama-4-Maverick).
3. Reduce frame count in requests.
4. Use detection/tracking only (skip summarization).

### CUDA Out of Memory

**Symptom**: Error "RuntimeError: CUDA out of memory"

**Causes**:
- Model too large for GPU
- Multiple models loaded simultaneously
- Batch size too large

**Solutions**:

1. Enable 4-bit quantization in config:
```yaml
quantization: "4bit"
```

2. Unload unused models:
```bash
curl -X POST http://localhost:8000/models/unload \
  -H "Content-Type: application/json" \
  -d '{"model_id": "unused-model"}'
```

3. Reduce batch size in requests.

### Connection Refused

**Symptom**: Error "Connection refused to localhost:8000"

**Causes**:
- Service not running
- Port conflict
- Firewall blocking

**Solutions**:

1. Check service status:
```bash
docker compose ps model-service
```

2. Check logs:
```bash
docker compose logs model-service
```

3. Verify port availability:
```bash
lsof -i :8000
```

## Next Steps

- [Configure models](./configuration.md) for your hardware
- [Set up video summarization](./video-summarization.md)
- [Configure object detection](./object-detection.md)
- [Enable video tracking](./video-tracking.md)
- [Use ontology augmentation](./ontology-augmentation.md)
