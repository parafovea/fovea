---
sidebar_label: routes
title: routes
---

API routes for model service endpoints.

This module contains the API endpoint implementations for video summarization,
ontology augmentation, object detection, and model configuration management.

## logging

## time

## uuid

## datetime

## timezone

## TYPE\_CHECKING

## NotRequired

## TypedDict

## cast

## torch

## APIRouter

## HTTPException

## trace

## AugmentRequest

## AugmentResponse

## ClaimExtractionRequest

## ClaimExtractionResponse

## DetectionRequest

## DetectionResponse

## ErrorResponse

## FrameDetections

## SummarizeRequest

## SummarizeResponse

## SummarySynthesisRequest

## SummarySynthesisResponse

## TrackingRequest

## TrackingResponse

#### router

#### tracer

#### logger

#### set\_model\_manager

```python
def set_model_manager(manager: object) -> None
```

Set the global model manager instance.

Parameters
----------
manager : object
    ModelManager instance to use for model operations.

#### get\_model\_manager

```python
def get_model_manager() -> "ModelManager"
```

Get the global model manager instance.

Returns
-------
ModelManager
    ModelManager instance.

Raises
------
HTTPException
    If model manager is not initialized.

#### summarize\_video

```python
@router.post(
    "/summarize",
    response_model=SummarizeResponse,
    responses={
        400: {
            "model": ErrorResponse
        },
        500: {
            "model": ErrorResponse
        },
    },
    summary="Summarize video content",
    description=
    "Generates a text summary of video content using vision language models. "
    "Analyzes video frames and optionally audio to produce a description tailored to the persona's perspective.",
)
async def summarize_video(request: SummarizeRequest) -> SummarizeResponse
```

Summarize video content using vision language models.

Parameters
----------
request : SummarizeRequest
    Video summarization request with video_id, persona_id, and sampling parameters.

Returns
-------
SummarizeResponse
    Generated summary with key frame analysis.

Raises
------
HTTPException
    If video_id or persona_id is invalid, or if processing fails.

#### augment\_ontology

```python
@router.post(
    "/ontology/augment",
    response_model=AugmentResponse,
    responses={
        400: {
            "model": ErrorResponse
        },
        500: {
            "model": ErrorResponse
        },
    },
    summary="Augment ontology with AI suggestions",
    description=
    "Suggests new ontology types based on domain description and existing types. "
    "Uses language models to generate semantically relevant entity types, event types, roles, or relations.",
)
async def augment_ontology(request: AugmentRequest) -> AugmentResponse
```

Suggest new ontology types using language models.

Parameters
----------
request : AugmentRequest
    Ontology augmentation request with persona_id, domain, and target category.

Returns
-------
AugmentResponse
    Suggested types with descriptions and reasoning.

Raises
------
HTTPException
    If persona_id is invalid, or if generation fails.

#### detect\_objects

```python
@router.post(
    "/detection/detect",
    response_model=DetectionResponse,
    responses={
        400: {
            "model": ErrorResponse
        },
        404: {
            "model": ErrorResponse
        },
        500: {
            "model": ErrorResponse
        },
    },
    summary="Detect objects in video frames",
    description=
    "Detects objects in video frames based on text prompts using open-vocabulary detection models. "
    "Supports YOLO-World v2.1, Grounding DINO 1.5, OWLv2, and Florence-2.",
)
async def detect_objects(request: DetectionRequest) -> DetectionResponse
```

Detect objects in video frames using open-vocabulary detection models.

Parameters
----------
request : DetectionRequest
    Detection request with video_id, query, and processing parameters.

Returns
-------
DetectionResponse
    Detected objects with bounding boxes and confidence scores.

Raises
------
HTTPException
    If video_id is invalid, or if processing fails.

#### track\_objects

```python
@router.post(
    "/tracking/track",
    response_model=TrackingResponse,
    responses={
        400: {
            "model": ErrorResponse
        },
        404: {
            "model": ErrorResponse
        },
        500: {
            "model": ErrorResponse
        },
    },
    summary="Track objects across video frames",
    description=
    "Tracks objects across video frames using initial segmentation masks. "
    "Supports SAMURAI, SAM2Long, SAM2.1, and YOLO11n-seg models.",
)
async def track_objects(request: TrackingRequest) -> TrackingResponse
```

Track objects across video frames with mask-based segmentation.

Parameters
----------
request : TrackingRequest
    Tracking request with video_id, initial_masks, object_ids, and frame_numbers.

Returns
-------
TrackingResponse
    Frame-by-frame tracking results with RLE-encoded masks.

Raises
------
HTTPException
    If video_id is invalid, initial_masks are invalid, or processing fails.

#### get\_model\_config

