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
llama-4-maverick              vllm           models.yaml
llama-4-scout                 vllm           models.yaml
pixtral-large                 vllm           models.yaml
gemma-3-27b                   transformers   models.yaml
smolvlm-2-2b                  transformers   models-cpu.yaml
smolvlm-500m                  transformers   models-cpu.yaml
qwen2-5-vl-3b-gguf            llama_cpp      models-cpu.yaml
florence-2                    transformers   models.yaml
florence-2-base-onnx          onnx           models-cpu.yaml
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
llama-3-3-70b                 vllm           models.yaml
gemma-3-27b-text              transformers   models.yaml
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
sam-3-1                       transformers   models.yaml
sam-3                         transformers   models.yaml
yolov12-large                 transformers   models.yaml
yoloe-26                      transformers   models.yaml
rf-detr-base                  transformers   models.yaml
yolo-world-v2                 transformers   models.yaml
yolo-world-s-onnx             onnx           models-cpu.yaml
grounding-dino-1-5            transformers   models.yaml
grounding-dino-tiny-onnx      onnx           models-cpu.yaml
owlv2                         transformers   models.yaml
```

## Object tracking

```text
sam-3-1-tracking              transformers   models.yaml
sam2-1                        transformers   models.yaml
sam2long                      transformers   models.yaml
samurai                       transformers   models.yaml
yolo11n-seg                   transformers   models.yaml
```

## Audio transcription

```text
whisper-v3-turbo              transformers       models.yaml
whisper-large-v3              transformers       models.yaml
faster-whisper-large-v3       faster_whisper     models.yaml
faster-whisper-medium-cpu     faster_whisper     models-cpu.yaml
faster-whisper-small-cpu      faster_whisper     models-cpu.yaml
canary-qwen-2-5b              transformers       models.yaml
parakeet-tdt-1-1b             transformers       models.yaml
whisperx-large-v3             transformers       models.yaml
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
pyannote-3-1                  transformers   speaker_diarization
silero-vad                    transformers   voice_activity_detection
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

## Fallback chain

If the selected option fails to load, the manager iterates the
remaining `options` entries in declaration order. The first
working option becomes the active loader; the failed option is
recorded in
`GET /api/models/status`. A slot with no working option returns
503 from any route that needs it until the configuration is
repaired.
