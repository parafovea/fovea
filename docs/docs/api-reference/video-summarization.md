---
title: Video Summarization API
sidebar_position: 7
keywords: [video, summarization, vlm, ai, audio, transcription, fusion, personas]
---

# Video Summarization API

Generate AI-powered video summaries using vision language models (VLMs) with optional audio transcription and multimodal fusion. Summaries are tailored to specific personas and their information needs.

## Overview

The Video Summarization API provides async job processing for analyzing video content. Key features:

- Vision language model analysis of sampled video frames
- Optional audio transcription with speaker diarization
- Four audio-visual fusion strategies
- Persona-based context and prompts
- Async job processing with BullMQ
- Support for local models and external APIs (Anthropic, OpenAI, Google)

Summaries are stored per video-persona combination and include visual analysis, audio transcripts, key frame descriptions, and processing metadata.

## Base URL

```
http://localhost:3001/api
```

Model service (internal):
```
http://localhost:8000/api
```

## Authentication

Session-based authentication required. Include session cookie in requests:

```bash
curl -X POST http://localhost:3001/api/videos/summaries/generate \
  --cookie "session_token=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

## Endpoints

### Queue Summarization Job

Request video summarization for a specific persona. Returns job ID for status tracking.

**Endpoint:**
```http
POST /api/videos/summaries/generate
```

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `videoId` | string | Yes | - | Video identifier |
| `personaId` | string (UUID) | Yes | - | Persona identifier |
| `frameSampleRate` | number | No | `1` | Frames to sample per second (1-10) |
| `maxFrames` | number | No | `30` | Maximum frames to process (1-100) |
| `enableAudio` | boolean | No | `false` | Enable audio transcription |
| `audioLanguage` | string \| null | No | `null` | Language code (e.g., "en", "es"). Auto-detects if null |
| `enableSpeakerDiarization` | boolean | No | `false` | Enable speaker identification |
| `fusionStrategy` | string \| null | No | `"sequential"` | Audio-visual fusion strategy |

**Fusion Strategy Options:**

| Value | Description |
|-------|-------------|
| `sequential` | Process audio and visual independently, then combine |
| `timestamp_aligned` | Align audio segments with visual frames by timestamp |
| `native_multimodal` | Use multimodal model (GPT-4o, Gemini) for joint processing |
| `hybrid` | Weighted combination of multiple approaches |

**Example Request:**

```bash
curl -X POST http://localhost:3001/api/videos/summaries/generate \
  --cookie "session_token=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "test-video",
    "personaId": "550e8400-e29b-41d4-a716-446655440000",
    "frameSampleRate": 2,
    "maxFrames": 50,
    "enableAudio": true,
    "enableSpeakerDiarization": true,
    "fusionStrategy": "timestamp_aligned",
    "audioLanguage": "en"
  }'
