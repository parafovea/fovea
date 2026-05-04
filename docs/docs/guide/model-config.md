# Model configuration

Use `model-service/config/models.yaml` to declare which model
backs each task and how it is loaded. The file is mounted into
the model-service container at `/config/models.yaml` (see
`docker-compose.yml`).

## Task slots

The top-level keys are task slots:

```text
video_summarization      VLM that produces summary text
ontology_augmentation    LLM that suggests ontology additions
claim_extraction         LLM that pulls claims from a summary
claim_synthesis          LLM that re-derives claims from a revised summary
object_detection         open-vocabulary detector for POST /detect
object_tracking          tracker used to fill keyframes
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

```text
sglang         on-GPU inference via SGLang runtime
vllm           on-GPU inference via vLLM
transformers   on-GPU inference via plain Transformers
external_api   delegate to a hosted provider
```

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
