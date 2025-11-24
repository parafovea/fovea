---
title: Model Management API
sidebar_position: 9
keywords: [models, configuration, vram, cuda, detection, tracking, summarization]
---

# Model Management API

The Model Management API provides endpoints for configuring ML models, monitoring memory usage, and managing model selection for different AI tasks. These endpoints proxy requests to the Python model service.

## Overview

Fovea supports multiple AI models for different tasks (object detection, tracking, video summarization). The Model Management API allows you to:

- View available models and their specifications
- Select which model to use for each task
- Monitor loaded models and VRAM usage
- Validate memory budgets before loading models

### Supported Tasks

**Object Detection:**
- YOLOv8n, YOLOv8s, YOLOv8m, YOLOv8l
- GroundingDINO (zero-shot detection)

**Object Tracking:**
- SAMURAI (segment anything with tracking)
- SAM2.1, SAM2Long
- YOLO11n-seg

**Video Summarization:**
- LLaVA-NeXT variants (local VLMs)
- External APIs (Anthropic Claude, OpenAI GPT-4o, Google Gemini)

## Base URL

```
http://localhost:3001/api/models
```

## Authentication

No authentication required. Model configuration is system-wide and not user-specific.

## Endpoints

### Get Model Configuration

Retrieve available models for all tasks and currently selected models.

**Endpoint:**
```http
GET /api/models/config
```

