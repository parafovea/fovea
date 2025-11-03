---
title: Audio Transcription & Speaker Diarization
sidebar_position: 1
---

# Audio Transcription & Speaker Diarization

FOVEA provides audio transcription and speaker identification capabilities to extract spoken content from videos and identify different speakers. This feature enables multimodal analysis by combining visual and audio information.

## What is Audio Transcription?

Audio transcription converts spoken audio in videos into text with timestamp information. Each transcription includes:

- **Transcript segments**: Time-stamped text segments aligned with video frames
- **Speaker labels**: Identification of different speakers (when diarization is enabled)
- **Language detection**: Automatic identification of spoken language
- **Confidence scores**: Quality metrics for transcription accuracy

Transcripts are generated during video summarization and stored with the summary for later viewing and analysis.

## Why Use Audio Transcription?

Audio transcription is useful when:

- Videos contain important spoken information (interviews, narration, dialogue)
- You need to identify who is speaking and when
- Searching for specific words or phrases in video content
- Analyzing conversations or multi-speaker events
- Generating comprehensive summaries that include both visual and audio content
- Creating searchable metadata for video archives

## Supported Providers

FOVEA supports both local models and external API services for audio transcription.

### Local Models

Local models run on your infrastructure without external API costs:

| Model | Framework | Description |
|-------|-----------|-------------|
| **Whisper** | OpenAI Whisper | General-purpose transcription (base, small, medium, large) |
| **Faster-Whisper** | CTranslate2 | Optimized Whisper implementation (4x faster) |
| **Transformers** | Hugging Face | Pipeline-based transcription with flexible model selection |

**When to use local models:**
- Privacy requirements prohibit external API calls
- No internet connectivity
- High-volume transcription needs (cost efficiency)
- GPU resources available for faster processing

### External API Services

External APIs provide high-quality transcription without local infrastructure:

| Provider | Features | Best For |
|----------|----------|----------|
| **AssemblyAI** | Universal-2 model, speaker diarization, sentiment analysis | General-purpose transcription with speaker ID |
| **Deepgram** | Nova-3 model, real-time streaming, highest accuracy | High-accuracy transcription, multiple languages |
| **Azure Speech** | Real-time streaming, custom models, 90+ languages | Enterprise deployments, Microsoft ecosystem |
| **AWS Transcribe** | Speaker diarization, medical/legal vocabularies | AWS infrastructure, domain-specific needs |
| **Google Speech-to-Text** | Chirp 2 model, 125+ languages, word-level timestamps | Google Cloud integration, multilingual content |
| **Rev.ai** | Human-level accuracy, speaker diarization | Professional transcription, critical accuracy |
| **Gladia** | Multilingual, code-switching, named entity recognition | Conversation analysis, entity extraction |

**When to use external APIs:**
- Need highest accuracy transcription
- Limited local GPU resources
- Require specialized features (sentiment, entities)
- Occasional transcription needs (pay-per-use)

See [Configuring External APIs](../external-apis.md) for setup instructions.

## Enabling Audio Transcription

Audio transcription is enabled when generating video summaries.

### Step 1: Configure API Keys (if using external APIs)

If using external transcription services, configure your API key first:

1. Open **Settings** (user menu, top-right)
2. Navigate to **API Keys** tab
3. Click **Add API Key**
4. Select provider (AssemblyAI, Deepgram, etc.)
5. Enter your API key
6. Click **Save**

See [External API Configuration](../external-apis.md) for provider-specific setup.

### Step 2: Generate Summary with Audio

1. Select a video from your video list
2. Click **Generate Summary** button
3. In the summarization dialog, expand **Audio Options**
4. Check **Enable Audio Transcription**
5. Configure audio options:
   - **Language**: Specify language code (e.g., "en", "es") or leave blank for auto-detection
   - **Speaker Diarization**: Enable to identify different speakers
   - **Fusion Strategy**: Choose how audio and visual analysis are combined (see [Fusion Strategies](./fusion-strategies.md))
6. Click **Generate** to start processing

The system processes audio in the background. Progress updates appear in the UI.

### Step 3: View Transcript

After processing completes:

1. Open the video summary (click summary card or "View Summary" button)
2. Scroll to **Audio Transcript** section
3. Review transcript segments with timestamps
4. If speaker diarization was enabled, speaker labels appear next to each segment

## Speaker Diarization

Speaker diarization identifies and labels different speakers in audio.

### What is Speaker Diarization?

Diarization segments the audio by speaker and assigns labels (Speaker 1, Speaker 2, etc.):

```
[00:00:05 - 00:00:12] Speaker 1: "Welcome to today's meeting."
[00:00:13 - 00:00:28] Speaker 2: "Thanks for joining. Let's review the agenda."
[00:00:29 - 00:00:45] Speaker 1: "We have three topics to cover today."
```

The system does not identify who the speakers are by name, only that different speakers exist and when they speak.

