# Model loaders

Every loader in
`model-service/src/infrastructure/adapters/outbound/models/`,
grouped by task. Each entry lists the option id used in
`models.yaml`, the framework, and the task slot it backs. The
list is the union of `models.yaml` (GPU) and `models-cpu.yaml`
(CPU); the `framework` column resolves the inference path.

## Video summarization (VLM)

```text
qwen-3-vl-235b-a22b           sglang         models.yaml
qwen-3-vl-30b-a3b             sglang         models.yaml
qwen-3-vl-30b-a3b-thinking    sglang         models.yaml
qwen-3-vl-8b                  sglang         models.yaml
qwen-3-vl-8b-thinking         sglang         models.yaml
qwen-2-5-vl-7b                sglang         models.yaml
qwen2-5-vl-72b                sglang         models.yaml
tarsier2-7b                   transformers   models.yaml
moondream-3                   transformers   models.yaml
moondream-2b                  transformers   models.yaml
moondream-0-5b                transformers   models.yaml
internvl3-78b                 sglang         models.yaml
llama-4-maverick              sglang         models.yaml
llama-4-scout                 vllm           models.yaml
pixtral-large                 sglang         models.yaml
gemma-3-27b                   sglang         models.yaml
smolvlm-2-2b                  transformers   models-cpu.yaml
smolvlm-500m                  transformers   models-cpu.yaml
qwen2-5-vl-3b-gguf            llama_cpp      models-cpu.yaml
gpt-4o                        external_api   models.yaml
gpt-5-4                       external_api   models.yaml
claude-sonnet-4-5             external_api   models.yaml
claude-sonnet-4-6             external_api   models.yaml
claude-opus-4-7               external_api   models.yaml
gemini-2-5-flash              external_api   models.yaml
gemini-3-1-pro                external_api   models.yaml
grok-4                        external_api   models.yaml
```

## Ontology augmentation / claim extraction / claim synthesis (LLM)

```text
qwen-3-8b                     sglang         models.yaml
qwen-3-32b                    sglang         models.yaml
qwen-3-1-7b-cpu               transformers   models-cpu.yaml
qwen-3-5-397b-a17b            sglang         models.yaml
qwen-2-5-7b                   sglang         models.yaml
qwen-2-5-32b                  sglang         models.yaml
qwen2-5-1-5b-cpu              transformers   models-cpu.yaml
qwen2-5-1-5b-gguf             llama_cpp      models-cpu.yaml
deepseek-r1-distill-qwen-14b  sglang         models.yaml
deepseek-r1-distill-qwen-32b  sglang         models.yaml
deepseek-r1-distill-qwen-1-5b-gguf  llama_cpp models-cpu.yaml
deepseek-v3                   sglang         models.yaml
deepseek-v3-2                 sglang         models.yaml
kimi-k2-6                     sglang         models.yaml
glm-4-7                       sglang         models.yaml
llama-3-3-70b                 sglang         models.yaml
gemma-3-27b-text              sglang         models.yaml
phi-3-mini-4k                 transformers   models.yaml
phi-4-mini                    transformers   models.yaml
claude-sonnet-4-5             external_api   models.yaml
claude-sonnet-4-6             external_api   models.yaml
claude-opus-4-7               external_api   models.yaml
gpt-5-4                       external_api   models.yaml
gemini-3-1-pro                external_api   models.yaml
grok-4                        external_api   models.yaml
```

## Object detection

```text
sam-3-1                       sam3           models.yaml
sam-3                         sam3           models.yaml
yolov12-large                 ultralytics    models.yaml
yoloe-26                      ultralytics    models.yaml
rf-detr-base                  pytorch        models.yaml
yolo-world-v2                 pytorch        models.yaml
yolo-world-s-onnx             onnx           models-cpu.yaml
grounding-dino-1-5            pytorch        models.yaml
grounding-dino-tiny-onnx      onnx           models-cpu.yaml
owlv2                         pytorch        models.yaml
florence-2                    transformers   models.yaml
florence-2-base-onnx          onnx           models-cpu.yaml
```

## Object tracking

```text
sam-3-1-tracking              sam3           models.yaml
sam2-1                        pytorch        models.yaml
sam2long                      pytorch        models.yaml
samurai                       pytorch        models.yaml
yolo11n-seg                   ultralytics    models.yaml
```

## Audio transcription

```text
whisper-v3-turbo              whisper            models.yaml
whisper-large-v3              whisper            models.yaml
faster-whisper-large-v3       faster_whisper     models.yaml
faster-whisper-medium-cpu     faster_whisper     models-cpu.yaml
faster-whisper-small-cpu      faster_whisper     models-cpu.yaml
canary-qwen-2-5b              nemo_canary        models.yaml
parakeet-tdt-1-1b             nemo_parakeet      models.yaml
whisperx-large-v3             whisperx           models.yaml
assemblyai-universal          external_api       models.yaml
deepgram-nova-3               external_api       models.yaml
gladia                        external_api       models.yaml
revai                         external_api       models.yaml
azure-speech                  external_api       models.yaml
google-speech                 external_api       models.yaml
aws-transcribe                external_api       models.yaml
```

## Speaker diarization and VAD

```text
pyannote-3-1                  pyannote       speaker_diarization
silero-vad                    pytorch        voice_activity_detection
```

## Loader implementations

The following entries are first-class loader implementations
(not just YAML rows):

```text
SAM 3 / 3.1                   models/sam3/loader.py
                              models/sam3/detection_adapter.py
                              models/sam3/tracking_adapter.py
Canary-Qwen                   models/audio/canary.py
Parakeet TDT                  models/audio/parakeet.py
WhisperX                      models/audio/whisperx.py
YOLOv12 / YOLOE-26 / RF-DETR  models/detection/loader.py
ONNX detection (CPU)          models/onnx/yolo_world.py,
                              models/onnx/florence.py,
                              models/onnx/grounding_dino.py
llama.cpp LLM / VLM (CPU)     models/llama_cpp/llm.py,
                              models/llama_cpp/vlm.py
SmolVLM / Moondream (CPU)     models/vlm/loader.py (transformers branch)
```

## Selection and load failures

`ModelManager.load_model` loads only the option named by the
slot's `selected` field (resolved via
`TaskConfig.get_selected_config`); it does not automatically
iterate the other `options` entries when a loader raises. Any
loader exception propagates to the caller; the `transcribe` and
`diarize` routes surface load failures with a `Model load
failed` detail, and the other per-task routes (`detection`,
`summarization`, `claims`, `ontology`, `thumbnails`) wrap load
failures with their own per-route detail strings, until the
slot is repointed via `POST /api/models/select` or the
underlying option is fixed.
`GET /api/models/status` reports `loaded_models` plus memory
and availability flags; it does not surface a failed-option
record for slots that are not currently loaded.

The LLM loader layer exposes a separate helper,
`create_llm_loader_with_fallback`
(`model-service/src/infrastructure/adapters/outbound/models/llm/loader.py`),
which iterates an explicit `fallback_configs` list inside a
single loader. That helper operates on an in-process list of
configurations, not on the YAML `options` dict.
