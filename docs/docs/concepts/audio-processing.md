---
title: Audio Processing Architecture
sidebar_position: 9
keywords: [audio, transcription, diarization, fusion, whisper, pyannote]
---

# Audio Processing Architecture

The model service provides audio transcription, speaker diarization, and audio-visual fusion capabilities through a modular architecture supporting both local models and external APIs.

## Architecture Overview

Audio processing consists of four primary subsystems:

1. **Audio Extraction**: Extract and resample audio from video files
2. **Transcription**: Convert speech to text using local or external models
3. **Speaker Diarization**: Identify and label distinct speakers
4. **Audio-Visual Fusion**: Combine audio transcripts with visual analysis

```
┌────────────────────────────────────────────────────┐
│         Video Summarization Request                 │
│     (with enable_audio=true)                        │
└──────────────────┬─────────────────────────────────┘
                   │
    ┌──────────────┴─────────────────┐
    │                                │
    ▼                                ▼
┌─────────────────────┐    ┌──────────────────────┐
│  Audio Extraction    │    │  Visual Processing   │
│  (audio_utils.py)    │    │  (VLM inference)     │
└──────────┬───────────┘    └──────────┬───────────┘
           │                           │
           ▼                           │
┌──────────────────────────────────────┐│
│   Transcription Router                ││
│ (Local vs External API)               ││
└───┬──────────────┬───────────────────┘│
    │              │                    │
    ▼              ▼                    │
┌─────────┐  ┌────────────────┐        │
│ Local   │  │ External APIs  │        │
│ Whisper │  │ (7 providers)  │        │
└────┬────┘  └────────┬───────┘        │
     │                │                │
     │    ┌───────────┴────────┐       │
     │    │                    │       │
     ▼    ▼                    ▼       │
┌─────────────────────────────────┐   │
│    Speaker Diarization          │   │
│    (Pyannote Audio)             │   │
└────────────┬────────────────────┘   │
             │                        │
             ▼                        │
    ┌────────────────────────────────┴──┐
    │   Audio-Visual Fusion              │
    │   (4 strategies)                   │
    └────────────┬───────────────────────┘
                 │
                 ▼
         ┌──────────────────┐
         │ Unified Summary   │
         │ with transcript   │
         └──────────────────┘
```

## Audio Extraction

Audio extraction uses FFmpeg to extract and process audio from video files.

### Audio Utilities (`audio_utils.py`)

Provides functions for audio stream detection and extraction:

```python
# Check if video has audio
has_audio = await has_audio_stream(video_path)

# Get audio metadata
audio_info = await get_audio_info(video_path)
# Returns: {
#   "codec": "aac",
#   "sample_rate": 48000,
#   "channels": 2,
#   "duration": 120.5,
#   "bitrate": 128000
# }

# Extract audio to temporary file
audio_path = await extract_audio_from_video(
    video_path=video_path,
    output_path="/tmp/audio.wav",
    sample_rate=16000,  # Resample for Whisper
    channels=1          # Mono for transcription
)
```

### FFmpeg Pipeline

Audio extraction pipeline:

1. **Detect audio stream**: Check if video contains audio
2. **Select audio track**: Default to first audio stream
3. **Resample**: Convert to 16kHz mono WAV (Whisper requirement)
4. **Write to temp file**: Store in `/tmp` for processing

**FFmpeg command**:
```bash
ffmpeg -i input.mp4 \
  -vn \                    # No video
  -acodec pcm_s16le \     # PCM 16-bit encoding
  -ar 16000 \             # 16kHz sample rate
  -ac 1 \                 # Mono
  output.wav
```

## Audio Loader Architecture

The audio loader provides framework support for local transcription models.

### Framework Support

Supports three transcription frameworks:

| Framework | Models | Features | Performance |
|-----------|--------|----------|-------------|
| **Whisper** | openai/whisper-* | OpenAI reference implementation | Slow, accurate |
| **Faster-Whisper** | Systran/faster-whisper-* | CTranslate2 optimized | 4x faster, int8 support |
| **Transformers** | openai/whisper-* | HuggingFace implementation | Flexible, GPU optimized |

### Transcription Config

```python
# model-service/src/audio_loader.py

@dataclass
class TranscriptionConfig:
    """Configuration for audio transcription model."""
    model_id: str                  # HuggingFace model ID
    framework: AudioFramework      # whisper, faster_whisper, transformers
    language: str | None = None    # Target language (auto-detect if None)
    task: str = "transcribe"       # "transcribe" or "translate"
    device: str = "cuda"           # "cuda" or "cpu"
    compute_type: str = "float16"  # float16, int8, int8_float16
    beam_size: int = 5             # Beam search width
```