### Enabling Speaker Diarization

When generating a video summary:

1. Enable **Audio Transcription** checkbox
2. Enable **Speaker Diarization** checkbox
3. Select a provider that supports diarization (see table above)
4. Generate the summary

Not all providers support speaker diarization. Local Pyannote Audio models provide speaker identification when using local transcription.

### Speaker Count

The system automatically determines the number of distinct speakers. This information appears in the summary metadata:

- **Speaker Count**: Number of unique speakers detected
- **Speaker Labels**: Labels assigned to each speaker (Speaker 1, Speaker 2, etc.)

## Language Support

### Automatic Language Detection

By default, the system auto-detects the spoken language. Most providers support 50+ languages including:

- English (en), Spanish (es), French (fr), German (de), Italian (it)
- Mandarin (zh), Japanese (ja), Korean (ko)
- Arabic (ar), Russian (ru), Portuguese (pt)
- Hindi (hi), Turkish (tr), Dutch (nl)

### Specifying Language

To improve accuracy or processing speed, specify the language:

1. In the audio configuration panel, enter the language code in **Language** field
2. Use ISO 639-1 codes: "en" for English, "es" for Spanish, etc.
3. Leave blank for automatic detection

Specifying the language reduces processing time and can improve transcription accuracy for known language content.

## Audio Quality Requirements

For best transcription results:

- **Clear audio**: Minimal background noise
- **Supported formats**: MP4, MOV, AVI, MKV (audio track required)
- **Sample rate**: 16kHz or higher recommended
- **Volume**: Consistent, audible speech
- **Speakers**: Clear separation for diarization

The system processes audio regardless of quality, but poor audio produces lower-quality transcripts.

## Viewing Transcripts

Transcripts appear in the **Transcript Viewer** component after summary generation.

### Transcript Structure

Each transcript includes:

- **Segments**: Time-stamped text segments
- **Timestamps**: Start and end times for each segment
- **Speaker labels**: Speaker identification (if diarization enabled)
- **Confidence scores**: Transcription quality metrics
- **Language**: Detected or specified language code

### Searching Transcripts

Use your browser's search function (Ctrl+F or Cmd+F) to find specific words or phrases in the transcript. Future versions may include integrated search capabilities.

### Exporting Transcripts

Transcripts are saved as part of the video summary in JSON format. Export the summary to retrieve the transcript data:

```json
{
  "transcript_json": {
    "segments": [
      {
        "start": 5.2,
        "end": 12.8,
        "text": "Welcome to today's meeting.",
        "speaker": "Speaker 1",
        "confidence": 0.94
      }
    ],
    "language": "en",
    "speaker_count": 3
  }
}
```

## Troubleshooting

### Audio Transcription Not Available

**Problem**: Audio transcription option is disabled or missing.

**Solutions**:
- Verify model service is running (http://localhost:8000/docs)
- Check that video contains an audio track
- Ensure API keys are configured if using external providers
- Review model service logs for errors

### Transcription Returns Empty Result

**Problem**: Transcript is empty or contains no text.

**Solutions**:
- Verify video has audible speech (not just music or silence)
- Check audio volume is sufficient
- Try a different transcription provider
- Increase audio processing timeout in configuration
- Review audio track format (some codecs may not be supported)

### Speaker Diarization Not Working

**Problem**: All segments show the same speaker or no speaker labels.

**Solutions**:
- Verify provider supports speaker diarization (see table above)
- Check that multiple speakers are actually present in audio
- Ensure speakers have distinct voices (similar voices may be grouped)
- Try increasing the audio quality
- Use a different diarization provider

### Language Detection is Wrong

**Problem**: System detects incorrect language.

**Solutions**:
- Manually specify the language code in audio configuration
- Ensure audio is clear and intelligible
- Check that the detected language is supported by your provider
- Try a different transcription provider with better language support

### External API Errors

**Problem**: API request fails with authentication or quota errors.

**Solutions**:
- Verify API key is correctly configured in Settings > API Keys
- Check API key has not expired
- Review API quota limits with your provider
- Ensure API key has correct permissions enabled
- Test API key directly with provider's API (outside of FOVEA)

### Poor Transcription Quality

**Problem**: Transcript contains many errors or inaccuracies.

**Solutions**:
- Improve audio quality (reduce background noise, increase volume)
- Specify the correct language instead of auto-detection
- Try a different transcription provider (external APIs often more accurate)
- Use speaker diarization to improve segment accuracy
- For critical transcription, consider professional services (Rev.ai)

## Next Steps

- **[Audio-Visual Fusion Strategies](./fusion-strategies.md)**: Learn how audio and visual analysis are combined
- **[External API Configuration](../external-apis.md)**: Set up external transcription providers
- **[Video Summarization](../../model-service/video-summarization.md)**: Understand the full summarization workflow
- **[API Reference: Audio Transcription](../../api-reference/audio-transcription.md)**: Technical API documentation
