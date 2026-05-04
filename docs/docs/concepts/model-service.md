# Model service

The model service is a FastAPI process that hosts the VLM, LLM,
detector, and tracker models plus the audio vendor adapters. It
exposes an HTTP surface to the backend and never talks to the
database. The backend invokes it via BullMQ jobs (for the
long-running summarization, extraction, and synthesis flows) and
direct HTTP (for detection and tracking).

## Task-slot configuration

`model-service/config/models.yaml` declares one entry per task
slot. Each slot has a selected model id and a dictionary of
options. The model manager loads the selected option on startup;
switching options requires a restart.

The slots are:

```text
video_summarization
ontology_augmentation
claim_extraction
claim_synthesis
object_detection
object_tracking
audio_transcription
```

The schema is documented in
[Reference > Model config](../reference/model-config.md).

## Loaders

The model service follows a loader-per-modality pattern:

```text
vlm_loader.py            video_summarization
llm_loader.py            ontology_augmentation, claim_extraction,
                         claim_synthesis
detection_loader.py      object_detection
tracking_loader.py       object_tracking
audio_loader.py          audio_transcription (delegates to vendor adapter)
```

The loader's job is to map the option dict to a callable and
return it. The model manager caches the loaded callable in
process memory.

## Frameworks

```text
sglang         on-GPU inference via SGLang runtime
vllm           on-GPU inference via vLLM
transformers   on-GPU inference via plain Transformers
external_api   delegate to a hosted provider
```

`external_api` options dispatch through the matching client under
`model-service/src/external_apis/`. The client receives the API
key from the backend at call time (the model service never reads
the key from the database).

## Audio adapters

The seven audio vendor adapters live under
`model-service/src/external_apis/audio/` and share a common base.
They normalize transcripts to a common shape: paragraph text,
per-word offsets, speaker labels (where supported), and language
code. The fusion stage (`av_fusion.py`) consumes that normalized
shape to align with the visual summary.

## Observability

The model service ships traces and metrics to
`OTEL_EXPORTER_OTLP_ENDPOINT`. Spans cover model loading, per-call
inference, and external-API invocations. Per-call metrics include
input tokens (where applicable), output tokens, latency, and
error counts.