**Response 200 (Success):**
```json
{
  "models": {
    "video_summarization": {
      "selected": "llama-4-scout",
      "options": {
        "llama-4-scout": {
          "model_id": "meta-llama/Llama-4-Scout",
          "framework": "sglang",
          "vram_gb": 8.0,
          "speed": "fast",
          "description": "Fast VLM for video understanding",
          "fps": 2.5
        },
        "llama-4-maverick": {
          "model_id": "meta-llama/Llama-4-Maverick",
          "framework": "vllm",
          "vram_gb": 16.0,
          "speed": "medium",
          "description": "High-quality VLM",
          "fps": 1.2
        }
      }
    },
    "object_detection": {
      "selected": "yolov8n",
      "options": {
        "yolov8n": {
          "model_id": "yolov8n",
          "vram_mb": 512,
          "speed": "fast",
          "description": "Nano YOLO model"
        },
        "groundingdino": {
          "model_id": "IDEA-Research/grounding-dino-base",
          "vram_mb": 2048,
          "speed": "medium",
          "description": "Zero-shot detection"
        }
      }
    },
    "object_tracking": {
      "selected": null,
      "options": {
        "samurai": {
          "model_id": "yangchris11/samurai",
          "vram_mb": 4096,
          "speed": "slow",
          "description": "Segment anything with tracking"
        },
        "bytetrack": {
          "model_id": "bytetrack",
          "vram_mb": 256,
          "speed": "fast",
          "description": "Lightweight tracking"
        }
      }
    }
  },
  "inference": {
    "max_memory_per_model": 24.0,
    "offload_threshold": 0.8,
    "warmup_on_startup": true,
    "default_batch_size": 1,
    "max_batch_size": 8
  },
  "cuda_available": true,
  "total_vram_gb": 24.0
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `models` | object | Models grouped by task type |
| `models.<task>.selected` | string \| null | Currently selected model name |
| `models.<task>.options` | object | Available models for this task |
| `inference` | object | Global inference configuration |
| `cuda_available` | boolean | Whether CUDA/GPU is available |
| `total_vram_gb` | number | Total VRAM in gigabytes |

**Model Option Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `model_id` | string | Hugging Face model ID or local name |
| `framework` | string | Inference framework (sglang, vllm, transformers) |
| `vram_gb` or `vram_mb` | number | VRAM requirement |
| `speed` | string | Speed classification (fast, medium, slow) |
| `description` | string | Human-readable description |
| `fps` | number | Frames per second (for VLMs) |

**Response 500 (Server Error):**
```json
{
  "error": "Model service unavailable"
}
```

**Response 503 (Service Unavailable):**
```json
{
  "error": "Connection to model service failed"
}
```

### Get Model Status

Retrieve information about currently loaded models, memory usage, and health status.

**Endpoint:**
```http
GET /api/models/status
```

**Response 200 (Success):**
```json
{
  "loaded_models": {
    "video_summarization": {
      "model_id": "meta-llama/Llama-4-Scout",
      "memory_usage_gb": 7.8,
      "load_time": 12.5
    },
    "object_detection": {
      "model_id": "yolov8n",
      "memory_usage_gb": 0.5,
      "load_time": 0.8
    }
  },
  "total_vram_allocated_gb": 8.3,
  "total_vram_available_gb": 24.0,
  "cuda_available": true,
  "device": "cuda:0"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `loaded_models` | object | Currently loaded models by task |
| `loaded_models.<task>.model_id` | string | Model identifier |
| `loaded_models.<task>.memory_usage_gb` | number | VRAM used by this model |
| `loaded_models.<task>.load_time` | number | Load time in seconds |
| `total_vram_allocated_gb` | number | Total VRAM allocated |
| `total_vram_available_gb` | number | Total VRAM capacity |
| `cuda_available` | boolean | GPU availability |
| `device` | string | PyTorch device string |

**Response 500 (Server Error):**
```json
{
  "error": "Failed to query model status"
}
```

### Select Model

Select a specific model for a task type. This may trigger model loading.

**Endpoint:**
```http
POST /api/models/select
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_type` | string | Yes | Task type (video_summarization, object_detection, object_tracking) |
| `model_name` | string | Yes | Model name from configuration (e.g., "llama-4-scout", "yolov8n") |

**Example Request:**
```bash
curl -X POST "http://localhost:3001/api/models/select?task_type=video_summarization&model_name=llama-4-scout"
```

**Response 200 (Success):**
```json
{
  "status": "success",
  "task_type": "video_summarization",
  "selected_model": "llama-4-scout",
  "model_id": "meta-llama/Llama-4-Scout",
  "message": "Model selection updated"
}
```

**Response 400 (Bad Request):**
```json
{
  "error": "Invalid task_type: invalid_task"
}
```

**Response 404 (Not Found):**
```json
{
  "error": "Model 'nonexistent-model' not found for task 'video_summarization'"
}
```

**Response 500 (Server Error):**
```json
{
  "error": "Failed to load model: Out of memory"
}
```

**Response 503 (Service Unavailable):**
```json
{
  "error": "Model service timeout during model loading"
}
```

### Validate Memory Budget

Check whether currently selected models can fit in available VRAM.

**Endpoint:**
```http
POST /api/models/validate
```

**Response 200 (Valid Budget):**
```json
{
  "valid": true,
  "total_vram_gb": 24.0,
  "total_required_gb": 18.3,
  "threshold": 0.8,
  "max_allowed_gb": 19.2,
  "model_requirements": {
    "video_summarization": {
      "model_name": "llama-4-maverick",
      "vram_gb": 16.0
    },
    "object_detection": {
      "model_name": "yolov8s",
      "vram_gb": 1.5
    },
    "object_tracking": {
      "model_name": "bytetrack",
      "vram_gb": 0.8
    }
  },
  "warnings": []
}
```

**Response 200 (Invalid Budget):**
```json
{
  "valid": false,
  "total_vram_gb": 8.0,
  "total_required_gb": 20.5,
  "threshold": 0.8,
  "max_allowed_gb": 6.4,
  "model_requirements": {
    "video_summarization": {
      "model_name": "llama-4-maverick",
      "vram_gb": 16.0
    },
    "object_detection": {
      "model_name": "yolov8l",
      "vram_gb": 4.0
    },
    "object_tracking": {
      "model_name": "samurai",
      "vram_gb": 0.5
    }
  },
  "warnings": [
    "Total required VRAM (20.5 GB) exceeds available VRAM (8.0 GB)",
    "Consider selecting smaller models or reducing simultaneous tasks"
  ]
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `valid` | boolean | Whether budget is valid |
| `total_vram_gb` | number | Total VRAM capacity |
| `total_required_gb` | number | VRAM needed for selected models |
| `threshold` | number | Maximum utilization threshold (0-1) |
| `max_allowed_gb` | number | Maximum VRAM allocation allowed |
| `model_requirements` | object | VRAM per task |
| `warnings` | string[] | Warnings about memory usage |

**Response 500 (Server Error):**
```json
{
  "error": "Failed to validate memory budget"
}
```

## Usage Examples

### Check Available Models

```javascript
const response = await fetch('/api/models/config')
const config = await response.json()

// List detection models
Object.entries(config.models.object_detection.options).forEach(([name, model]) => {
  console.log(`${name}: ${model.description} (${model.vram_mb} MB)`)
})

// Get current selection
console.log('Current detection model:', config.models.object_detection.selected)
```

### Switch to Different Model

```javascript
// Select YOLOv8m for better accuracy
const response = await fetch(
  '/api/models/select?task_type=object_detection&model_name=yolov8m',
  { method: 'POST' }
)

if (response.ok) {
  const result = await response.json()
  console.log('Model selected:', result.selected_model)
} else {
  const error = await response.json()
  console.error('Selection failed:', error.error)
}
```

### Validate Before Selection

```javascript
// Check if we have enough memory for high-quality models
const validateResponse = await fetch('/api/models/validate', {
  method: 'POST'
})

const validation = await validateResponse.json()

if (validation.valid) {
  // Safe to use selected models
  console.log(`Using ${validation.total_required_gb.toFixed(1)} GB of ${validation.total_vram_gb} GB`)
} else {
  // Need to select smaller models
  console.warn('Insufficient VRAM:', validation.warnings.join(', '))
}
```

### Monitor Memory Usage

```javascript
const statusResponse = await fetch('/api/models/status')
const status = await statusResponse.json()

const usagePercent = (
  (status.total_vram_allocated_gb / status.total_vram_available_gb) * 100
).toFixed(1)

console.log(`VRAM Usage: ${status.total_vram_allocated_gb.toFixed(1)} GB / ${status.total_vram_available_gb} GB (${usagePercent}%)`)

// List loaded models
Object.entries(status.loaded_models).forEach(([task, model]) => {
  console.log(`${task}: ${model.model_id} (${model.memory_usage_gb.toFixed(1)} GB)`)
})
```

## Model Selection Strategy

### Performance vs Accuracy Tradeoff

**Fast Models (Low VRAM):**
- Detection: YOLOv8n (512 MB)
- Tracking: YOLO11n-seg (1 GB)
- Summarization: External API (0 MB)

**Balanced Models (Medium VRAM):**
- Detection: YOLOv8s (1.5 GB)
- Tracking: SAM2 (2 GB)
- Summarization: Llama-4-Scout (8 GB)

**High-Quality Models (High VRAM):**
- Detection: YOLOv8l (4 GB)
- Tracking: SAMURAI (4 GB)
- Summarization: Llama-4-Maverick (16 GB)

### Lazy Loading

Models are loaded on-demand when first needed. Unused models are automatically unloaded when memory is needed for other tasks.

**Loading Triggers:**
- First API request for a task
- Model selection change
- Explicit warmup on startup (if configured)

### Memory Management

The model manager uses these strategies:

1. **Threshold-based**: Keeps usage below `offload_threshold` (default 80%)
2. **LRU Eviction**: Unloads least recently used models
3. **Priority Loading**: Critical tasks load first
4. **Graceful Degradation**: Falls back to CPU if GPU is full

## Frontend Integration

### Model Selection UI

The frontend provides a model configuration panel:

```typescript
// annotation-tool/src/components/settings/ModelConfigPanel.tsx
import { useModelConfig, useSelectModel } from '@/hooks/useModels'

export function ModelConfigPanel() {
  const { config, loading } = useModelConfig()
  const selectModel = useSelectModel()

  const handleSelect = async (taskType: string, modelName: string) => {
    try {
      await selectModel.mutateAsync({ taskType, modelName })
      toast.success('Model selected successfully')
    } catch (error) {
      toast.error('Failed to select model')
    }
  }

  return (
    <div>
      {Object.entries(config.models).map(([task, taskConfig]) => (
        <ModelSelector
          key={task}
          task={task}
          options={taskConfig.options}
          selected={taskConfig.selected}
          onSelect={(name) => handleSelect(task, name)}
        />
      ))}
    </div>
  )
}
```

### Memory Monitoring

Real-time VRAM usage display:

```typescript
import { useModelStatus } from '@/hooks/useModels'

export function MemoryMonitor() {
  const { data: status } = useModelStatus({ refetchInterval: 5000 })

  const usagePercent =
    (status.total_vram_allocated_gb / status.total_vram_available_gb) * 100

  return (
    <div>
      <ProgressBar value={usagePercent} />
      <span>
        {status.total_vram_allocated_gb.toFixed(1)} GB /
        {status.total_vram_available_gb} GB
      </span>
    </div>
  )
}
```

## Configuration File

Models are configured in `model-service/config/models.yaml`:

```yaml
tasks:
  video_summarization:
    selected: llama-4-scout
    options:
      llama-4-scout:
        model_id: meta-llama/Llama-4-Scout
        framework: sglang
        vram_gb: 8.0
        speed: fast

  object_detection:
    selected: yolov8n
    options:
      yolov8n:
        model_id: yolov8n
        vram_mb: 512
        speed: fast

inference:
  max_memory_per_model: 24.0
  offload_threshold: 0.8
  warmup_on_startup: false
```

## Best Practices

### Memory Management

1. **Check Before Loading**: Always validate before selecting high-VRAM models
2. **Monitor Usage**: Track VRAM allocation to prevent OOM errors
3. **Sequential Tasks**: Process one heavy task at a time if memory is limited
4. **Use External APIs**: Offload to cloud providers for resource-intensive tasks

### Model Selection

1. **Start Small**: Begin with nano models, scale up if accuracy is insufficient
2. **Task Priority**: Allocate more VRAM to your primary use case
3. **Benchmark**: Test different models on your specific data
4. **CPU Fallback**: Enable CPU mode for development/testing

### Error Handling

```javascript
try {
  const response = await fetch('/api/models/select?...', { method: 'POST' })

  if (!response.ok) {
    const error = await response.json()

    if (response.status === 404) {
      console.error('Model not found:', error.error)
    } else if (response.status === 500) {
      console.error('Model loading failed:', error.error)
      // Try fallback model or external API
    }
  }
} catch (error) {
  console.error('Network error:', error)
}
```

## Troubleshooting

### "Model service unavailable"

The Python model service is not running or unreachable.

**Solutions:**
1. Check model service container: `docker ps | grep model-service`
2. Verify MODEL_SERVICE_URL environment variable
3. Check model service logs: `docker logs fovea-model-service`

### "Out of memory" during model loading

Insufficient VRAM for the selected model.

**Solutions:**
1. Run `/api/models/validate` to check budget
2. Select a smaller model variant
3. Unload unused models first
4. Use CPU mode or external API

### Model selection not persisting

Configuration changes are stored in the model service but may be reset on restart.

**Solutions:**
1. Update `config/models.yaml` for persistent changes
2. Set `selected` field for each task in the YAML file
3. Rebuild model service container to apply changes

## See Also

- [Model Service Configuration](../model-service/configuration.md) - Configuration file format
- [Video Summarization](../model-service/video-summarization.md) - VLM models and parameters
- [Object Detection](../model-service/object-detection.md) - Detection models and usage
- [Video Tracking](../model-service/video-tracking.md) - Tracking models and configuration
- [External API Integration](../concepts/external-api-integration.md) - Cloud-based models