```

**Response 202 (Accepted):**

```json
{
  "jobId": "test-video-550e8400-e29b-41d4-a716-446655440000-1699564800000",
  "status": "queued",
  "videoId": "test-video",
  "personaId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `jobId` | string | Unique job identifier for status tracking |
| `status` | string | Initial status: "queued" |
| `videoId` | string | Video identifier from request |
| `personaId` | string | Persona identifier from request |

**Error Responses:**

**404 Not Found:**
```json
{
  "error": "Video not found"
}
```

**404 Not Found:**
```json
{
  "error": "Persona not found"
}
```

**400 Bad Request:**
```json
{
  "error": "Validation error: frameSampleRate must be between 1 and 10"
}
```

### Check Job Status

Poll job status and retrieve results when complete.

**Endpoint:**
```http
GET /api/jobs/:jobId
```

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `jobId` | string | Job identifier from generate endpoint |

**Example Request:**

```bash
curl http://localhost:3001/api/jobs/test-video-550e8400-1699564800000 \
  --cookie "session_token=YOUR_SESSION_TOKEN"
```

**Response 200 (Queued/Active):**

```json
{
  "jobId": "test-video-550e8400-1699564800000",
  "status": "active",
  "progress": 50,
  "result": null,
  "error": null
}
```

**Response 200 (Completed):**

```json
{
  "jobId": "test-video-550e8400-1699564800000",
  "status": "completed",
  "progress": 100,
  "result": {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "videoId": "test-video",
    "personaId": "550e8400-e29b-41d4-a716-446655440000",
    "summary": "The video shows a business meeting where two speakers discuss quarterly results and future strategy. Visual elements include presentation slides with graphs and charts.",
    "visualAnalysis": "Frame 0: Conference room with presentation screen showing title slide. Frame 30: Graph displaying quarterly revenue trends. Frame 60: Team discussion with whiteboard visible.",
    "audioTranscript": "Welcome to Q4 results presentation. Today we'll review performance metrics and discuss next quarter's objectives.",
    "keyFrames": [
      {
        "frame_number": 0,
        "timestamp": 0.0,
        "description": "Opening title slide with company logo",
        "confidence": 0.95
      },
      {
        "frame_number": 30,
        "timestamp": 1.0,
        "description": "Revenue chart showing 15% growth",
        "confidence": 0.92
      }
    ],
    "confidence": 0.93,
    "transcriptJson": {
      "segments": [
        {
          "start": 2.5,
          "end": 8.3,
          "text": "Welcome to Q4 results presentation.",
          "speaker": "Speaker 1",
          "confidence": 0.94
        },
        {
          "start": 8.5,
          "end": 15.2,
          "text": "Today we'll review performance metrics.",
          "speaker": "Speaker 1",
          "confidence": 0.91
        }
      ],
      "language": "en"
    },
    "audioLanguage": "en",
    "speakerCount": 2,
    "audioModelUsed": "whisper-large-v3",
    "visualModelUsed": "gemini-2.5-flash",
    "fusionStrategy": "timestamp_aligned",
    "processingTimeAudio": 12.5,
    "processingTimeVisual": 8.3,
    "processingTimeFusion": 1.8,
    "createdAt": "2025-10-06T14:30:00.000Z",
    "updatedAt": "2025-10-06T14:35:00.000Z"
  },
  "error": null
}
```

**Response 200 (Failed):**

```json
{
  "jobId": "test-video-550e8400-1699564800000",
  "status": "failed",
  "progress": 30,
  "result": null,
  "error": "Model service error (500): CUDA out of memory"
}
```

**Job Status Values:**

| Status | Description |
|--------|-------------|
| `queued` | Job waiting to be processed |
| `active` | Job currently processing |
| `completed` | Job finished successfully |
| `failed` | Job encountered an error |
| `delayed` | Job delayed for retry |

**Error Responses:**

**404 Not Found:**
```json
{
  "error": "Job not found"
}
```

### List Summaries for Video

Get all summaries for a video across all personas.

**Endpoint:**
```http
GET /api/videos/:videoId/summaries
```

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `videoId` | string | Video identifier |

**Example Request:**

```bash
curl http://localhost:3001/api/videos/test-video/summaries \
  --cookie "session_token=YOUR_SESSION_TOKEN"
```

**Response 200:**

```json
[
  {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "videoId": "test-video",
    "personaId": "550e8400-e29b-41d4-a716-446655440000",
    "summary": "Business meeting with quarterly results...",
    "visualAnalysis": "Frame 0: Conference room...",
    "audioTranscript": "Welcome to Q4 results...",
    "keyFrames": [...],
    "confidence": 0.93,
    "transcriptJson": {...},
    "audioLanguage": "en",
    "speakerCount": 2,
    "audioModelUsed": "whisper-large-v3",
    "visualModelUsed": "gemini-2.5-flash",
    "fusionStrategy": "timestamp_aligned",
    "processingTimeAudio": 12.5,
    "processingTimeVisual": 8.3,
    "processingTimeFusion": 1.8,
    "createdAt": "2025-10-06T14:30:00.000Z",
    "updatedAt": "2025-10-06T14:35:00.000Z"
  },
  {
    "id": "8d0f7780-8536-51ef-b18c-f18gc2g01bf8",
    "videoId": "test-video",
    "personaId": "661f9511-f39c-52e5-b827-557766551111",
    "summary": "Technical presentation analyzing workflow efficiency...",
    "visualAnalysis": "Frame 0: Technical diagram...",
    "audioTranscript": null,
    "keyFrames": [...],
    "confidence": 0.88,
    "transcriptJson": null,
    "audioLanguage": null,
    "speakerCount": null,
    "audioModelUsed": null,
    "visualModelUsed": "llama-4-scout",
    "fusionStrategy": null,
    "processingTimeAudio": null,
    "processingTimeVisual": 5.2,
    "processingTimeFusion": null,
    "createdAt": "2025-10-06T15:00:00.000Z",
    "updatedAt": "2025-10-06T15:05:00.000Z"
  }
]
```

### Get Summary for Persona

Get summary for a specific video-persona combination.

**Endpoint:**
```http
GET /api/videos/:videoId/summaries/:personaId
```

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `videoId` | string | Video identifier |
| `personaId` | string (UUID) | Persona identifier |

**Example Request:**

```bash
curl http://localhost:3001/api/videos/test-video/summaries/550e8400-e29b-41d4-a716-446655440000 \
  --cookie "session_token=YOUR_SESSION_TOKEN"
```

**Response 200:**

```json
{
  "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "videoId": "test-video",
  "personaId": "550e8400-e29b-41d4-a716-446655440000",
  "summary": "The video shows a business meeting...",
  "visualAnalysis": "Frame 0: Conference room...",
  "audioTranscript": "Welcome to Q4 results presentation...",
  "keyFrames": [
    {
      "frame_number": 0,
      "timestamp": 0.0,
      "description": "Opening title slide",
      "confidence": 0.95
    }
  ],
  "confidence": 0.93,
  "transcriptJson": {
    "segments": [
      {
        "start": 2.5,
        "end": 8.3,
        "text": "Welcome to Q4 results presentation.",
        "speaker": "Speaker 1",
        "confidence": 0.94
      }
    ],
    "language": "en"
  },
  "audioLanguage": "en",
  "speakerCount": 2,
  "audioModelUsed": "whisper-large-v3",
  "visualModelUsed": "gemini-2.5-flash",
  "fusionStrategy": "timestamp_aligned",
  "processingTimeAudio": 12.5,
  "processingTimeVisual": 8.3,
  "processingTimeFusion": 1.8,
  "createdAt": "2025-10-06T14:30:00.000Z",
  "updatedAt": "2025-10-06T14:35:00.000Z"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Summary unique identifier |
| `videoId` | string | Video identifier |
| `personaId` | string (UUID) | Persona identifier |
| `summary` | string | Concise text summary of video content |
| `visualAnalysis` | string \| null | Detailed visual content analysis |
| `audioTranscript` | string \| null | Full transcript text (if audio enabled) |
| `keyFrames` | array | Key frames with descriptions |
| `confidence` | number \| null | Overall confidence score (0.0-1.0) |
| `transcriptJson` | object \| null | Structured transcript with segments |
| `audioLanguage` | string \| null | Detected language code (e.g., "en") |
| `speakerCount` | number \| null | Number of distinct speakers |
| `audioModelUsed` | string \| null | Audio transcription model name |
| `visualModelUsed` | string \| null | Visual analysis model name |
| `fusionStrategy` | string \| null | Fusion strategy applied |
| `processingTimeAudio` | number \| null | Audio processing time (seconds) |
| `processingTimeVisual` | number \| null | Visual processing time (seconds) |
| `processingTimeFusion` | number \| null | Fusion processing time (seconds) |
| `createdAt` | string (ISO 8601) | Summary creation timestamp |
| `updatedAt` | string (ISO 8601) | Last update timestamp |

**Key Frame Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `frame_number` | number | Frame index in video |
| `timestamp` | number | Time in seconds from video start |
| `description` | string | AI-generated frame description |
| `confidence` | number | Model confidence score (0.0-1.0) |

**Transcript JSON Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `segments` | array | Array of transcript segments |
| `language` | string | Detected language code |

**Transcript Segment Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `start` | number | Start time in seconds |
| `end` | number | End time in seconds |
| `text` | string | Transcribed text |
| `speaker` | string \| null | Speaker label (e.g., "Speaker 1") |
| `confidence` | number | Confidence score (0.0-1.0) |

**Error Responses:**

**404 Not Found:**
```json
{
  "error": "Summary not found"
}
```

### Delete Summary

Delete a summary for a specific video-persona combination.

**Endpoint:**
```http
DELETE /api/videos/:videoId/summaries/:personaId
```

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `videoId` | string | Video identifier |
| `personaId` | string (UUID) | Persona identifier |

**Example Request:**

```bash
curl -X DELETE http://localhost:3001/api/videos/test-video/summaries/550e8400-e29b-41d4-a716-446655440000 \
  --cookie "session_token=YOUR_SESSION_TOKEN"
```

**Response 200:**

```json
{
  "success": true
}
```

**Error Responses:**

**404 Not Found:**
```json
{
  "error": "Summary not found"
}
```

### Save Summary (Internal)

Save or update a summary directly. Used by the worker after processing. Can also be used for manual summary creation.

**Endpoint:**
```http
POST /api/summaries
```

**Request Body:**

```json
{
  "videoId": "test-video",
  "personaId": "550e8400-e29b-41d4-a716-446655440000",
  "summary": "Video summary text",
  "visualAnalysis": "Detailed visual analysis",
  "audioTranscript": "Full transcript text",
  "keyFrames": [1, 2, 3],
  "confidence": 0.92,
  "transcriptJson": {
    "segments": [
      {
        "start": 0,
        "end": 5,
        "text": "Segment text",
        "speaker": "Speaker 1",
        "confidence": 0.9
      }
    ],
    "language": "en"
  },
  "audioLanguage": "en",
  "speakerCount": 2,
  "audioModelUsed": "whisper-large-v3",
  "visualModelUsed": "gemini-2.5-flash",
  "fusionStrategy": "timestamp_aligned",
  "processingTimeAudio": 12.5,
  "processingTimeVisual": 8.3,
  "processingTimeFusion": 1.8
}
```

**Response 201:**

Returns the complete saved summary object (same schema as GET endpoint).

## Frontend Integration

### React Hooks

The frontend provides TanStack Query hooks for video summarization:

```typescript
import {
  useGenerateSummary,
  useVideoSummaries,
  useVideoSummary,
  useDeleteSummary,
  useJobStatus
} from '@/hooks/useSummaries'

// Generate summary
const generateSummary = useGenerateSummary()
const handleGenerate = async () => {
  const job = await generateSummary.mutateAsync({
    videoId: 'test-video',
    personaId: 'persona-id',
    frameSampleRate: 2,
    maxFrames: 50,
    enableAudio: true,
    enableSpeakerDiarization: true,
    fusionStrategy: 'timestamp_aligned'
  })
  console.log('Job queued:', job.jobId)
}

// Poll job status
const { data: jobStatus } = useJobStatus(jobId, {
  refetchInterval: 2000, // Poll every 2 seconds
  enabled: !!jobId
})

// Fetch summaries
const { data: summaries } = useVideoSummaries('test-video')
const { data: summary } = useVideoSummary('test-video', 'persona-id')

// Delete summary
const deleteSummary = useDeleteSummary()
await deleteSummary.mutateAsync({ videoId: 'test-video', personaId: 'persona-id' })
```

### Components

**VideoSummaryDialog:**
```typescript
import { VideoSummaryDialog } from '@/components/VideoSummaryDialog'

<VideoSummaryDialog
  videoId="test-video"
  personaId="persona-id"
  open={dialogOpen}
  onClose={() => setDialogOpen(false)}
/>
```

**VideoSummaryCard:**
```typescript
import { VideoSummaryCard } from '@/components/VideoSummaryCard'

<VideoSummaryCard
  summary={summary}
  onDelete={handleDelete}
  onRegenerate={handleRegenerate}
/>
```

## Usage Examples

### Basic Visual Summarization

Generate summary from visual frames only:

```bash
curl -X POST http://localhost:3001/api/videos/summaries/generate \
  --cookie "session_token=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "baseball-game",
    "personaId": "scout-persona-id",
    "frameSampleRate": 1,
    "maxFrames": 30
  }'
