---
sidebar_label: llm_loader
title: llm_loader
---

Configurable LLM loader with multi-model support and quantization.

This module provides a loader for text-only language models with support for
multiple model options (Llama 4 Scout, Llama 3.3 70B, DeepSeek V3, Gemma 3),
4-bit quantization with bitsandbytes, SGLang inference framework, and
automatic fallback handling.

## asyncio

## dataclass

## Enum

## Path

## Any

## torch

## AutoModelForCausalLM

## AutoTokenizer

## BitsAndBytesConfig

## PreTrainedModel

## PreTrainedTokenizer

## LLMFramework Objects

```python
class LLMFramework(str, Enum)
```

Inference framework options for LLM models.

#### SGLANG

#### TRANSFORMERS

## LLMConfig Objects

```python
@dataclass
class LLMConfig()
```

Configuration for a language model.

Parameters
----------
model_id : str
    HuggingFace model identifier (e.g., &quot;meta-llama/Llama-4-Scout&quot;).
quantization : str
    Quantization mode (e.g., &quot;4bit&quot;, &quot;8bit&quot;, &quot;none&quot;).
framework : LLMFramework
    Inference framework to use (sglang or transformers).
max_tokens : int, default=4096
    Maximum number of tokens to generate.
temperature : float, default=0.7
    Sampling temperature for generation.
top_p : float, default=0.9
    Nucleus sampling parameter.
context_length : int, default=131072
    Maximum context length in tokens.

#### model\_id

#### quantization

#### framework

#### max\_tokens

#### temperature

#### top\_p

#### context\_length

## GenerationConfig Objects

```python
@dataclass
class GenerationConfig()
```

Configuration for text generation.

Parameters
----------
max_tokens : int, default=4096
    Maximum number of tokens to generate.
temperature : float, default=0.7
    Sampling temperature (0.0 for greedy, higher for more randomness).
top_p : float, default=0.9
    Nucleus sampling parameter.
stop_sequences : list[str] | None, default=None
    List of sequences that stop generation when encountered.

#### max\_tokens

#### temperature

#### top\_p

#### stop\_sequences

## GenerationResult Objects

```python
@dataclass
class GenerationResult()
```

Result from text generation.

Parameters
----------
text : str
    Generated text.
tokens_used : int
    Number of tokens used in generation.
finish_reason : str
    Reason generation stopped (e.g., &quot;length&quot;, &quot;stop_sequence&quot;, &quot;eos&quot;).

#### text

#### tokens\_used

#### finish\_reason

## LLMLoader Objects

```python
class LLMLoader()
```

Loader for text-only language models with quantization support.

This class handles loading language models with configurable quantization,
supports multiple model options, and provides text generation utilities
with error handling and fallback logic.

#### \_\_init\_\_

```python
def __init__(config: LLMConfig, cache_dir: Path | None = None) -> None
```

Initialize the LLM loader.

Parameters
----------
config : LLMConfig
    Model configuration specifying model ID, quantization, framework.
cache_dir : Path | None, default=None
    Directory for caching model weights. If None, uses default HF cache.

#### load

```python
async def load() -> None
```

Load the language model and tokenizer.

This method loads the model with the specified quantization settings
and prepares it for inference. Loading is protected by a lock to
prevent concurrent loading attempts.

Raises
------
RuntimeError
    If model loading fails due to memory, invalid model ID, or other issues.

#### generate

```python
async def generate(
        prompt: str,
        generation_config: GenerationConfig | None = None) -> GenerationResult
```

Generate text from a prompt using the loaded model.

Parameters
----------
prompt : str
    Input text prompt for generation.
generation_config : GenerationConfig | None, default=None
    Generation parameters. If None, uses default configuration.

Returns
-------
GenerationResult
    Generated text with metadata (tokens used, finish reason).

Raises
------
RuntimeError
    If model is not loaded or generation fails.

#### unload

```python
async def unload() -> None
```

Unload the model from memory.

This method releases the model and tokenizer, freeing GPU/CPU memory.

#### is\_loaded

```python
def is_loaded() -> bool
```

Check if the model is currently loaded.

Returns
-------
bool
    True if model and tokenizer are loaded, False otherwise.

#### get\_memory\_usage

```python
def get_memory_usage() -> dict[str, int]
```

Get current GPU memory usage for the model.

Returns
-------
dict[str, int]
    Dictionary with &quot;allocated&quot; and &quot;reserved&quot; memory in bytes.
    Returns zeros if CUDA is not available.

#### create\_llm\_config\_from\_dict

```python
def create_llm_config_from_dict(model_dict: dict[str, Any]) -> LLMConfig
```

Create an LLMConfig from a dictionary (e.g., from YAML).

Parameters
----------
model_dict : dict[str, Any]
    Dictionary containing model configuration keys.

Returns
-------
LLMConfig
    Configured LLMConfig instance.

Raises
------
ValueError
    If required keys are missing or framework is invalid.

#### create\_llm\_loader\_with\_fallback

```python
async def create_llm_loader_with_fallback(
        primary_config: LLMConfig,
        fallback_configs: list[LLMConfig],
        cache_dir: Path | None = None) -> LLMLoader
```

Create an LLM loader with automatic fallback to alternative models.

Parameters
----------
primary_config : LLMConfig
    Primary model configuration to try first.
fallback_configs : list[LLMConfig]
    List of fallback model configurations to try if primary fails.
cache_dir : Path | None, default=None
    Directory for caching model weights.

Returns
-------
LLMLoader
    Successfully loaded LLM loader.

Raises
------
RuntimeError
    If all model loading attempts fail.

