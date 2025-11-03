---
title: Audio Transcription API
sidebar_position: 8
---

# Audio Transcription API

Audio transcription capabilities for video summarization. The model service supports transcribing audio from videos with optional speaker diarization and audio-visual fusion strategies.

## Overview

Audio transcription is integrated into the video summarization endpoint (`/api/summarize`). Enable audio processing by setting `enable_audio: true` in the request. The system supports:

- Local transcription models (Whisper, Faster-Whisper)
- External audio APIs (AssemblyAI, Deepgram, Azure, AWS, Google, Rev.ai, Gladia)
- Speaker diarization with Pyannote Audio
- Four fusion strategies for combining audio and visual analysis

## Audio Parameters

Add these parameters to the `/api/summarize` request to enable audio transcription:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `enable_audio` | boolean | No | `false` | Enable audio transcription |
| `audio_language` | string \| null | No | `null` | Language code (e.g., "en", "es"). Auto-detects if null |
| `enable_speaker_diarization` | boolean | No | `false` | Enable speaker identification |
| `fusion_strategy` | string \| null | No | `"sequential"` | Audio-visual fusion strategy |

### Fusion Strategy Options

| Strategy | Description |
|----------|-------------|
| `sequential` | Process audio and visual independently, then combine |
| `timestamp_aligned` | Align audio segments with visual frames by timestamp |
| `native_multimodal` | Use multimodal model (GPT-4o, Gemini 2.5 Flash) for joint processing |
| `hybrid` | Weighted combination of multiple approaches |

## Response Fields

When audio transcription is enabled, the response includes these additional fields:

| Field | Type | Description |
|-------|------|-------------|
| `audio_transcript` | string \| null | Full transcript text |
| `transcript_json` | object \| null | Structured transcript with segments and speakers |
| `audio_language` | string \| null | Detected or specified language code |
| `speaker_count` | number \| null | Number of distinct speakers identified |
| `audio_model_used` | string \| null | Audio transcription model name |
| `visual_model_used` | string \| null | Visual analysis model name |
| `fusion_strategy` | string \| null | Fusion strategy applied |
| `processing_time_audio` | number \| null | Audio processing time in seconds |
| `processing_time_visual` | number \| null | Visual processing time in seconds |
| `processing_time_fusion` | number \| null | Fusion processing time in seconds |

## Transcript JSON Schema

The `transcript_json` field contains structured transcription data:

```json
{
  "segments": [
    {
      "start": 5.2,
      "end": 12.8,
      "text": "Welcome to the presentation.",
      "speaker": "Speaker 1",
      "confidence": 0.94
    },
    {
      "start": 13.5,
      "end": 20.1,
      "text": "Today we will discuss the quarterly results.",
      "speaker": "Speaker 2",
      "confidence": 0.91
    }
  ],
  "language": "en",
  "speaker_count": 2
}
```

### Transcript Segment Fields

| Field | Type | Description |
|-------|------|-------------|
| `start` | number | Start time in seconds |
| `end` | number | End time in seconds |
| `text` | string | Transcribed text for this segment |
| `speaker` | string \| null | Speaker label (e.g., "Speaker 1") if diarization enabled |
| `confidence` | number | Confidence score from 0.0 to 1.0 |

## Examples

### Basic Audio Transcription

Enable audio transcription with default settings:

```bash
curl -X POST http://localhost:8000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "video_id": "abc-123",
    "persona_id": "persona-456",
    "frame_sample_rate": 1,
    "max_frames": 30,
    "enable_audio": true
  }'
```

**Response (200):**

