---
title: Audio Processing
---

# Audio Processing

The model service performs audio transcription, speaker diarization, and voice activity detection (VAD) through the `audio_processing` application service. Local loaders and vendor adapters are interchangeable: the selected backend is determined by `model-service/config/models.yaml` (or `models-cpu.yaml`), and per-request `audio_overrides` can override the defaults.

## Tasks

| Task | Default model | Local loaders | External vendors |
|------|---------------|---------------|------------------|
| Transcription | `canary-qwen-2-5b` (GPU) / `faster-whisper-medium-cpu` (CPU) | Canary-Qwen, Parakeet TDT, WhisperX, faster-whisper | AssemblyAI, AWS Transcribe, Azure Speech, Deepgram, Gladia, Google Speech, Rev AI |
| Speaker diarization | `pyannote-3-1` | pyannote 3.1 | (vendor-provided where available) |
| Voice activity detection | `silero-vad` | Silero VAD | (vendor-provided where available) |

## Architecture

The service depends on three outbound ports declared in `application/ports/outbound`. Each port has a default local adapter and a vendor router adapter:

- **Local loaders** under `infrastructure/adapters/outbound/models/audio/`:
  - `canary.py` (Canary-Qwen 2.5B; default GPU transcriber)
  - `parakeet.py` (Parakeet TDT for streaming and low-latency)
  - `whisperx.py` (WhisperX with diarization)
  - `loader.py` and `adapters.py` for factory dispatch
- **CPU local transcription** uses **faster-whisper** through the CTranslate2 backend (`models/ctranslate2/`)
- **Diarization and VAD** local: pyannote 3.1 and Silero VAD
- **Vendor adapters** under `infrastructure/adapters/outbound/external_apis/audio/`:
  - `assemblyai_client.py`, `aws_transcribe_client.py`, `azure_speech_client.py`, `deepgram_client.py`, `gladia_client.py`, `google_speech_client.py`, `revai_client.py`
  - All share `base.py` for upload / poll / fetch flow and consistent error handling

The vendor router consults the active task config and the request's `audio_overrides`, then dispatches to the matching adapter.

## Configuration

```yaml
audio_transcription:
  selected: "canary-qwen-2-5b"
  options:
    canary-qwen-2-5b:
      model_id: "nvidia/canary-qwen-2.5b"
      framework: "transformers"
      vram_gb: 6
      description: "Canary-Qwen 2.5B (NVIDIA NeMo), default transcriber"
    parakeet-tdt:
      model_id: "nvidia/parakeet-tdt-0.6b-v2"
      framework: "transformers"
      vram_gb: 4
      description: "Parakeet TDT for low-latency streaming"
    whisperx:
      model_id: "openai/whisper-large-v3"
      framework: "whisperx"
      vram_gb: 10
      description: "WhisperX with built-in diarization"
    assemblyai:
      framework: "external"
      provider: "assemblyai"
      description: "AssemblyAI Universal-2 (requires ASSEMBLYAI_API_KEY)"

speaker_diarization:
  selected: "pyannote-3-1"
  options:
    pyannote-3-1:
      model_id: "pyannote/speaker-diarization-3.1"
      framework: "pyannote"

voice_activity_detection:
  selected: "silero-vad"
  options:
    silero-vad:
      framework: "silero"
```

CPU configuration in `models-cpu.yaml` selects `faster-whisper-medium-cpu` for transcription while keeping pyannote and Silero VAD as the diarization and VAD defaults.

## Vendor API keys

Each vendor adapter reads its credentials from the environment:

| Vendor | Key |
|--------|-----|
| AssemblyAI | `ASSEMBLYAI_API_KEY` |
| AWS Transcribe | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` |
| Azure Speech | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` |
| Deepgram | `DEEPGRAM_API_KEY` |
| Gladia | `GLADIA_API_KEY` |
| Google Speech | `GOOGLE_API_KEY` (or service-account credentials) |
| Rev AI | `REVAI_API_KEY` |

Keys can also be set per-user through the API keys management UI, or system-wide through the admin panel; environment variables act as the final fallback.

## Request overrides

Summarize requests carry an optional `audio_overrides` block. The backend forwards this verbatim to the model service as `audio_overrides`. Recognized keys include:

- `transcription_model`: override the configured transcriber for this call
- `diarization_enabled`: bool
- `vad_enabled`: bool
- `language_hint`, `vocabulary_hints`: passed to vendor adapters that support them

Per-persona pins from `PersonaPreferences` are merged with user defaults from `UserPreferences` before dispatch (persona pins win). See [Inference Preferences](../user-guides/admin/inference-preferences.md).

## Audio-visual fusion

`fuse_modalities` consumes the transcript output and the VLM-produced video summary, returning a fused summary with aligned timestamps. The fusion strategy is configurable; see [Fusion Strategies](../user-guides/audio/fusion-strategies.md).

## Tests

The audio adapters are covered by 158 model-service tests, including:

- `test/loaders/audio/` for Canary, Parakeet, and WhisperX
- `test/external_apis/audio/` for all seven vendor clients (with vendor SDK stubs in `conftest.py` for CI)
- `test/application/services/test_audio_processing.py` for the service composition

## Next steps

- [Transcription overview (user guide)](../user-guides/audio/transcription-overview.md)
- [Fusion strategies](../user-guides/audio/fusion-strategies.md)
- [Inference preferences](../user-guides/admin/inference-preferences.md)