### Model Loading Strategy

Models are loaded lazily on first use:

```python
class AudioTranscriptionLoader(ABC):
    """Abstract base class for transcription loaders."""

    def __init__(self, config: TranscriptionConfig):
        self.config = config
        self.model = None  # Loaded on demand

    @abstractmethod
    def load(self) -> None:
        """Load model into memory."""
        pass

    @abstractmethod
    def transcribe(self, audio_path: str) -> TranscriptionResult:
        """Transcribe audio file."""
        pass
```

### Transcription Result

All loaders return a standardized result:

```python
@dataclass
class TranscriptionResult:
    """Complete transcription result."""
    text: str                           # Full transcript
    segments: list[TranscriptionSegment] # Timestamped segments
    language: str                       # Detected language
    duration: float                     # Audio duration (seconds)

@dataclass
class TranscriptionSegment:
    """Single transcription segment."""
    start: float        # Start time (seconds)
    end: float          # End time (seconds)
    text: str           # Segment text
    confidence: float   # Confidence score (0.0-1.0)
```

### Model Configuration

Configured in `config/models.yaml`:

```yaml
tasks:
  audio_transcription:
    selected: "whisper-v3-turbo"
    options:
      whisper-v3-turbo:
        model_id: "openai/whisper-large-v3-turbo"
        framework: "faster_whisper"
        device: "cuda"
        compute_type: "float16"
        vram_gb: 6
        speed: "fast"
        description: "Whisper v3 Turbo, faster-whisper backend"

      whisper-large-v3:
        model_id: "openai/whisper-large-v3"
        framework: "transformers"
        device: "cuda"
        compute_type: "float16"
        vram_gb: 10
        speed: "medium"
        description: "Whisper Large v3, HuggingFace backend"

      faster-whisper-large:
        model_id: "Systran/faster-whisper-large-v3"
        framework: "faster_whisper"
        device: "cuda"
        compute_type: "int8_float16"
        vram_gb: 4
        speed: "very_fast"
        description: "Faster-Whisper with int8 quantization"
```

### Device Management

The audio loader automatically handles device placement:

- **GPU**: Uses CUDA if available, falls back to CPU
- **CPU**: Always available, slower performance
- **Mixed mode**: Some components (VAD) on CPU, others on GPU

GPU memory requirements:

| Model | fp16 | int8 | int8_float16 |
|-------|------|------|--------------|
| Whisper Large v3 | 10GB | 6GB | 4GB |
| Whisper Turbo | 6GB | 3GB | 2GB |
| Whisper Medium | 5GB | 2.5GB | 1.5GB |

## External Audio API Clients

The system supports seven external audio transcription providers.

### Provider Abstraction

All audio API clients implement a common interface:

```python
# model-service/src/external_apis/audio/base.py

class AudioAPIClient(ABC):
    """Abstract base class for external audio API clients."""

    def __init__(self, api_key: str):
        self.api_key = api_key

    @abstractmethod
    async def transcribe(
        self,
        audio_path: str,
        language: str | None = None,
        enable_diarization: bool = False,
        enable_sentiment: bool = False
    ) -> TranscriptResult:
        """Transcribe audio file using external API."""
        pass

@dataclass
class TranscriptResult:
    """Standardized transcript result."""
    text: str                            # Full transcript
    segments: list[TranscriptSegment]    # Timestamped segments
    language: str                        # Detected language
    duration: float                      # Duration in seconds
    confidence: float                    # Overall confidence
    words: list[dict] | None = None      # Word-level timestamps
```

### Supported Providers

| Provider | Model | Features | Diarization | Languages |
|----------|-------|----------|-------------|-----------|
| **AssemblyAI** | Universal-2 | High accuracy, fast | Yes (built-in) | 99+ |
| **Deepgram** | Nova-3 | Very fast, streaming | Yes (built-in) | 36+ |
| **Azure Speech** | Default | Microsoft cloud | Yes (speaker ID) | 100+ |
| **AWS Transcribe** | Default | Amazon cloud | Yes (built-in) | 31+ |
| **Google Speech** | Chirp 2 | Long-form optimized | Yes (built-in) | 125+ |
| **Rev.ai** | Default | Human-level accuracy | Yes (built-in) | 36 |
| **Gladia** | Default | Fast, affordable | Yes (built-in) | 99+ |

### Implementation Example

AssemblyAI client with polling pattern:

