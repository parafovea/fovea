---
title: Video Summarization
---

# Video Summarization

Video summarization uses Vision Language Models (VLMs) to analyze video frames and generate text descriptions. The service samples frames from videos, processes them through multimodal models, and returns summaries with persona context integration.

## How It Works

The video summarization pipeline:

1. **Frame Sampling**: Extract frames from video using specified strategy (uniform, keyframe-based, or adaptive)
2. **Frame Preprocessing**: Resize and normalize frames for model input
3. **VLM Inference**: Process frames through vision-language model
4. **Persona Context Integration**: Include persona information in prompts for domain-specific summaries
5. **Response Generation**: Return structured summary with frame indices and confidence scores

## Available Models

### Llama-4-Maverick

**Model ID**: `meta-llama/Llama-4-Maverick`

**Type**: Mixture of Experts (MoE) with 17B active parameters

**Characteristics**:
- VRAM: 62 GB (4-bit), 240 GB (full precision)
- Context length: 10M tokens
- Speed: Fast
- Multimodal: Yes

**Best for**:
- Long video sequences
- Complex scene understanding
- Multi-frame reasoning

**Example**:
```bash
curl -X POST http://localhost:8000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/game.mp4",
    "model": "llama-4-maverick",
    "frame_count": 16,
    "persona_context": "Baseball analyst tracking pitcher performance"
  }'
```

### Gemma-3-27b

**Model ID**: `google/gemma-3-27b-it`

**Type**: Dense model with 27B parameters

**Characteristics**:
- VRAM: 14 GB (4-bit), 54 GB (full precision)
- Context length: 8K tokens
- Speed: Very fast
- Multimodal: Yes

**Best for**:
- Document analysis in videos
- OCR and text extraction
- Multilingual video content
- Limited VRAM environments

**Example**:
```bash
curl -X POST http://localhost:8000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/presentation.mp4",
    "model": "gemma-3-27b",
    "frame_count": 8,
    "sampling_strategy": "uniform"
  }'
```

### InternVL3-78B

**Model ID**: `OpenGVLab/InternVL3-78B`

**Type**: Dense model with 78B parameters

**Characteristics**:
- VRAM: 40 GB (4-bit), 156 GB (full precision)
- Context length: 32K tokens
- Speed: Medium
- Multimodal: Yes

**Best for**:
- High accuracy requirements
- Scientific and technical analysis
- Detailed scene descriptions
- Benchmark-quality results

**Example**:
```bash
curl -X POST http://localhost:8000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/medical.mp4",
    "model": "internvl3-78b",
    "frame_count": 12,
    "persona_context": "Medical researcher analyzing procedure"
  }'
```

### Pixtral-Large

**Model ID**: `mistralai/Pixtral-Large-Instruct-2411`

**Type**: Large multimodal model

**Characteristics**:
- VRAM: 62 GB (4-bit), 240 GB (full precision)
- Context length: 128K tokens
- Speed: Medium
- Multimodal: Yes

**Best for**:
- Long context requirements
- Batch processing multiple videos
- Complex multi-frame analysis
- Extended video sequences

**Example**:
```bash
curl -X POST http://localhost:8000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/conference.mp4",
    "model": "pixtral-large",
    "frame_count": 32,
    "sampling_strategy": "keyframe"
  }'
```

### Qwen2.5-VL-72B

**Model ID**: `Qwen/Qwen2.5-VL-72B-Instruct`

**Type**: Dense model with 72B parameters

**Characteristics**:
- VRAM: 36 GB (4-bit), 144 GB (full precision)
- Context length: 32K tokens
- Speed: Fast
- Multimodal: Yes

**Best for**:
- General-purpose summarization
- Stable baseline results
- Balanced speed and accuracy
- Production deployments

**Example**:
```bash
curl -X POST http://localhost:8000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/surveillance.mp4",
    "model": "qwen2-5-vl-72b",
    "frame_count": 10,
    "persona_context": "Security analyst reviewing footage"
  }'
```

## Frame Sampling Strategies

### Uniform Sampling (Default)

Extract frames at evenly spaced intervals.

**Algorithm**:
```
frame_indices = linspace(0, total_frames, frame_count)
```

**Best for**:
- General video analysis
- Unknown content structure
- Consistent temporal coverage

**Example**:
```json
{
  "sampling_strategy": "uniform",
  "frame_count": 8
}
```

For a 240-frame video, extracts frames: 0, 30, 60, 90, 120, 150, 180, 210

### Keyframe-Based Sampling

Extract frames at scene changes and visual transitions.

**Algorithm**:
1. Detect scene changes using frame difference
2. Select frames at transition points
3. Fill remaining count with uniform samples

**Best for**:
- Videos with distinct scenes
- Presentations and slideshows
- Action sequences with cuts

**Example**:
```json
{
  "sampling_strategy": "keyframe",
  "frame_count": 12,
  "scene_threshold": 30.0
}
```

**Parameters**:
- `scene_threshold`: Pixel difference threshold for scene detection (default: 30.0)

### Adaptive Sampling

Dynamically allocate frames based on visual complexity.

