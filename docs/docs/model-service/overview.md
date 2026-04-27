---
title: Overview
---

# Model Service Overview

The model service is a Python 3.12 FastAPI application that performs inference for video summarization, object detection, tracking, ontology augmentation, claim extraction and synthesis, and audio processing (transcription, diarization, voice activity detection). The service is structured as a Clean Architecture application with explicit ports and adapters.

## Architecture

```
FastAPI inbound adapters  (infrastructure/adapters/inbound)
        v
Use cases                 (application/use_cases)
        v
Ports                     (application/ports/{inbound,outbound})
        v
Outbound adapters         (infrastructure/adapters/outbound)
        v
Loaders                   (infrastructure/adapters/outbound/models/{vlm,llm,detection,tracking,audio,onnx,llama_cpp,sam3,ctranslate2})
```

Source layout:

| Layer | Path | Contents |
|-------|------|----------|
| Domain | `model-service/src/domain/` | Entities, value objects, exception hierarchy, shared types |
| Application | `model-service/src/application/` | Use cases, service interfaces, DTOs, inbound and outbound ports |
| Infrastructure | `model-service/src/infrastructure/` | FastAPI routes, outbound adapters (VLM, LLM, detection, tracking, audio, video, persistence, external APIs), config, observability |
| Composition root | `model-service/src/main.py` | Dependency injection container that wires use cases to adapters |

Use cases depend only on DTOs and ports, never on `torch` or model-loader libraries. Loader factories dispatch to the right adapter based on the `framework` field in the YAML config (`sglang`, `vllm`, `transformers`, `onnx`, `llama_cpp`).

OpenTelemetry spans wrap every use case, and `model_inference` metrics fire on every outbound adapter. Reasoning-trace DTOs (`ThinkingTrace`, `ReasonedText`) carry chain-of-thought through use cases and FastAPI schemas when a `supports_thinking` model is selected.

## Tasks

| Task | Endpoint | Use case |
|------|----------|----------|
| Video summarization | `POST /api/summarize` | `summarize_video`, `fuse_modalities` |
| Object detection | `POST /api/detect` | `detect_objects` |
| Object tracking | `POST /api/track` | `track_objects` |
| Ontology augmentation | `POST /api/augment` | `augment_ontology` |
| Claim extraction | `POST /api/claims/extract` | `extract_claims` |
| Claim synthesis | `POST /api/claims/synthesize` | `synthesize_summary` |
| Audio transcription | invoked by `summarize_video` | `audio_processing` service |
| Admin reconfigure | `POST /api/admin/reconfigure` | applies `reconfigure_roots` and updates `ModelManager` knobs |

## Model catalog (2026)

The catalog is defined in `model-service/config/models.yaml` (GPU build) and `model-service/config/models-cpu.yaml` (CPU build, selected by `DEVICE=cpu` via build-time symlink). Per-task entries declare a `selected` model and an `options` map; `YamlModelRepository` parses both into `TaskConfig` rows.

### Vision-language (video summarization, claim synthesis)

- **Qwen3-VL** family (`qwen-3-vl-8b`, `-8b-thinking`, `-30b-a3b`, `-30b-a3b-thinking`, `-235b-a22b`) with 256K-1M context
- **Tarsier2-7b** for long-form video description
- **Moondream3** for compact local VLM
- **Llama-4-Maverick**, **Gemma-3-27b**, **InternVL3-78B**, **Pixtral-Large**, **Qwen2.5-VL-7B/72B** (legacy, retained for backward compatibility)

### Language models (ontology augmentation, claim extraction, claim synthesis)

- **Qwen3** (8B and larger), **Kimi K2.6**, **GLM-4.7**, **DeepSeek R1** distills
- Closed-source providers via API adapters: **Claude 4.6 / 4.7**, **GPT-5.4**, **Gemini 3.1 Pro**, **Grok 4** (routed through `external_api_router_adapter`)

### Detection

- **YOLOv12**, **YOLOE-26**, **RF-DETR**
- Open-vocabulary: **YOLO-World v2**, **Florence-2**, **Grounding DINO 1.5**, **OWLv2**

### Tracking

- **SAM 3.1** (default), **SAM 2.1**, **SAMURAI**, **SAM2Long**, **YOLO11n-seg**

### Audio

- Local transcription: **Canary-Qwen 2.5B** (default), **Parakeet TDT**, **WhisperX**, **faster-whisper** (CPU)
- Diarization: **pyannote 3.1**
- Voice activity detection: **Silero VAD**
- External vendor adapters: **AssemblyAI**, **AWS Transcribe**, **Azure Speech**, **Deepgram**, **Gladia**, **Google Speech**, **Rev AI**