```python
# model-service/src/external_apis/audio/assemblyai_client.py

class AssemblyAIClient(AudioAPIClient):
    """AssemblyAI transcription API client."""

    async def transcribe(
        self, audio_path: str, language: str | None = None,
        enable_diarization: bool = False, **kwargs
    ) -> TranscriptResult:
        # 1. Upload audio file
        upload_url = await self._upload_audio(audio_path)

        # 2. Start transcription job
        transcript_id = await self._start_transcription(
            upload_url, language, enable_diarization
        )

        # 3. Poll for completion
        transcript = await self._poll_transcription(transcript_id)

        # 4. Parse and return result
        return self._parse_response(transcript)

    async def _poll_transcription(
        self, transcript_id: str, poll_interval: int = 3
    ) -> dict:
        """Poll transcription status until complete."""
        while True:
            response = await self._check_status(transcript_id)
            status = response["status"]

            if status == "completed":
                return response
            elif status == "error":
                raise RuntimeError(f"Transcription failed: {response['error']}")

            await asyncio.sleep(poll_interval)
```

### API Key Resolution

Same priority order as VLM/LLM APIs:

1. **User-level keys**: From Settings > API Keys
2. **System-level keys**: From Admin Panel (userId: null)
3. **Environment variables**: From `.env` file

Environment variables:

```env
# Audio transcription providers
ASSEMBLYAI_API_KEY=your_key_here
DEEPGRAM_API_KEY=your_key_here
AZURE_SPEECH_KEY=your_key_here
AZURE_SPEECH_REGION=eastus
AWS_ACCESS_KEY_ID=your_key_here
AWS_SECRET_ACCESS_KEY=your_secret_here
AWS_DEFAULT_REGION=us-west-2
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
REVAI_API_KEY=your_key_here
GLADIA_API_KEY=your_key_here
```

### Provider Selection

Providers are configured in `config/models.yaml`:

```yaml
tasks:
  audio_transcription:
    selected: "assemblyai"  # Default provider
    options:
      assemblyai:
        provider: "assemblyai"
        model_id: "best"
        framework: "external_api"
        requires_api_key: true
        diarization_support: true
        speed: "fast"

      deepgram:
        provider: "deepgram"
        model_id: "nova-3"
        framework: "external_api"
        requires_api_key: true
        diarization_support: true
        speed: "very_fast"
```

## Speaker Diarization Pipeline

Speaker diarization identifies who spoke when using Pyannote Audio.

### Diarization Architecture

```
┌─────────────────────────────────────┐
│  Transcription Result                │
│  (text segments with timestamps)     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Audio File                          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Pyannote Audio Pipeline             │
│  1. Voice Activity Detection (VAD)   │
│  2. Speaker Embeddings Extraction    │
│  3. Clustering (Agglomerative)       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Speaker Segments                    │
│  [(0.0-5.2, SPEAKER_00),             │
│   (5.3-10.8, SPEAKER_01), ...]       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Merge with Transcription            │
│  Assign speaker to each segment      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Diarized Transcript                 │
│  [(0.0-5.2, "Hello there", Speaker 1),│
│   (5.3-10.8, "Hi!", Speaker 2), ...] │
└─────────────────────────────────────┘
```

### Diarization Config

```python
@dataclass
class DiarizationConfig:
    """Configuration for speaker diarization."""
    model_id: str = "pyannote/speaker-diarization"
    num_speakers: int | None = None  # Auto-detect if None
    min_speakers: int = 1
    max_speakers: int = 10
    device: str = "cuda"
```

### Speaker Label Assignment

Pyannote returns labels like `SPEAKER_00`, `SPEAKER_01`. These are converted to `Speaker 1`, `Speaker 2` for user display:

```python
def assign_speaker_labels(
    transcript_segments: list[TranscriptionSegment],
    diarization_segments: list[SpeakerSegment]
) -> list[TranscriptionSegment]:
    """Assign speaker labels to transcript segments."""
    for transcript_seg in transcript_segments:
        # Find overlapping diarization segment
        overlap_speaker = find_overlapping_speaker(
            transcript_seg.start,
            transcript_seg.end,
            diarization_segments
        )

        # Convert SPEAKER_00 -> Speaker 1
        if overlap_speaker:
            speaker_num = int(overlap_speaker.split("_")[1]) + 1
            transcript_seg.speaker = f"Speaker {speaker_num}"

    return transcript_segments
```

### Diarization Performance

GPU requirements:
- **Model size**: 2GB VRAM
- **Processing speed**: 0.3x real-time on GPU, 0.1x on CPU
- **Accuracy**: 90-95% on clean audio, 70-80% with noise