```

### Audio Transcription with Speaker Diarization

Generate summary with full audio analysis:

```bash
curl -X POST http://localhost:3001/api/videos/summaries/generate \
  --cookie "session_token=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "meeting-recording",
    "personaId": "analyst-persona-id",
    "frameSampleRate": 2,
    "maxFrames": 50,
    "enableAudio": true,
    "enableSpeakerDiarization": true,
    "fusionStrategy": "timestamp_aligned",
    "audioLanguage": "en"
  }'
```

### Polling Job Status

```javascript
async function pollJobStatus(jobId) {
  while (true) {
    const response = await fetch(`http://localhost:3001/api/jobs/${jobId}`, {
      credentials: 'include'
    })

    const job = await response.json()

    console.log(`Status: ${job.status}, Progress: ${job.progress}%`)

    if (job.status === 'completed') {
      console.log('Summary:', job.result.summary)
      return job.result
    }

    if (job.status === 'failed') {
      throw new Error(job.error)
    }

    // Wait 2 seconds before next poll
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
}

// Usage
try {
  const result = await pollJobStatus('job-id-12345')
  console.log('Final result:', result)
} catch (error) {
  console.error('Job failed:', error.message)
}
```

### Retrieving Summaries

```javascript
// Get all summaries for a video
const response = await fetch('http://localhost:3001/api/videos/test-video/summaries', {
  credentials: 'include'
})
const summaries = await response.json()

summaries.forEach(summary => {
  console.log(`Persona: ${summary.personaId}`)
  console.log(`Summary: ${summary.summary}`)
  console.log(`Audio language: ${summary.audioLanguage}`)
  console.log(`Speaker count: ${summary.speakerCount}`)
})
```

## Best Practices

### Frame Sampling Optimization

Choose frame sampling based on video content:

**High motion videos (sports, action):**
- `frameSampleRate: 2-5` (2-5 frames per second)
- `maxFrames: 50-100`

**Low motion videos (presentations, interviews):**
- `frameSampleRate: 0.5-1` (1 frame every 1-2 seconds)
- `maxFrames: 20-30`

**Long videos (>10 minutes):**
- Use lower sampling rate to stay within maxFrames limit
- Calculate: `frameSampleRate = maxFrames / videoDuration`

### Audio Configuration Selection

**When to enable audio:**
- Videos with important dialogue or narration
- Multi-speaker content (meetings, interviews)
- When audio contains key information not visible

**When to skip audio:**
- Silent videos or background music only
- Visual-only content (sports, surveillance)
- To reduce processing time and costs

**Speaker diarization:**
- Enable for multi-speaker content
- Disable for single-speaker or to reduce processing time
- Note: Requires additional processing time (2-5x longer)

### Fusion Strategy Selection

| Strategy | Use Case | Processing Time | Best For |
|----------|----------|-----------------|----------|
| `sequential` | Default, fastest | Baseline | Videos where audio/visual are independent |
| `timestamp_aligned` | Moderate speed | +20-30% | Videos with synchronized audio/visual events |
| `native_multimodal` | External API only | Varies | Complex multimodal understanding |
| `hybrid` | Slowest, highest quality | +50-100% | Critical analysis requiring best accuracy |

### Job Polling Strategies

**Optimal polling interval:**
- Start: 2 seconds for first 30 seconds
- Then: 5 seconds until completion
- Exponential backoff for long-running jobs

**Example with adaptive polling:**

```javascript
async function pollWithBackoff(jobId) {
  let interval = 2000 // Start at 2 seconds
  const maxInterval = 10000 // Cap at 10 seconds

  while (true) {
    const response = await fetch(`/api/jobs/${jobId}`, {
      credentials: 'include'
    })
    const job = await response.json()

    if (job.status === 'completed' || job.status === 'failed') {
      return job
    }

    await new Promise(resolve => setTimeout(resolve, interval))

    // Increase interval, but cap at max
    interval = Math.min(interval * 1.5, maxInterval)
  }
}
```

### Error Handling

Always handle common failure scenarios:

```javascript
try {
  const response = await fetch('/api/videos/summaries/generate', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  })

  if (!response.ok) {
    const error = await response.json()

    if (response.status === 404) {
      console.error('Video or persona not found:', error.error)
    } else if (response.status === 400) {
      console.error('Invalid parameters:', error.error)
    } else {
      console.error('Server error:', error.error)
    }

    return
  }

  const job = await response.json()
  // Poll job status...

} catch (error) {
  console.error('Network error:', error)
}
```

## Troubleshooting

### "Video not found" Error

The video ID is invalid or the video file is missing from the data directory.

**Solutions:**
1. List available videos: `GET /api/videos`
2. Verify video file exists in `/data` directory
3. Check video ID matches filename (MD5 hash)

### "Persona not found" Error

The persona ID is invalid or the persona was deleted.

**Solutions:**
1. List available personas: `GET /api/personas`
2. Create persona if needed: `POST /api/personas`
3. Verify persona UUID is correct

### Job Stuck in "queued" Status

The worker may not be running or Redis is unavailable.

**Solutions:**
1. Check worker is running: `docker ps | grep backend`
2. Verify Redis connection: `docker logs fovea-backend | grep Redis`
3. Check queue health in Bull Board: `http://localhost:3001/admin/queues`
4. Restart backend service: `docker compose restart backend`