```json
{
  "id": "summary-789",
  "video_id": "abc-123",
  "persona_id": "persona-456",
  "summary": "The video shows a business meeting where two speakers discuss quarterly results...",
  "visual_analysis": "Frame 0: Conference room with presentation screen...",
  "audio_transcript": "Welcome to the presentation. Today we will discuss the quarterly results.",
  "key_frames": [
    {
      "frame_number": 0,
      "timestamp": 0.0,
      "description": "Opening slide",
      "confidence": 0.95
    }
  ],
  "confidence": 0.92,
  "transcript_json": {
    "segments": [
      {
        "start": 5.2,
        "end": 12.8,
        "text": "Welcome to the presentation.",
        "speaker": null,
        "confidence": 0.94
      }
    ],
    "language": "en",
    "speaker_count": 1
  },
  "audio_language": "en",
  "speaker_count": null,
  "audio_model_used": "whisper-large-v3",
  "visual_model_used": "llama-4-maverick",
  "fusion_strategy": "sequential",
  "processing_time_audio": 12.5,
  "processing_time_visual": 8.3,
  "processing_time_fusion": 1.2
}
```

### With Speaker Diarization

Enable speaker diarization to identify multiple speakers:

```bash
curl -X POST http://localhost:8000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "video_id": "abc-123",
    "persona_id": "persona-456",
    "enable_audio": true,
    "enable_speaker_diarization": true,
    "audio_language": "en"
  }'
```

**Response (200):**

```json
{
  "id": "summary-790",
  "video_id": "abc-123",
  "persona_id": "persona-456",
  "summary": "Two speakers discuss quarterly results in a business meeting...",
  "audio_transcript": "Speaker 1: Welcome to the presentation. Speaker 2: Thank you for joining us.",
  "transcript_json": {
    "segments": [
      {
        "start": 5.2,
        "end": 12.8,
        "text": "Welcome to the presentation.",
        "speaker": "Speaker 1",
        "confidence": 0.94
      },
      {
        "start": 13.5,
        "end": 20.1,
        "text": "Thank you for joining us.",
        "speaker": "Speaker 2",
        "confidence": 0.91
      }
    ],
    "language": "en",
    "speaker_count": 2
  },
  "audio_language": "en",
  "speaker_count": 2,
  "audio_model_used": "whisper-large-v3",
  "visual_model_used": "llama-4-maverick",
  "fusion_strategy": "sequential",
  "processing_time_audio": 18.7,
  "processing_time_visual": 8.3,
  "processing_time_fusion": 1.5
}
```

### Timestamp-Aligned Fusion

Use timestamp alignment to correlate audio segments with visual frames:

```bash
curl -X POST http://localhost:8000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "video_id": "abc-123",
    "persona_id": "persona-456",
    "enable_audio": true,
    "fusion_strategy": "timestamp_aligned"
  }'
```

**Response (200):**

```json
{
  "id": "summary-791",
  "video_id": "abc-123",
  "persona_id": "persona-456",
  "summary": "At 5.2 seconds, the speaker welcomes viewers while a title slide appears...",
  "visual_analysis": "Frame 0 (0.0s): Title slide. Frame 150 (5.0s): Speaker at podium...",
  "audio_transcript": "Welcome to the presentation. Today we will discuss the quarterly results.",
  "fusion_strategy": "timestamp_aligned",
  "audio_model_used": "whisper-large-v3",
  "visual_model_used": "llama-4-maverick",
  "processing_time_audio": 12.5,
  "processing_time_visual": 8.3,
  "processing_time_fusion": 2.8
}
```

### Native Multimodal Processing

Use GPT-4o or Gemini 2.5 Flash for joint audio-visual processing:

```bash
curl -X POST http://localhost:8000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "video_id": "abc-123",
    "persona_id": "persona-456",
    "enable_audio": true,
    "fusion_strategy": "native_multimodal"
  }'
```

**Response (200):**

```json
{
  "id": "summary-792",
  "video_id": "abc-123",
  "persona_id": "persona-456",
  "summary": "A comprehensive analysis showing the speaker's body language aligned with key financial points...",
  "audio_transcript": "Welcome to the presentation. Today we will discuss the quarterly results.",
  "fusion_strategy": "native_multimodal",
  "audio_model_used": "gpt-4o",
  "visual_model_used": "gpt-4o",
  "processing_time_audio": 15.2,
  "processing_time_visual": 15.2,
  "processing_time_fusion": 0.0
}
```