Limitations:
- Struggles with overlapping speech
- May confuse similar voices
- Background music reduces accuracy
- Requires clean audio for best results

## Audio-Visual Fusion

Fusion strategies combine audio transcripts with visual analysis.

### Fusion Strategies

Four strategies are available:

| Strategy | Description | Use Case |
|----------|-------------|----------|
| **Sequential** | Process audio and visual independently, concatenate results | Default, simple combination |
| **Timestamp-Aligned** | Align audio segments with visual frames by timestamp | Correlate speech with visual events |
| **Native Multimodal** | Use GPT-4o or Gemini 2.5 Flash for joint processing | Highest quality, analyzes relationships |
| **Hybrid** | Weighted combination of multiple approaches | Best accuracy, slower |

### Fusion Architecture

```python
# model-service/src/av_fusion.py

class BaseFusionStrategy(ABC):
    """Abstract base class for fusion strategies."""

    def __init__(self, config: FusionConfig):
        self.config = config

    @abstractmethod
    async def fuse(
        self,
        audio_transcript: str,
        audio_segments: list[AudioSegment],
        visual_summary: str,
        visual_frames: list[VisualFrame],
        audio_language: str | None = None,
        speaker_count: int | None = None
    ) -> FusionResult:
        """Fuse audio and visual information."""
        pass

@dataclass
class FusionConfig:
    """Fusion configuration."""
    strategy: FusionStrategy = FusionStrategy.SEQUENTIAL
    audio_weight: float = 0.5        # Audio importance (0.0-1.0)
    visual_weight: float = 0.5       # Visual importance (0.0-1.0)
    alignment_threshold: float = 1.0 # Max time difference (seconds)
    include_transcript: bool = True
    include_speaker_labels: bool = True
```

### Sequential Fusion

Simplest strategy. Processes audio and visual independently, then concatenates:

```python
class SequentialFusion(BaseFusionStrategy):
    """Sequential fusion strategy."""

    async def fuse(self, audio_transcript, audio_segments,
                   visual_summary, visual_frames, **kwargs) -> FusionResult:
        # Combine summaries with simple template
        summary = (
            f"Visual Analysis: {visual_summary}\n\n"
            f"Audio Transcript: {audio_transcript}"
        )

        return FusionResult(
            summary=summary,
            audio_segments=audio_segments,
            visual_frames=visual_frames,
            fusion_strategy="sequential"
        )
```

### Timestamp-Aligned Fusion

Aligns audio segments with visual frames based on timestamps:

```python
class TimestampAlignedFusion(BaseFusionStrategy):
    """Timestamp-aligned fusion strategy."""

    async def fuse(self, audio_transcript, audio_segments,
                   visual_summary, visual_frames, **kwargs) -> FusionResult:
        aligned_events = []

        for frame in visual_frames:
            # Find audio segments near this frame timestamp
            nearby_audio = self._find_nearby_audio(
                frame.timestamp,
                audio_segments,
                threshold=self.config.alignment_threshold
            )

            if nearby_audio:
                aligned_events.append(
                    f"At {frame.timestamp:.1f}s: {frame.description}. "
                    f"{nearby_audio.speaker}: \"{nearby_audio.text}\""
                )

        summary = "\n".join(aligned_events)

        return FusionResult(
            summary=summary,
            audio_segments=audio_segments,
            visual_frames=visual_frames,
            fusion_strategy="timestamp_aligned"
        )

    def _find_nearby_audio(
        self, timestamp: float, segments: list[AudioSegment],
        threshold: float
    ) -> AudioSegment | None:
        """Find audio segment within threshold of timestamp."""
        for segment in segments:
            if abs(segment.start - timestamp) < threshold:
                return segment
        return None
```

### Native Multimodal Fusion

Uses GPT-4o or Gemini 2.5 Flash to jointly process audio and visual:

```python
class NativeMultimodalFusion(BaseFusionStrategy):
    """Native multimodal fusion using GPT-4o or Gemini."""

    async def fuse(self, audio_transcript, audio_segments,
                   visual_summary, visual_frames, **kwargs) -> FusionResult:
        # Build prompt with both audio and visual context
        prompt = self._build_fusion_prompt(
            audio_transcript, audio_segments,
            visual_summary, visual_frames
        )

        # Call external multimodal API (GPT-4o or Gemini)
        response = await self._call_multimodal_api(prompt)

        return FusionResult(
            summary=response["text"],
            audio_segments=audio_segments,
            visual_frames=visual_frames,
            fusion_strategy="native_multimodal"
        )

    def _build_fusion_prompt(self, audio_transcript, audio_segments,
                            visual_summary, visual_frames) -> str:
        return f"""
Analyze the following video with audio and visual information:

VISUAL ANALYSIS:
{visual_summary}

Visual frames:
{self._format_visual_frames(visual_frames)}

AUDIO TRANSCRIPT:
{audio_transcript}

Audio segments:
{self._format_audio_segments(audio_segments)}

Provide a unified summary that describes how the audio and visual
elements relate to each other. Focus on correlations, timing, and
semantic connections between what is said and what is shown.
"""
```