For full per-task entries (including resource hints and `supports_thinking` flags), read `model-service/config/models.yaml` and `model-service/config/models-cpu.yaml` directly.

## Audio processing

Transcription, diarization, and voice activity detection flow through the `audio_processing` application service. The service depends on three outbound ports, each backed by a loader factory or vendor adapter:

- Local loaders: `models/audio/{canary.py,parakeet.py,whisperx.py}` plus `ctranslate2` for `faster-whisper`
- External vendor adapters: `external_apis/audio/{assemblyai_client.py,aws_transcribe_client.py,azure_speech_client.py,deepgram_client.py,gladia_client.py,google_speech_client.py,revai_client.py}`, all sharing `external_apis/audio/base.py`
- The selected vendor or local loader is chosen by the YAML config; `audio_overrides` in a summarize request override the default per-call

See [Audio Processing](./audio-processing.md) for endpoint payloads and configuration knobs.

## CPU inference

CPU mode is selected by setting `DEVICE=cpu`. The Docker build replaces `models.yaml` with `models-cpu.yaml` via symlink and installs the `cpu` extras (`onnxruntime`, `llama-cpp-python`).

CPU loader paths:

- **ONNX Runtime detection** (`models/onnx/`): YOLO-World, Florence-2, Grounding DINO
- **llama.cpp LLM** (`models/llama_cpp/`): GGUF text generation for Qwen2.5-1.5B, Qwen3 GGUF builds
- **llama.cpp VLM** (`models/llama_cpp/`): GGUF multimodal inference for Qwen2.5-VL-3B, Moondream
- **SmallVLMLoader** (Transformers): SmolVLM, Moondream small variants
- **faster-whisper** (`models/ctranslate2/`): CPU audio transcription

The loader factory picks the right adapter by inspecting the `framework` field on each option in the YAML.

## Admin reconfiguration

`POST /api/admin/reconfigure` accepts `{ key, value }` rows from the backend's SystemConfig table. The handler is gated by the `MODEL_SERVICE_ADMIN_TOKEN` header (`X-Admin-Token`). Storage-path keys are dispatched through `reconfigure_roots`; runtime knobs (sampling defaults, audio defaults, detection thresholds) are applied to the live `ModelManager` without restarting the process.

The backend pushes every write through `services/system-config-propagator.ts`, and replays every persisted row on server startup so a fresh model service picks up admin state without operator intervention.

## System requirements

CPU mode runs the full feature set with smaller models (GGUF quantized LLMs and VLMs, ONNX detection, faster-whisper). GPU mode unlocks the Qwen3-VL family, SGLang and vLLM backends, and full-precision inference. Hardware sizing depends on the selected models; per-model resource hints (`vram_gb`, `cpu_memory_gb`, `cpu_compatible`, `speed`) are declared in the YAML config.

Benchmarks, when published, will live under `docs/benchmarks/`.

## Endpoints

### Health

```bash
curl http://localhost:8000/health
```

### Model info

```bash
curl http://localhost:8000/models/info
```

### Summarize

```bash
curl -X POST http://localhost:8000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/example.mp4",
    "persona_context": "Sports analyst",
    "frame_count": 8,
    "sampling_strategy": "uniform"
  }'
```

See [Video Summarization](./video-summarization.md), [Object Detection](./object-detection.md), [Video Tracking](./video-tracking.md), [Ontology Augmentation](./ontology-augmentation.md), and [Audio Processing](./audio-processing.md) for full payloads.

## Troubleshooting

### Model loading fails

Check VRAM (`nvidia-smi`), the HuggingFace cache directory, and the `selected` field in the relevant YAML section. Switching `selected` to a smaller entry (for example, `qwen-3-vl-8b` over `qwen-3-vl-235b-a22b`) is the fastest fix.

### CUDA out of memory

Lower `max_memory_per_model` in the `inference:` block of the YAML, switch to a 4-bit quantized option, or unload unused models via `POST /models/unload`.

### Connection refused

Confirm the model service container is up (`docker compose ps model-service`) and reachable from the backend (`MODEL_SERVICE_URL`).

## Next steps

- [Configure models](./configuration.md)
- [Audio Processing](./audio-processing.md)
- [Video Summarization](./video-summarization.md)
- [Object Detection](./object-detection.md)
- [Video Tracking](./video-tracking.md)
- [Ontology Augmentation](./ontology-augmentation.md)