**Algorithm**:
1. Calculate visual complexity per segment
2. Allocate more frames to complex segments
3. Fewer frames to static segments

**Best for**:
- Mixed content (static and dynamic)
- Efficient frame allocation
- Unknown video characteristics

**Example**:
```json
{
  "sampling_strategy": "adaptive",
  "frame_count": 16,
  "complexity_metric": "gradient"
}
```

**Parameters**:
- `complexity_metric`: Metric for complexity (`gradient`, `entropy`, `motion`)

## API Endpoint

### Request

```
POST /api/summarize
```

**Content-Type**: `application/json`

**Request Schema**:

```json
{
  "video_path": "/data/example.mp4",
  "model": "qwen2-5-vl-72b",
  "frame_count": 8,
  "sampling_strategy": "uniform",
  "persona_context": "Baseball analyst",
  "max_tokens": 512,
  "temperature": 0.7
}
```

**Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| video_path | string | Yes | - | Path to video file |
| model | string | No | (from config) | Model to use for inference |
| frame_count | integer | No | 8 | Number of frames to sample |
| sampling_strategy | string | No | "uniform" | Sampling method: uniform, keyframe, adaptive |
| persona_context | string | No | null | Persona information for context |
| max_tokens | integer | No | 512 | Maximum response tokens |
| temperature | float | No | 0.7 | Sampling temperature (0.0-2.0) |
| scene_threshold | float | No | 30.0 | Scene change threshold (keyframe mode) |
| complexity_metric | string | No | "gradient" | Complexity metric (adaptive mode) |

### Response

**Status**: 200 OK

