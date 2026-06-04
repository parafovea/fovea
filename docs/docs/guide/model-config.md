# Model configuration

Use `model-service/config/models.yaml` (GPU) and
`model-service/config/models-cpu.yaml` (CPU) to declare which
model backs each task and how it is loaded. The model service
reads the file pointed at by `MODEL_CONFIG_PATH`; the Dockerfile
creates a build-time symlink at `/app/config/active-models.yaml`
based on the `DEVICE` build arg (see
[Guide > Deployment](deployment.md)).

The configuration is loaded by the `YamlModelRepository`
adapter, an implementation of the `IModelRepository` outbound
port. Application code reads `TaskConfig` and `ModelConfig`
domain entities, never raw YAML.

## Task slots

The top-level keys are task slots:

```text
video_summarization      VLM that produces summary text
ontology_augmentation    LLM that suggests ontology additions
claim_extraction         LLM that pulls claims from a summary
claim_synthesis          LLM that re-derives claims from a revised summary
object_detection         open-vocabulary detector for POST /detect
video_tracking           tracker used to fill keyframes
audio_transcription      vendor adapter for speech-to-text
```

## Slot shape

Each slot has a `selected` model id and an `options` dictionary:

```yaml
video_summarization:
  selected: "qwen-2-5-vl-7b"
  options:
    qwen-2-5-vl-7b:
      model_id: "Qwen/Qwen2.5-VL-7B-Instruct"
      quantization: "4bit"
      framework: "sglang"
      vram_gb: 8
      speed: "fast"
      description: "Compact VLM, ungated, fits well on A10G"
    claude-sonnet-4-5:
      model_id: "claude-sonnet-4-5"
      framework: "external_api"
      provider: "anthropic"
      api_endpoint: "https://api.anthropic.com/v1/messages"
      requires_api_key: true
```

The full schema is in
[Reference > Model config](../reference/model-config.md).

## Frameworks

Common frameworks include:

```text
sglang           on-GPU inference via SGLang runtime
transformers     on-GPU inference via Transformers (also for SmolVLM /
                 Moondream on CPU)
llama_cpp        CPU inference via llama.cpp (GGUF quantizations)
onnx             CPU inference via ONNX Runtime
faster_whisper   CPU/GPU speech-to-text via faster-whisper
whisper          reference Whisper implementation
whisperx         WhisperX with alignment and diarization
nemo_canary      NVIDIA NeMo Canary ASR
nemo_parakeet    NVIDIA NeMo Parakeet ASR
pyannote         pyannote speaker diarization
sam3             Segment Anything 3 detection/segmentation
ultralytics      Ultralytics detectors (YOLO family)
pytorch          generic PyTorch loader
external_api     delegate to a hosted provider
```

Query `/api/models/frameworks` for the live framework set
recognized by the running model service.

`requires_api_key: true` on an `external_api` option means the
backend resolves a user-level or admin-level API key for the
named provider; see [Guide > API keys](api-keys.md).

## Switching models

Edit `models.yaml`, change the `selected` field for the relevant
task, and restart the model service:

```bash
docker compose restart model-service
```

`GET /api/models/config` returns the parsed configuration for the
frontend's model picker.
`GET /api/models/status` reports the actual loaded model.
`POST /api/models/validate` validates a candidate config before
applying it.

## Per-persona overrides

Persona-level inference overrides live in `PersonaPreferences`
and are merged with the user-level defaults from
`UserPreferences`; persona precedence wins for keys present in both. The merged `GenerationOverrides` and
`AudioOverrides` structures are threaded through
`CreateSummaryRequest`, the BullMQ job payload, and finally
into the model-service request body as `generation_overrides`
and `audio_overrides`. The Inference Settings panel lives in
the user-facing Settings page under the Inference tab (available
to all authenticated users) and binds to `/api/models/defaults`
and `/api/models/frameworks`. See
[Reference > Model loaders](../reference/model-loaders.md) for
the option set.