### Hybrid Fusion

Combines multiple strategies with configurable weights:

```python
class HybridFusion(BaseFusionStrategy):
    """Hybrid fusion combining multiple strategies."""

    async def fuse(self, audio_transcript, audio_segments,
                   visual_summary, visual_frames, **kwargs) -> FusionResult:
        # Run multiple fusion strategies
        sequential_result = await SequentialFusion(self.config).fuse(...)
        aligned_result = await TimestampAlignedFusion(self.config).fuse(...)

        # Weighted combination
        summary = (
            f"{self.config.audio_weight * aligned_result.summary} "
            f"{self.config.visual_weight * sequential_result.summary}"
        )

        return FusionResult(
            summary=summary,
            audio_segments=audio_segments,
            visual_frames=visual_frames,
            fusion_strategy="hybrid"
        )
```

## Performance Considerations

### Processing Time Comparison

For a 2-minute video (8 frames + audio):

| Configuration | Audio Time | Visual Time | Fusion Time | Total |
|---------------|-----------|-------------|-------------|-------|
| **Local Whisper + Sequential** | 12s | 8s | 1s | 21s |
| **Faster-Whisper + Sequential** | 3s | 8s | 1s | 12s |
| **AssemblyAI + Sequential** | 8s | 8s | 1s | 17s |
| **Deepgram + Sequential** | 4s | 8s | 1s | 13s |
| **GPT-4o Native Multimodal** | 15s | 15s | 0s | 15s |

### GPU Memory Requirements

Cumulative memory for audio + visual processing:

| Configuration | Audio VRAM | Visual VRAM | Total VRAM |
|---------------|-----------|-------------|------------|
| Whisper Large + Llama-4-Maverick | 10GB | 62GB | 72GB |
| Whisper Turbo + Qwen2.5-VL-72B | 6GB | 36GB | 42GB |
| Faster-Whisper int8 + Gemma-3-27b | 4GB | 14GB | 18GB |
| External APIs only | 0GB | 0GB | 0GB |

Models can share GPU memory if loaded sequentially (audio first, then visual).

### Accuracy Tradeoffs

| Model | Transcription WER | Diarization Accuracy | Processing Speed |
|-------|------------------|---------------------|------------------|
| Whisper Large v3 | 5-8% | 90-95% (with Pyannote) | 0.5x real-time |
| Whisper Turbo | 8-12% | 90-95% | 2x real-time |
| AssemblyAI | 4-7% | 92-96% | 1x real-time |
| Deepgram Nova-3 | 6-9% | 90-94% | 3x real-time |

WER = Word Error Rate (lower is better)

## Design Rationale

### Why Abstract Base Classes?

1. **Consistency**: All providers return standardized results
2. **Testability**: Easy to mock for unit tests
3. **Extensibility**: Add new providers without changing client code
4. **Swappability**: Switch providers via configuration

### Why Separate Audio and Visual Processing?

1. **Modularity**: Audio can be disabled without affecting visual
2. **Performance**: Process in parallel on different GPUs
3. **Flexibility**: Use different models for each modality
4. **Testability**: Test audio and visual pipelines independently

### Why Multiple Fusion Strategies?

1. **Use Case Variety**: Different videos need different approaches
2. **Quality Tradeoffs**: Sequential is fast, multimodal is accurate
3. **Cost Control**: External APIs charge per token, local is free
4. **Experimentation**: Users can compare strategies

### Why Lazy Model Loading?

1. **Memory Efficiency**: Only load models when needed
2. **Startup Speed**: Fast startup, load on demand
3. **Resource Sharing**: Multiple requests share same model
4. **Flexibility**: Switch models without restart

## See Also

- [Audio Transcription API](../api-reference/audio-transcription.md): API reference for audio features
- [Audio Transcription User Guide](../user-guides/audio/transcription-overview.md): How to use audio features
- [Audio-Visual Fusion Strategies](../user-guides/audio/fusion-strategies.md): Fusion strategy details
- [External API Integration](./external-api-integration.md): VLM/LLM provider architecture
- [External API Configuration](../user-guides/external-apis.md): API key setup guide
