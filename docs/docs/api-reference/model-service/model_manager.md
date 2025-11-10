---
sidebar_label: model_manager
title: model_manager
---

Model management with dynamic loading, memory budget validation, and LRU eviction.

This module provides a ModelManager class that handles loading and unloading
of AI models based on available GPU memory. Models are loaded on demand and
automatically evicted when memory pressure occurs.

## logging

## time

## OrderedDict

## Path

## Any

## torch

## yaml

## trace

#### logger

#### tracer

## ModelConfig Objects

```python
class ModelConfig()
```

Configuration for a single model variant.

Attributes
----------
model_id : str
    Hugging Face model identifier or external API model name.
framework : str
    Inference framework (sglang, vllm, pytorch, external_api).
vram_gb : float
    VRAM requirement in GB (0 for external APIs).
quantization : str | None
    Quantization method (4bit, 8bit, awq, etc).
speed : str
    Speed category (fast, medium, slow).
description : str
    Human-readable description.
fps : int | None
    Processing speed in frames per second (for vision models).
provider : str | None
    External API provider (anthropic, openai, google).
api_endpoint : str | None
    API endpoint URL for external APIs.
requires_api_key : bool
    Whether model requires API key authentication.

#### \_\_init\_\_

```python
def __init__(config_dict: dict[str, Any]) -> None
```

Initialize model configuration from dictionary.

Parameters
----------
config_dict : dict[str, Any]
    Dictionary containing model configuration parameters.

#### vram\_bytes

```python
@property
def vram_bytes() -> int
```

Convert VRAM requirement from GB to bytes.

Returns
-------
int
    VRAM requirement in bytes.

## TaskConfig Objects

```python
class TaskConfig()
```

Configuration for a task type with multiple model options.

Attributes
----------
task_name : str
    Name of the task.
selected : str
    Currently selected model name.
options : dict[str, ModelConfig]
    Available model options for this task.

#### \_\_init\_\_

```python
def __init__(task_name: str, config_dict: dict[str, Any]) -> None
```

Initialize task configuration from dictionary.

Parameters
----------
task_name : str
    Name of the task (e.g., &quot;video_summarization&quot;).
config_dict : dict[str, Any]
    Dictionary containing task configuration.

#### get\_selected\_config

```python
def get_selected_config() -> ModelConfig
```

Get the currently selected model configuration.

Returns
-------
ModelConfig
    Configuration for the selected model.

## InferenceConfig Objects

```python
class InferenceConfig()
```

Global inference configuration settings.

