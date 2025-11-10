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
    "video_id": "game-video-123",
    "persona_id": "baseball-analyst-456",
    "frame_sample_rate": 2,
    "max_frames": 16
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
    "video_id": "presentation-123",
    "persona_id": "document-analyst-789",
    "frame_sample_rate": 1,
    "max_frames": 8
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
    "video_id": "medical-procedure-123",
    "persona_id": "medical-researcher-456",
    "frame_sample_rate": 1,
    "max_frames": 12
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
    "video_id": "conference-video-123",
    "persona_id": "business-analyst-456",
    "frame_sample_rate": 2,
    "max_frames": 32
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
    "video_id": "surveillance-footage-123",
    "persona_id": "security-analyst-456",
    "frame_sample_rate": 1,
    "max_frames": 10
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

## Persona Context Integration

Persona information is automatically included in the summarization prompt to provide domain-specific, context-aware summaries. This feature allows the same video to be summarized differently based on the analyst's perspective.

### How It Works

When a summarization request includes a `persona_id`, the model service:

1. **Fetches persona data** from the backend (role, information need, description)
2. **Constructs context-aware prompt** including:
   - Analyst role (e.g., "Sports Analyst", "Security Analyst")
   - Information need (e.g., "Track player movements", "Identify security threats")
   - Domain-specific vocabulary from the persona's ontology
3. **Guides VLM generation** to focus on relevant aspects of the video

### Persona-Specific Summaries

**Example: Same baseball video, different personas**

**Sports Analyst Persona**:
- Role: "Sports Analyst"
- Information Need: "Track player performance and game statistics"

Generated Summary:
> "The pitcher delivers a fastball at 94 mph. The batter swings and makes contact, sending the ball to deep left field. The left fielder tracks the ball and makes a diving catch at the warning track. The runner on first base tags up but holds at second base after the catch."

**Security Analyst Persona**:
- Role: "Security Analyst"
- Information Need: "Monitor crowd behavior and identify security concerns"

Generated Summary:
> "Large crowd visible in the stadium stands. Multiple access points to the field are secured with barriers. Security personnel positioned at regular intervals along the perimeter. Camera coverage shows clear sight lines across the venue. No unusual crowd movements or gatherings detected."

### Persona Data Structure

The persona context passed to the model includes:

```json
{
  "role": "Sports Analyst",
  "informationNeed": "Track player performance metrics",
  "description": "Analyzing baseball games for player statistics",
  "ontologyContext": {
    "entityTypes": ["Player", "Ball", "Umpire"],
    "eventTypes": ["Pitch", "Hit", "Catch"]
  }
}
```

### Benefits

- **Domain Relevance**: Summaries focus on what matters to each analyst
- **Terminology Alignment**: Uses vocabulary from persona's ontology
- **Reduced Noise**: Filters out irrelevant details
- **Multi-Perspective Analysis**: Same video analyzed from multiple viewpoints

### Best Practices

1. **Define clear roles**: Specific roles produce better summaries than generic ones
2. **Articulate information needs**: Clear goals guide what the model focuses on
3. **Build rich ontologies**: More context helps the model understand domain vocabulary
4. **Use consistent personas**: Reuse personas across videos for comparable summaries

## API Endpoint

### Request

```
POST /api/summarize
```

**Content-Type**: `application/json`

**Request Schema**:

```json
{
  "video_id": "abc-123",
  "persona_id": "persona-456",
  "frame_sample_rate": 1,
  "max_frames": 30,
  "enable_audio": false,
  "audio_language": null,
  "enable_speaker_diarization": false,
  "fusion_strategy": "sequential"
}
```

**Core Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| video_id | string | Yes | - | Unique identifier for the video |
| persona_id | string | Yes | - | Unique identifier for the persona |
| frame_sample_rate | integer | No | 1 | Frames to sample per second (1-10) |
| max_frames | integer | No | 30 | Maximum frames to process (1-100) |

**Audio Parameters** (Optional):

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| enable_audio | boolean | No | false | Enable audio transcription |
| audio_language | string \| null | No | null | Language code (e.g., "en", "es"). Auto-detects if null |
| enable_speaker_diarization | boolean | No | false | Enable speaker identification |
| fusion_strategy | string \| null | No | "sequential" | Audio-visual fusion strategy: "sequential", "timestamp_aligned", "native_multimodal", "hybrid" |

See the [Audio Transcription API](../api-reference/audio-transcription.md) for detailed audio parameter documentation.

### Response

**Status**: 200 OK

**Without Audio**:

