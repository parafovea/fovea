---
sidebar_label: vlm_loader
title: vlm_loader
---

Vision Language Model loader with support for multiple VLM architectures.

This module provides a unified interface for loading and running inference with
various Vision Language Models including Llama 4 Maverick, Gemma 3, InternVL3,
Pixtral Large, and Qwen2.5-VL. Models can be loaded with different quantization
strategies and inference frameworks (SGLang or vLLM).

## logging

## ABC

## abstractmethod

## dataclass

## Enum

## Any

## torch

## Image

## AutoModel

## AutoModelForVision2Seq

## AutoProcessor

## AutoTokenizer

## BitsAndBytesConfig

## Qwen2VLForConditionalGeneration

#### logger

## QuantizationType Objects

```python
class QuantizationType(str, Enum)
```

Supported quantization types for model compression.

#### NONE

#### FOUR\_BIT

#### EIGHT\_BIT

#### AWQ

## InferenceFramework Objects

```python
class InferenceFramework(str, Enum)
```

Supported inference frameworks for model execution.

#### SGLANG

#### VLLM

#### TRANSFORMERS

## VLMConfig Objects

```python
@dataclass
class VLMConfig()
```

Configuration for Vision Language Model loading and inference.

Parameters
----------
model_id : str
    HuggingFace model identifier or local path.
quantization : QuantizationType
    Quantization strategy to apply.
framework : InferenceFramework
    Inference framework to use for model execution.
max_memory_gb : int | None, default=None
    Maximum GPU memory to allocate in GB. If None, uses all available.
device : str, default=&quot;cuda&quot;
    Device to load the model on.
trust_remote_code : bool, default=True
    Whether to trust remote code from HuggingFace.

#### model\_id

#### quantization

#### framework

#### max\_memory\_gb

#### device

#### trust\_remote\_code

## VLMLoader Objects

```python
class VLMLoader(ABC)
```

Abstract base class for Vision Language Model loaders.

All VLM loaders must implement the load and generate methods.

#### \_\_init\_\_

```python
def __init__(config: VLMConfig) -> None
```

Initialize the VLM loader with configuration.

Parameters
----------
config : VLMConfig
    Configuration for model loading and inference.

#### load

```python
@abstractmethod
def load() -> None
```

Load the model into memory with configured settings.

Raises
------
RuntimeError
    If model loading fails.

#### generate

```python
@abstractmethod
def generate(images: list[Image.Image],
             prompt: str,
             max_new_tokens: int = 512,
             temperature: float = 0.7) -> str
```

Generate text response from images and prompt.

Parameters
----------
images : list[Image.Image]
    List of PIL images to process.
prompt : str
    Text prompt for the model.
max_new_tokens : int, default=512
    Maximum number of tokens to generate.
temperature : float, default=0.7
    Sampling temperature for generation.

Returns
-------
str
    Generated text response.

Raises
------
RuntimeError
    If generation fails or model is not loaded.

#### unload

```python
def unload() -> None
```

Unload the model from memory to free GPU resources.

## Llama4MaverickLoader Objects

```python
class Llama4MaverickLoader(VLMLoader)
```

Loader for Llama 4 Maverick Vision Language Model.

Llama 4 Maverick is a 400B parameter MoE model with 17B active parameters,
supporting multimodal input with 10M context length.

#### load

```python
def load() -> None
```

Load Llama 4 Maverick model with configured settings.

#### generate

```python
def generate(images: list[Image.Image],
             prompt: str,
             max_new_tokens: int = 512,
             temperature: float = 0.7) -> str
```

Generate text response from images and prompt using Llama 4 Maverick.

## Gemma3Loader Objects

```python
class Gemma3Loader(VLMLoader)
```

Loader for Gemma 3 27B Vision Language Model.

Gemma 3 27B excels at document analysis, OCR, and multilingual tasks
with fast inference speed.

#### load

```python
def load() -> None
```

Load Gemma 3 model with configured settings.

#### generate

```python
def generate(images: list[Image.Image],
             prompt: str,
             max_new_tokens: int = 512,
             temperature: float = 0.7) -> str
```

Generate text response from images and prompt using Gemma 3.

## InternVL3Loader Objects

```python
class InternVL3Loader(VLMLoader)
```

Loader for InternVL3-78B Vision Language Model.

InternVL3-78B achieves state-of-the-art results on vision benchmarks
with strong scientific reasoning capabilities.

#### load

```python
def load() -> None
```

Load InternVL3 model with configured settings.

#### generate

```python
def generate(images: list[Image.Image],
             prompt: str,
             max_new_tokens: int = 512,
             temperature: float = 0.7) -> str
```

Generate text response from images and prompt using InternVL3.

## PixtralLargeLoader Objects

```python
class PixtralLargeLoader(VLMLoader)
```

Loader for Pixtral Large Vision Language Model.

Pixtral Large is a 123B parameter model with 128k context length,
optimized for batch processing of long documents.

#### load

```python
def load() -> None
```

Load Pixtral Large model with configured settings.

#### generate

```python
def generate(images: list[Image.Image],
             prompt: str,
             max_new_tokens: int = 512,
             temperature: float = 0.7) -> str
```

Generate text response from images and prompt using Pixtral Large.

## Qwen25VLLoader Objects

```python
class Qwen25VLLoader(VLMLoader)
```

Loader for Qwen2.5-VL 72B Vision Language Model.

Qwen2.5-VL 72B is a proven stable model with strong performance
across vision-language tasks.

#### load

```python
def load() -> None
```

Load Qwen2.5-VL model with configured settings.

#### generate

```python
def generate(images: list[Image.Image],
             prompt: str,
             max_new_tokens: int = 512,
             temperature: float = 0.7) -> str
```

Generate text response from images and prompt using Qwen2.5-VL.

#### create\_vlm\_loader

```python
def create_vlm_loader(model_name: str, config: VLMConfig) -> VLMLoader
```

Factory function to create appropriate VLM loader based on model name.

Parameters
----------
model_name : str
    Name of the model to load. Supported values:
    - &quot;llama-4-maverick&quot; or &quot;llama4-maverick&quot;
    - &quot;gemma-3-27b&quot; or &quot;gemma3&quot;
    - &quot;internvl3-78b&quot; or &quot;internvl3&quot;
    - &quot;pixtral-large&quot; or &quot;pixtral&quot;
    - &quot;qwen2.5-vl-72b&quot; or &quot;qwen25vl&quot;
config : VLMConfig
    Configuration for model loading and inference.

Returns
-------
VLMLoader
    Appropriate loader instance for the specified model.

Raises
------
ValueError
    If model_name is not recognized.