```python
@router.get(
    "/models/config",
    summary="Get model configuration",
    description=
    "Returns the current model configuration including all task types, "
    "available model options, and currently selected models.",
)
async def get_model_config() -> dict[str, object]
```

Get current model configuration for all task types.

Returns
-------
dict[str, object]
    Dictionary containing configuration for all tasks.

Raises
------
HTTPException
    If model manager is not initialized.

#### get\_model\_status

```python
@router.get(
    "/models/status",
    summary="Get model status",
    description=
    "Returns information about currently loaded models, memory usage, and system statistics.",
)
async def get_model_status() -> dict[str, object]
```

Get status of loaded models and memory usage.

Returns
-------
dict[str, object]
    Dictionary with loaded models, memory statistics, and system info.

Raises
------
HTTPException
    If model manager is not initialized.

#### select\_model

```python
@router.post(
    "/models/select",
    summary="Select model for task",
    description="Changes the selected model for a specific task type. "
    "If the task's model is currently loaded, it will be unloaded and reloaded with the new selection.",
)
async def select_model(task_type: str, model_name: str) -> dict[str, str]
```

Change selected model for a task type.

Parameters
----------
task_type : str
    Task type to update (e.g., &quot;video_summarization&quot;).
model_name : str
    Name of model option to select (e.g., &quot;llama-4-maverick&quot;).

Returns
-------
dict[str, str]
    Success message with new configuration.

Raises
------
HTTPException
    If task type or model name is invalid.

#### validate\_memory\_budget

```python
@router.post(
    "/models/validate",
    summary="Validate memory budget",
    description=
    "Validates that all currently selected models can fit in available GPU memory. "
    "Returns detailed breakdown of memory requirements and availability.",
)
async def validate_memory_budget() -> dict[str, object]
```

Validate memory budget for currently selected models.

Returns
-------
dict[str, object]
    Validation results with memory breakdown.

Raises
------
HTTPException
    If model manager is not initialized.

#### unload\_model

```python
@router.post(
    "/models/unload/{task_type}",
    summary="Unload model",
    description="Manually unload a model from memory to free GPU resources.",
)
async def unload_model(task_type: str) -> dict[str, str]
```

Unload a model from memory.

Parameters
----------
task_type : str
    Task type of model to unload.

Returns
-------
dict[str, str]
    Success message.

Raises
------
HTTPException
    If model manager is not initialized or model not loaded.

#### extract\_claims

```python
@router.post(
    "/extract-claims",
    response_model=ClaimExtractionResponse,
    responses={
        400: {
            "model": ErrorResponse
        },
        500: {
            "model": ErrorResponse
        },
    },
    summary="Extract atomic claims from summary text",
    description="Decomposes summary text into atomic factual claims using LLM. "
    "Supports hierarchical subclaim extraction and configurable context sources.",
)
async def extract_claims(
        request: ClaimExtractionRequest) -> ClaimExtractionResponse
```

Extract atomic claims from video summary.

Parameters
----------
request : ClaimExtractionRequest
    Extraction request with summary text, context, and configuration.

Returns
-------
ClaimExtractionResponse
    Extracted claims with hierarchical structure.

Raises
------
HTTPException
    If extraction fails or configuration is invalid.

#### synthesize\_summary

```python
@router.post(
    "/synthesize-summary",
    response_model=SummarySynthesisResponse,
    responses={
        400: {
            "model": ErrorResponse
        },
        500: {
            "model": ErrorResponse
        },
    },
    summary="Synthesize narrative summary from claim hierarchies",
    description="Generates coherent summary text from structured claims. "
    "Supports hierarchical claims, claim relations, and multi-source synthesis.",
)
async def synthesize_summary(
        request: SummarySynthesisRequest) -> SummarySynthesisResponse
```

Synthesize summary from claim hierarchies.

Parameters
----------
request : SummarySynthesisRequest
    Synthesis request with claim hierarchies, relations, and configuration.

Returns
-------
SummarySynthesisResponse
    Generated summary with metadata.

Raises
------
HTTPException
    If synthesis fails or configuration is invalid.

## ClaimDict Objects

```python
class ClaimDict(TypedDict)
```

Recursive claim structure with optional subclaims.

#### subclaims

#### load\_model

```python
@router.post(
    "/models/load/{task_type}",
    summary="Load model",
    description=
    "Manually load a model into memory. Models are normally loaded on demand when needed.",
)
async def load_model(task_type: str) -> dict[str, str]
```

Load a model into memory.

Parameters
----------
task_type : str
    Task type of model to load.

Returns
-------
dict[str, str]
    Success message with model info.

Raises
------
HTTPException
    If model manager is not initialized or loading fails.