```json
{
  "id": "summary-123",
  "video_id": "abc-123",
  "persona_id": "persona-456",
  "summary": "The video shows a baseball game with a pitcher throwing from the mound. The batter prepares to hit. The pitch is thrown, and the batter swings, making contact.",
  "visual_analysis": "Frame 0: Pitcher on mound. Frame 150: Batter at plate...",
  "audio_transcript": null,
  "key_frames": [
    {
      "frame_number": 0,
      "timestamp": 0.0,
      "description": "Pitcher on mound",
      "confidence": 0.95
    }
  ],
  "confidence": 0.92,
  "transcript_json": null,
  "audio_language": null,
  "speaker_count": null,
  "audio_model_used": null,
  "visual_model_used": "llama-4-maverick",
  "fusion_strategy": null,
  "processing_time_audio": null,
  "processing_time_visual": 8.3,
  "processing_time_fusion": null
}
```

**With Audio Enabled**:

```json
{
  "id": "summary-124",
  "video_id": "abc-123",
  "persona_id": "persona-456",
  "summary": "The video shows a baseball game. The announcer describes the pitcher throwing a fastball as the batter prepares to swing.",
  "visual_analysis": "Frame 0: Pitcher on mound. Frame 150: Batter at plate...",
  "audio_transcript": "And here comes the pitch. It's a fastball, right down the middle.",
  "key_frames": [
    {
      "frame_number": 0,
      "timestamp": 0.0,
      "description": "Pitcher on mound",
      "confidence": 0.95
    }
  ],
  "confidence": 0.94,
  "transcript_json": {
    "segments": [
      {
        "start": 2.5,
        "end": 6.8,
        "text": "And here comes the pitch. It's a fastball, right down the middle.",
        "speaker": "Speaker 1",
        "confidence": 0.92
      }
    ],
    "language": "en",
    "speaker_count": 1
  },
  "audio_language": "en",
  "speaker_count": 1,
  "audio_model_used": "whisper-large-v3",
  "visual_model_used": "llama-4-maverick",
  "fusion_strategy": "sequential",
  "processing_time_audio": 12.5,
  "processing_time_visual": 8.3,
  "processing_time_fusion": 1.2
}
```

**Core Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier for this summary |
| video_id | string | Video identifier |
| persona_id | string | Persona identifier |
| summary | string | Generated text summary |
| visual_analysis | string \| null | Detailed visual content analysis |
| audio_transcript | string \| null | Transcribed audio content (if audio enabled) |
| key_frames | array | Key frames with descriptions and timestamps |
| confidence | float | Overall confidence score (0.0-1.0) |

**Audio Response Fields** (when audio is enabled):

| Field | Type | Description |
|-------|------|-------------|
| transcript_json | object \| null | Structured transcript with segments and speakers |
| audio_language | string \| null | Detected or specified language code |
| speaker_count | number \| null | Number of distinct speakers identified |
| audio_model_used | string \| null | Audio transcription model name |
| visual_model_used | string \| null | Visual analysis model name |
| fusion_strategy | string \| null | Fusion strategy applied |
| processing_time_audio | number \| null | Audio processing time in seconds |
| processing_time_visual | number \| null | Visual processing time in seconds |
| processing_time_fusion | number \| null | Fusion processing time in seconds |

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
  "video_id": "game-video-123",
  "persona_id": "generic-analyst-456",
  "max_frames": 8
}
```

Response summary:
```
"The video shows people on a field. One person throws an object. Another person holds a stick."
```

### With Persona Context

Request:
```json
{
  "video_id": "game-video-123",
  "persona_id": "baseball-analyst-456",
  "max_frames": 8
}
```

(Persona has role="Baseball analyst" and information_need="tracking pitcher mechanics and pitch outcomes")

Response summary:
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
    "video_id": "new-video-123",
    "persona_id": "general-analyst-456",
    "frame_sample_rate": 1,
    "max_frames": 4
  }'
```

### Workflow 2: Detailed Analysis with Audio

Get comprehensive summary with audio transcription:

```bash
curl -X POST http://localhost:8000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "video_id": "game-footage-123",
    "persona_id": "basketball-coach-456",
    "frame_sample_rate": 2,
    "max_frames": 16,
    "enable_audio": true,
    "enable_speaker_diarization": true,
    "fusion_strategy": "timestamp_aligned"
  }'
```

### Workflow 3: OCR and Text Extraction

Extract text from presentation or document video:

```bash
curl -X POST http://localhost:8000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "video_id": "presentation-123",
    "persona_id": "document-analyst-456",
    "frame_sample_rate": 1,
    "max_frames": 12
  }'
```

## Next Steps

- [Audio Transcription API](../api-reference/audio-transcription.md) - Add audio transcription to summaries
- [Audio-Visual Fusion Strategies](../user-guides/audio/fusion-strategies.md) - Learn about fusion approaches
- [Configure models](./configuration.md) for your hardware
- [Set up object detection](./object-detection.md)
- [Enable video tracking](./video-tracking.md)
- [Use ontology augmentation](./ontology-augmentation.md)
- [Return to overview](./overview.md)