## Error Responses

### 400 Bad Request

Invalid parameters or missing API keys:

```json
{
  "error": "BadRequest",
  "message": "Audio transcription requires API key for provider 'deepgram'",
  "details": {
    "provider": "deepgram",
    "resolution_chain": "user_keys -> system_keys -> environment"
  }
}
```

### 404 Not Found

Video file not found:

```json
{
  "error": "NotFound",
  "message": "Video not found: abc-123"
}
```

### 422 Validation Error

Invalid parameter values:

```json
{
  "detail": [
    {
      "loc": ["body", "fusion_strategy"],
      "msg": "value is not a valid enumeration member; permitted: 'sequential', 'timestamp_aligned', 'native_multimodal', 'hybrid'",
      "type": "type_error.enum"
    }
  ]
}
```

### 500 Internal Server Error

Processing failure:

```json
{
  "error": "InternalServerError",
  "message": "Audio transcription failed: Unsupported audio format",
  "details": {
    "video_id": "abc-123",
    "audio_codec": "unknown"
  }
}
```

## Configuration

Configure audio transcription via API keys. The system resolves API keys in this order:

1. **User-level keys** - Set in Settings > API Keys (user-scoped)
2. **System-level keys** - Set in Admin Panel > API Keys (admin-only)
3. **Environment variables** - Set in `model-service/.env` (fallback)

### Supported Audio Providers

| Provider | Model | API Key Environment Variable |
|----------|-------|------------------------------|
| AssemblyAI | Universal-2 | `ASSEMBLYAI_API_KEY` |
| Deepgram | Nova-3 | `DEEPGRAM_API_KEY` |
| Azure Speech | default | `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` |
| AWS Transcribe | default | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `AWS_DEFAULT_REGION` |
| Google Speech | Chirp 2 | `GOOGLE_APPLICATION_CREDENTIALS` |
| Rev.ai | default | `REVAI_API_KEY` |
| Gladia | default | `GLADIA_API_KEY` |

### Local Models

Configure local transcription models in `model-service/config/models.yaml`:

```yaml
tasks:
  audio_transcription:
    models:
      - name: whisper-v3-turbo
        model_id: openai/whisper-large-v3-turbo
        framework: faster_whisper
        device: cuda
      - name: whisper-large-v3
        model_id: openai/whisper-large-v3
        framework: transformers
        device: cuda
```

## Performance Considerations

### Processing Time

Processing time varies by configuration:

- **Local models**: 0.5x to 2x real-time (depends on hardware)
- **External APIs**: 0.3x to 1x real-time (depends on provider)
- **Speaker diarization**: Adds 30-50% processing time
- **Fusion strategies**: Minimal overhead (1-3 seconds)

### GPU Memory

Local transcription models require GPU memory:

- **Whisper Large v3**: 10GB VRAM (float16)
- **Whisper Turbo**: 6GB VRAM (float16)
- **Faster-Whisper**: 4-8GB VRAM (int8_float16)
- **Pyannote Audio**: 2GB VRAM (additional)

### Accuracy Tradeoffs

| Model | Speed | Accuracy | GPU Memory |
|-------|-------|----------|------------|
| Whisper Turbo | Fast | Good | 6GB |
| Whisper Large v3 | Slow | Excellent | 10GB |
| AssemblyAI | Fast | Excellent | N/A |
| Deepgram | Very Fast | Excellent | N/A |

## See Also

- [Audio Transcription User Guide](../user-guides/audio/transcription-overview)
- [Audio-Visual Fusion Strategies](../user-guides/audio/fusion-strategies)
- [External API Configuration](../user-guides/external-apis)
- [Video Summarization API](./video-summarization)