```json
{
  "summary": "The video shows a baseball game with a pitcher throwing from the mound. The batter prepares to hit. The pitch is thrown, and the batter swings, making contact. The ball travels into the outfield where a fielder catches it for an out.",
  "frame_indices": [0, 30, 60, 90, 120, 150, 180, 210],
  "frame_count": 8,
  "model_used": "qwen2-5-vl-72b",
  "inference_time_ms": 1847,
  "tokens_generated": 48,
  "confidence": 0.92,
  "persona_applied": true
}
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| summary | string | Generated text summary |
| frame_indices | array | Frame numbers analyzed |
| frame_count | integer | Number of frames processed |
| model_used | string | Model that performed inference |
| inference_time_ms | integer | Inference duration in milliseconds |
| tokens_generated | integer | Number of tokens in summary |
| confidence | float | Model confidence score (0.0-1.0) |
| persona_applied | boolean | Whether persona context was used |

### Error Responses

**400 Bad Request**:

```json
{
  "error": "Validation Error",
  "message": "frame_count must be between 1 and 64",
  "details": {
    "field": "frame_count",
    "value": 100,
    "constraint": "max:64"
  }
}
```

**404 Not Found**:

```json
{
  "error": "Not Found",
  "message": "Video file not found: /data/missing.mp4"
}
```

**500 Internal Server Error**:

```json
{
  "error": "Inference Error",
  "message": "Model inference failed: CUDA out of memory",
  "model": "llama-4-maverick",
  "frame_index": 45
}
```

## Persona Context Integration

Persona context provides domain-specific knowledge to the model, improving summary relevance.

### Without Persona Context

Request:
```json
{
  "video_path": "/data/game.mp4",
  "frame_count": 8
}
```

Response:
```
"The video shows people on a field. One person throws an object. Another person holds a stick."
```

### With Persona Context

Request:
```json
{
  "video_path": "/data/game.mp4",
  "frame_count": 8,
  "persona_context": "Baseball analyst tracking pitcher mechanics and pitch outcomes"
}
```

Response:
```
"The pitcher delivers a fastball from the stretch position with a three-quarters arm slot. The pitch crosses the plate at approximately 92 mph. The batter takes a full swing, making contact on the outer third of the plate. The result is a fly ball to center field."
```

### Effective Persona Context

**Good contexts**:
- "Medical researcher analyzing surgical procedures"
- "Wildlife biologist studying animal behavior"
- "Security analyst reviewing surveillance footage"
- "Sports coach evaluating player technique"

**Poor contexts**:
- "Person" (too generic)
- "Expert" (vague)
- "Someone who knows about this" (unclear domain)

**Best practices**:
1. Include domain expertise
2. Specify what to track or analyze
3. Use 5-15 words
4. Avoid generic terms

## Performance Comparison

### CPU vs GPU Processing

| Model | CPU (frames/sec) | GPU T4 (frames/sec) | GPU A100 (frames/sec) |
|-------|------------------|---------------------|----------------------|
| Gemma-3-27b | 0.5 | 4 | 12 |
| Qwen2.5-VL-72B | 0.2 | 2 | 8 |
| Llama-4-Maverick | 0.1 | 1.5 | 6 |
| InternVL3-78B | 0.1 | 1 | 4 |
| Pixtral-Large | 0.1 | 1.5 | 6 |

**Note**: CPU inference suitable for development only. Production requires GPU.

### Latency Breakdown

For 8-frame request with Qwen2.5-VL-72B on GPU T4:

| Step | Duration | Percentage |
|------|----------|------------|
| Frame extraction | 120 ms | 6% |
| Frame preprocessing | 80 ms | 4% |
| Model loading (first request) | 15,000 ms | - |
| Model inference | 1,600 ms | 85% |
| Response formatting | 50 ms | 3% |
| Network overhead | 40 ms | 2% |
| **Total (cached model)** | **1,890 ms** | **100%** |

### Frame Count Impact

Using Qwen2.5-VL-72B on GPU T4:

| Frame Count | Inference Time | Tokens Generated |
|-------------|----------------|------------------|
| 1 | 400 ms | 20 |
| 4 | 850 ms | 35 |
| 8 | 1,600 ms | 48 |
| 16 | 3,100 ms | 72 |
| 32 | 6,200 ms | 110 |
| 64 | 12,500 ms | 180 |

Inference time scales approximately linearly with frame count.

## Use Cases and Limitations

### When to Use Video Summarization

1. **Initial video analysis**: Generate overviews before detailed annotation
2. **Content discovery**: Identify videos of interest in large collections
3. **Annotation context**: Provide summaries to guide annotators
4. **Quality control**: Verify video content matches metadata
5. **Search indexing**: Create searchable text descriptions

### Limitations

1. **Temporal reasoning**: Models analyze individual frames, not continuous motion
2. **Small object detection**: Details smaller than 5% of frame may be missed
3. **Rare events**: Models may not recognize uncommon objects or actions
4. **Context limitations**: 8-16 frames cannot capture hour-long narratives
5. **Hallucinations**: Models may describe plausible but incorrect details

### Accuracy Expectations

| Scenario | Expected Accuracy |
|----------|-------------------|
| General object identification | 85-95% |
| Action recognition (common) | 75-85% |
| Text extraction (OCR) | 90-98% |
| Fine-grained classification | 60-75% |
| Spatial relationships | 70-85% |
| Temporal sequences | 50-70% |

Use summaries as starting points, not ground truth. Always verify critical details.

## Troubleshooting

### Summary Quality Issues

**Symptom**: Generic or uninformative summaries

**Causes**:
- Insufficient frame count
- Poor frame sampling strategy
- Missing persona context

**Solutions**:

1. Increase frame count:
```json
{
  "frame_count": 16  // Up from 8
}
```

2. Use keyframe sampling for scene-based videos:
```json
{
  "sampling_strategy": "keyframe"
}
```

3. Add specific persona context:
```json
{
  "persona_context": "Sports analyst tracking game events and player actions"
}
```

### Slow Inference

**Symptom**: Summaries take 10+ seconds

**Causes**:
- CPU mode (inherently slow)
- Large model on limited GPU
- High frame count

**Solutions**:

1. Switch to GPU mode (see [Configuration](./configuration.md))

2. Use faster model:
```json
{
  "model": "gemma-3-27b"  // Fastest option
}
```

3. Reduce frame count:
```json
{
  "frame_count": 4  // Down from 8
}
```

### CUDA Out of Memory

**Symptom**: Error during inference

**Causes**:
- Model too large for GPU
- High frame count exceeds batch limit

**Solutions**:

1. Enable 4-bit quantization in config.

2. Reduce frame count:
```json
{
  "frame_count": 4
}
```

3. Switch to smaller model:
```json
{
  "model": "gemma-3-27b"  // Only 14GB VRAM
}
```

### Missing Persona Context

**Symptom**: Generic summaries despite providing persona context

**Cause**: Persona context not applied correctly

**Solutions**:

1. Verify `persona_applied` in response:
```json
{
  "persona_applied": true  // Should be true
}
```

2. Check persona context format (5-15 words, specific domain).

3. Review logs for context processing errors:
```bash
docker compose logs model-service | grep persona
```

## Example Workflows

### Workflow 1: Quick Video Overview

Generate a quick summary for initial review:

```bash
curl -X POST http://localhost:8000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/new-video.mp4",
    "frame_count": 4,
    "sampling_strategy": "uniform"
  }'
```

### Workflow 2: Detailed Analysis with Persona

Get domain-specific summary with persona context:

```bash
curl -X POST http://localhost:8000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/game-footage.mp4",
    "model": "qwen2-5-vl-72b",
    "frame_count": 16,
    "sampling_strategy": "keyframe",
    "persona_context": "Basketball coach analyzing defensive strategies",
    "max_tokens": 1024
  }'
```

### Workflow 3: OCR and Text Extraction

Extract text from presentation or document video:

```bash
curl -X POST http://localhost:8000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/presentation.mp4",
    "model": "gemma-3-27b",
    "frame_count": 12,
    "sampling_strategy": "keyframe",
    "scene_threshold": 25.0,
    "persona_context": "Document analyst extracting text and slide content"
  }'
```

## Next Steps

- [Configure models](./configuration.md) for your hardware
- [Set up object detection](./object-detection.md)
- [Enable video tracking](./video-tracking.md)
- [Use ontology augmentation](./ontology-augmentation.md)
- [Return to overview](./overview.md)