Attributes
----------
max_memory_per_model : str
    Maximum memory per model (&#x27;auto&#x27; or specific value).
offload_threshold : float
    Memory usage threshold for offloading (0.0 to 1.0).
warmup_on_startup : bool
    Whether to load all models on startup.
default_batch_size : int
    Default batch size for inference.
max_batch_size : int
    Maximum batch size for inference.

#### \_\_init\_\_

```python
def __init__(config_dict: dict[str, Any]) -> None
```

Initialize inference configuration from dictionary.

Parameters
----------
config_dict : dict[str, Any]
    Dictionary containing inference configuration.

## ModelManager Objects

```python
class ModelManager()
```

Manages loading, unloading, and memory management of AI models.

This class handles dynamic model loading based on memory availability,
implements LRU eviction when memory pressure occurs, and provides
utilities for VRAM monitoring.

Attributes
----------
config_path : Path
    Path to models.yaml configuration file.
config : dict[str, Any]
    Parsed configuration dictionary.
loaded_models : OrderedDict[str, Any]
    Currently loaded models (LRU ordered).
model_load_times : dict[str, float]
    Timestamp when each model was loaded.
model_memory_usage : dict[str, int]
    Actual memory usage per model in bytes.
tasks : dict[str, TaskConfig]
    Task configurations.
inference_config : InferenceConfig
    Global inference settings.

#### \_\_init\_\_

```python
def __init__(config_path: str) -> None
```

Initialize ModelManager with configuration file.

Parameters
----------
config_path : str
    Path to models.yaml configuration file.

#### get\_available\_vram

```python
def get_available_vram() -> int
```

Get available GPU memory in bytes.

**Returns**:

  Available VRAM in bytes

#### get\_total\_vram

```python
def get_total_vram() -> int
```

Get total GPU memory in bytes.

**Returns**:

  Total VRAM in bytes

#### get\_memory\_usage\_percentage

```python
def get_memory_usage_percentage() -> float
```

Get current GPU memory usage as percentage.

**Returns**:

  Memory usage percentage (0.0 to 1.0)

#### check\_memory\_available

```python
def check_memory_available(required_bytes: int) -> bool
```

Check if sufficient memory is available for model loading.

**Arguments**:

- `required_bytes` - Required memory in bytes
  

**Returns**:

  True if sufficient memory is available

#### get\_lru\_model

```python
def get_lru_model() -> str | None
```

Get least recently used model identifier.

**Returns**:

  Task name of LRU model, or None if no models loaded

#### evict\_lru\_model

```python
@tracer.start_as_current_span("evict_lru_model")
async def evict_lru_model() -> str | None
```

Evict the least recently used model from memory.

**Returns**:

  Task name of evicted model, or None if no models to evict

#### unload\_model

```python
@tracer.start_as_current_span("unload_model")
async def unload_model(task_type: str) -> None
```

Unload a model from memory.

**Arguments**:

- `task_type` - Task type of model to unload

#### load\_model

```python
@tracer.start_as_current_span("load_model")
async def load_model(task_type: str) -> Any
```

Load a model for the specified task type.

This method loads the selected model for the task, handling memory
management and eviction if necessary.

**Arguments**:

- `task_type` - Task type to load model for
  

**Returns**:

  Loaded model object
  

**Raises**:

- `ValueError` - If task type is invalid or model cannot be loaded
- `RuntimeError` - If insufficient memory after eviction attempts

#### get\_model

```python
async def get_model(task_type: str) -> Any
```

Get model for task type, loading if necessary.

**Arguments**:

- `task_type` - Task type to get model for
  

**Returns**:

  Loaded model object

#### get\_loaded\_models

```python
def get_loaded_models() -> dict[str, dict[str, Any]]
```

Get information about currently loaded models.

**Returns**:

  Dictionary mapping task types to model information

#### get\_model\_config

```python
def get_model_config(task_type: str) -> TaskConfig | None
```

Get configuration for a task type.

**Arguments**:

- `task_type` - Task type to get configuration for
  

**Returns**:

  Task configuration, or None if task type is invalid

#### set\_selected\_model

```python
async def set_selected_model(task_type: str, model_name: str) -> None
```

Change the selected model for a task type.

If the task&#x27;s model is currently loaded, it will be unloaded and the
new model will be loaded.

**Arguments**:

- `task_type` - Task type to update
- `model_name` - Name of model option to select
  

**Raises**:

- `ValueError` - If task type or model name is invalid

#### validate\_memory\_budget

```python
def validate_memory_budget() -> dict[str, Any]
```

Validate that all selected models can fit in available memory.

**Returns**:

  Dictionary with validation results

#### warmup\_models

```python
async def warmup_models() -> None
```

Load all selected models if warmup_on_startup is enabled.

#### is\_external\_api

```python
def is_external_api(task_type: str) -> bool
```

Check if a task uses an external API model.

Parameters
----------
task_type : str
    Task type to check.

Returns
-------
bool
    True if task uses external API, False otherwise.

Raises
------
ValueError
    If task type is invalid.

#### get\_external\_api\_config

```python
def get_external_api_config(task_type: str) -> Any
```

Get external API configuration for a task.

Parameters
----------
task_type : str
    Task type to get configuration for.

Returns
-------
ExternalAPIConfig
    Configuration object for external API client.

Raises
------
ValueError
    If task type is invalid or doesn&#x27;t use external API.

#### shutdown

```python
async def shutdown() -> None
```

Unload all models and clean up resources.

