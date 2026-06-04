# Model config

`model-service/config/models.yaml` (GPU profile) and
`model-service/config/models-cpu.yaml` (CPU profile) are the
authoritative model configurations. The model service reads the
file pointed to by `MODEL_CONFIG_PATH`; restart the service to
apply changes (`docker compose restart model-service`).

## Active config selection

The Dockerfile creates a build-time symlink based on the
`DEVICE` build arg:

```text
DEVICE=cpu  ln -sf /app/config/models-cpu.yaml /app/config/active-models.yaml
DEVICE=gpu  ln -sf /app/config/models.yaml     /app/config/active-models.yaml
```

`MODEL_CONFIG_PATH` defaults to `/app/config/active-models.yaml`.
Override at runtime to point at a sibling file or a mounted
volume.

## Top-level shape

```yaml
models:
  <task_slot>:
    selected: "<option-id>"
    options:
      <option-id>:
        model_id: "<vendor-or-hf-id>"
        framework: "<framework-id>"  # see model-service/config/models.yaml for the full set
        ...
inference:
  max_memory_per_model: "auto"
  offload_threshold: 0.85
  warmup_on_startup: true
  default_batch_size: 1
  max_batch_size: 8
```

## Task slots

```text
video_summarization        VLM that produces summary text
ontology_augmentation      LLM that suggests ontology additions
claim_extraction           LLM that pulls claims from a summary
claim_synthesis            LLM that re-derives claims
object_detection           open-vocabulary detector
object_tracking            tracker used to fill keyframes
audio_transcription        speech-to-text (vendor or on-device)
speaker_diarization        pyannote diarization
voice_activity_detection   Silero VAD
```

## On-GPU option fields

```text
model_id        string    Hugging Face id
quantization    string    "4bit" | "8bit" | "none"
framework       string    backend id; see model-service/config/models.yaml
vram_gb         number    minimum VRAM the option needs
speed           string    "very_fast" | "fast" | "medium" | "slow"
description     string    free-text summary
```

## On-CPU option fields

```text
model_id        string    Hugging Face id (transformers) or GGUF repo
framework       string    backend id; see model-service/config/models-cpu.yaml
quantization    string    GGUF quant tag (e.g. "Q4_K_M") or "none"
context_length  number    llama.cpp context window
threads         number    CPU thread count
description     string
```

## External-API option fields

```text
model_id          string    provider model id (e.g. "claude-sonnet-4-6")
framework         string    "external_api"
provider          string    "anthropic" | "openai" | "google" | ...
api_endpoint      string    full URL
requires_api_key  boolean   true if the backend must resolve a key
speed             string
description       string
```

When `requires_api_key: true`, the backend resolves the key in
this order: requester's user-level key, admin shared-pool key,
then the corresponding environment variable. See
[Guide > API keys](../guide/api-keys.md).

## Model catalog

The full enumeration is in
[Reference > Model loaders](model-loaders.md). Highlights:

```text
VLM            Qwen3-VL (8B, 30B-A3B, 235B-A22B, with thinking variants),
               Tarsier2-7B, Moondream3, Qwen2.5-VL family, Pixtral Large,
               InternVL3-78B, Llama-4 Scout / Maverick, Gemma-3-27B
LLM            Qwen3 (1.7B / 8B / 32B / 5-397B), DeepSeek R1 distills
               (1.5B GGUF / 14B / 32B), DeepSeek v3 / v3.2, Kimi K2.6,
               GLM-4.7, Claude Sonnet 4.5 / 4.6 / Opus 4.7, GPT-5.4,
               Gemini 3.1 Pro, Grok 4
detection      SAM 3, SAM 3.1, YOLOv12-large, YOLOE-26, RF-DETR-base,
               YOLO-World v2, Grounding DINO 1.5, OWLv2, Florence-2
tracking       SAM 3.1 (tracking), SAM2.1, SAM2Long, SAMURAI, YOLO11n-seg
audio          Canary-Qwen 2.5B, Parakeet TDT 1.1B, WhisperX large-v3,
               faster-whisper large-v3 / medium / small, Whisper v3-turbo,
               AssemblyAI Universal, Deepgram Nova-3, Gladia, Rev AI,
               Azure Speech, Google Speech, AWS Transcribe
diarization    pyannote 3.1
vad            silero-vad
```

## Capabilities and fallbacks

The model manager validates the loaded model against the
slot's declared capabilities at startup. A failure (model
unavailable, insufficient VRAM, missing API key) falls back to
the next working option in the `options` dictionary if one
exists; if none does, the slot fails to load and the affected
route returns 503 until the configuration is repaired.

`ModelManager.__init__` requires `capability_probe`; the
constructor does not accept a lazy default because that would
hide configuration mistakes until first inference.

## Switching models

```bash
$EDITOR model-service/config/models.yaml      # change "selected"
docker compose restart model-service          # apply
curl -s http://localhost:3001/api/models/status
# {"video_summarization":"qwen-3-vl-8b","ontology_augmentation":"qwen-3-8b",...}
```

`POST /api/models/validate` validates a candidate config without
applying it; the frontend's model picker uses this before
persisting changes.

## Pre-downloading models at build time

`PRELOAD_MODELS=true` as a build arg pre-downloads every default
model into the image at `/models` so the first run does not pay
the download cost. Pass a Hugging Face token via Docker secret
for gated models:

```bash
echo "$HF_TOKEN" | docker secret create hf_token -
docker buildx build \
  --build-arg DEVICE=gpu \
  --build-arg PRELOAD_MODELS=true \
  --secret id=hf_token \
  -t fovea-model-service:gpu .
```

Without the secret the build skips gated entries and downloads
only ungated models.