### "Model service unavailable" Error

The Python model service is not running or unreachable.

**Solutions:**
1. Check model service status: `docker ps | grep model-service`
2. Verify MODEL_SERVICE_URL environment variable
3. Check model service logs: `docker logs fovea-model-service`
4. Test model service health: `curl http://localhost:8000/health`

### "CUDA out of memory" Error

The selected model requires more VRAM than available.

**Solutions:**
1. Select a smaller model variant
2. Reduce `maxFrames` parameter
3. Disable audio processing temporarily
4. Use external API instead of local model
5. Clear GPU memory: Restart model service

### Audio Transcription Failing

Audio processing may fail due to missing audio stream or configuration issues.

**Solutions:**
1. Verify video has audio: `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 video.mp4`
2. Check audio model is configured in `config/models.yaml`
3. If using external API, verify API key is set
4. Try disabling speaker diarization if it's causing issues
5. Check supported audio languages match video content

### Slow Processing Times

Processing time depends on video length, frame count, audio length, and fusion strategy.

**Expected Processing Times:**
- Visual only (30 frames): 5-15 seconds
- With audio (60s video): 15-45 seconds
- With speaker diarization: 30-90 seconds
- Timestamp-aligned fusion: +20-30%
- Hybrid fusion: +50-100%

**Optimization Tips:**
1. Reduce `maxFrames` and `frameSampleRate`
2. Use `sequential` fusion strategy
3. Disable speaker diarization unless needed
4. Use smaller/faster models
5. Use external APIs for faster processing

### Summary Quality Issues

If summaries lack detail or miss key information:

**Solutions:**
1. Increase `frameSampleRate` to capture more frames
2. Increase `maxFrames` for longer videos
3. Enable audio transcription for dialogue-heavy content
4. Use timestamp-aligned or hybrid fusion for better context
5. Try different VLM models (larger = better quality)
6. Refine persona's `informationNeed` to guide analysis

## See Also

- [Audio Transcription API](./audio-transcription) - Audio processing details
- [Personas API](./personas) - Creating and managing personas
- [Videos API](./videos) - Video upload and metadata
- [Model Management API](./model-management) - Configuring VLM models
- [External API Integration](../concepts/external-api-integration) - Using cloud-based models
- [Audio-Visual Fusion Strategies](../user-guides/audio/fusion-strategies) - Fusion strategy details
