# Model config

`model-service/config/models.yaml` is the authoritative model
configuration. The model service reads it at startup; restart the
service to apply changes (`docker compose restart model-service`).

## Top-level shape

```yaml
models:
  <task_slot>:
    selected: "<option-id>"
    options:
      <option-id>:
        model_id: "<vendor-or-hf-id>"
        framework: "sglang | vllm | transformers | external_api"
        ...
```

## Task slots

```text
video_summarization      VLM that produces summary text
ontology_augmentation    LLM that suggests ontology additions
claim_extraction         LLM that pulls claims from a summary
claim_synthesis          LLM that re-derives claims
object_detection         open-vocabulary detector
object_tracking          tracker used to fill keyframes
audio_transcription      vendor adapter for speech-to-text
```

## On-GPU option fields

```text
model_id        string    Hugging Face id
quantization    string    "4bit" | "8bit" | "none"
framework       string    "sglang" | "vllm" | "transformers"
vram_gb         number    minimum VRAM the option needs
speed           string    "very_fast" | "fast" | "medium" | "slow"
description     string    free-text summary
```

## External-API option fields

```text
model_id          string    provider model id (e.g. "claude-sonnet-4-5")
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

## Capabilities and fallbacks

The model manager validates the loaded model against the slot's
declared capabilities at startup. A failure (model unavailable,
insufficient VRAM, missing API key) falls back to the next
working option in the `options` dictionary if one exists; if
none does, the slot fails to load and the affected route returns
503 until the configuration is repaired.

## Switching models

```bash
$EDITOR model-service/config/models.yaml      # change "selected"
docker compose restart model-service          # apply
curl -s http://localhost:3001/api/models/status
# {"video_summarization":"qwen-2-5-vl-7b","ontology_augmentation":"qwen-2-5-7b",...}
```

`POST /api/models/validate` validates a candidate config without
applying it; the frontend's model picker uses this before
persisting changes.
