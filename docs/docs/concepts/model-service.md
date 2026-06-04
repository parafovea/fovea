# Model service

The model service is a FastAPI process that hosts the VLM, LLM,
detector, and tracker models plus the audio vendor adapters. It
exposes an HTTP surface to the backend and never talks to the
database. The backend invokes it via BullMQ jobs (for the
long-running summarization, extraction, and synthesis flows) and
direct HTTP (for detection, tracking, and thumbnail generation).

The model service is laid out as a Clean Architecture stack
(domain / application / infrastructure). This
page covers the task-slot configuration, the loader hierarchy,
and the external-API path; the layered structure is documented
in [Clean Architecture](clean-architecture.md).

## Task-slot configuration

`model-service/config/models.yaml` (GPU) and
`model-service/config/models-cpu.yaml` (CPU) declare one entry
per task slot. Each slot has a selected model id and a
dictionary of options. The Docker build creates a symlink at
`/app/config/active-models.yaml` pointing at the right file
based on the `DEVICE` build arg. `MODEL_CONFIG_PATH` overrides
the path at runtime. The model manager loads the selected
option on startup; switching options requires a restart.

The slots are:

```text
video_summarization
ontology_augmentation
claim_extraction
claim_synthesis
object_detection
object_tracking
audio_transcription
speaker_diarization
voice_activity_detection
```

The schema is documented in
[Reference > Model config](../reference/model-config.md).

## Loaders

Loaders live under
`model-service/src/infrastructure/adapters/outbound/models/`. One
subdirectory per modality, each with a `loader.py` factory and a
`base.py` shared interface so the adapter never imports the
factory directly:

```text
models/llm/                 SGLang, vLLM, Transformers LLMs
models/vlm/                 SGLang, vLLM, Transformers VLMs
models/detection/           OWLv2, Grounding DINO, YOLO-World
models/tracking/            CoTracker, SAMURAI, SAM2
models/audio/               Whisper, faster-whisper, pyannote, Silero VAD,
                            Canary, Parakeet, WhisperX
models/onnx/                ONNX Runtime YOLO-World, Florence-2,
                            Grounding DINO (CPU mode)
models/llama_cpp/           llama.cpp LLM and VLM (GGUF, CPU mode)
models/sam3/                SAM 3 / 3.1 with detection and tracking adapters
```

Each loader returns a callable wrapped behind one of the
outbound ports (`ILanguageModel`, `IVisionLanguageModel`,
`IDetectionModel`, `ITrackingModel`, `IAudioTranscriber`). The
`ModelManager` caches loaders in process memory.

## Frameworks

```text
sglang         on-GPU inference via SGLang runtime
vllm           on-GPU inference via vLLM
transformers   on-GPU inference via Transformers (also for SmolVLM /
               Moondream on CPU)
llama_cpp      CPU inference via llama.cpp (GGUF quantizations)
onnx           CPU inference via ONNX Runtime
external_api   delegate to a hosted provider
```

`external_api` options dispatch through the matching client
under
`model-service/src/infrastructure/adapters/outbound/external_apis/`.
The client receives the API key from the backend at call time
(the model service never reads the key from the database).

## Audio adapters

The seven audio vendor adapters live under
`model-service/src/infrastructure/adapters/outbound/external_apis/audio/`
and share a common `base.py`. They normalize transcripts to a
common shape: paragraph text, per-word offsets, speaker labels
(where supported), and language code. The
`AudioProcessingService` consumes that normalized shape and
hands it to the summarization use case for fusion.

```text
assemblyai_client.py
aws_transcribe_client.py
azure_speech_client.py
deepgram_client.py
gladia_client.py
google_speech_client.py
revai_client.py
```

The on-device path (Whisper, faster-whisper, Canary, Parakeet,
WhisperX) lives under `models/audio/` and runs through the
same `IAudioTranscriber` port.

## Reasoning traces

Use cases that call thinking-capable models return a
`ReasonedText` DTO with an optional `ThinkingTrace`. See
[Guide > Reasoning traces](../guide/reasoning-traces.md).

## Observability

Every use case wraps its `execute` in an OpenTelemetry span.
Every outbound adapter emits a `model_inference` metric on
every call, tagged with `model_id`, `task`, and `framework`.
Spans and metrics ship to `OTEL_EXPORTER_OTLP_ENDPOINT`; see
[Guide > Observability](../guide/observability.md).
