---
sidebar_label: detection_loader
title: detection_loader
---

Open-vocabulary object detection with multiple model architectures.

This module provides a unified interface for loading and running inference with
various open-vocabulary object detection models including YOLO-World v2.1,
Grounding DINO 1.5, OWLv2, and Florence-2. Models support text-based prompts
for detecting objects without pre-defined class vocabularies.

## logging

## ABC

## abstractmethod

## dataclass

## Enum

## Path

## Any

## np

## torch

## Image

#### logger

## DetectionFramework Objects

```python
class DetectionFramework(str, Enum)
```

Supported detection frameworks for model execution.

#### PYTORCH

#### ULTRALYTICS

#### TRANSFORMERS

## DetectionConfig Objects

```python
@dataclass
class DetectionConfig()
```

Configuration for object detection model loading and inference.

Parameters
----------
model_id : str
    HuggingFace model identifier or Ultralytics model name.
framework : DetectionFramework
    Framework to use for model execution.
confidence_threshold : float, default=0.25
    Minimum confidence score for detections (0.0 to 1.0).
device : str, default=&quot;cuda&quot;
    Device to load the model on.
cache_dir : Path | None, default=None
    Directory for caching model weights.

#### model\_id

#### framework

#### confidence\_threshold

#### device

#### cache\_dir

## BoundingBox Objects

```python
@dataclass
class BoundingBox()
```

Bounding box in normalized coordinates.

Parameters
----------
x1 : float
    Left coordinate (0.0 to 1.0, normalized by image width).
y1 : float
    Top coordinate (0.0 to 1.0, normalized by image height).
x2 : float
    Right coordinate (0.0 to 1.0, normalized by image width).
y2 : float
    Bottom coordinate (0.0 to 1.0, normalized by image height).

#### x1

#### y1

#### x2

#### y2

#### to\_absolute

```python
def to_absolute(width: int, height: int) -> tuple[int, int, int, int]
```

Convert normalized coordinates to absolute pixel coordinates.

Parameters
----------
width : int
    Image width in pixels.
height : int
    Image height in pixels.

Returns
-------
tuple[int, int, int, int]
    Bounding box in absolute coordinates (x1, y1, x2, y2).

## Detection Objects

```python
@dataclass
class Detection()
```

Single object detection result.

Parameters
----------
bbox : BoundingBox
    Bounding box in normalized coordinates.
confidence : float
    Detection confidence score (0.0 to 1.0).
label : str
    Detected object class or description.

#### bbox

#### confidence

#### label

## DetectionResult Objects

```python
@dataclass
class DetectionResult()
```

Detection results for a single image.

Parameters
----------
detections : list[Detection]
    List of detected objects with bounding boxes and scores.
image_width : int
    Original image width in pixels.
image_height : int
    Original image height in pixels.
processing_time : float
    Processing time in seconds.

#### detections

#### image\_width

#### image\_height

#### processing\_time

## DetectionModelLoader Objects

```python
class DetectionModelLoader(ABC)
```

Abstract base class for object detection model loaders.

All detection loaders must implement the load and detect methods.

#### \_\_init\_\_

```python
def __init__(config: DetectionConfig) -> None
```

Initialize the detection model loader with configuration.

Parameters
----------
config : DetectionConfig
    Configuration for model loading and inference.

#### load

```python
@abstractmethod
def load() -> None
```

Load the detection model into memory with configured settings.

Raises
------
RuntimeError
    If model loading fails.

#### detect

```python
@abstractmethod
def detect(image: Image.Image, text_prompt: str) -> DetectionResult
```

Detect objects in an image based on text prompt.

Parameters
----------
image : Image.Image
    PIL Image to process.
text_prompt : str
    Text description of objects to detect (e.g., &quot;person. car. dog.&quot;).

Returns
-------
DetectionResult
    Detection results with bounding boxes in normalized coordinates.

Raises
------
RuntimeError
    If detection fails or model is not loaded.

#### unload

```python
def unload() -> None
```

Unload the model from memory to free GPU resources.

## YOLOWorldLoader Objects

```python
class YOLOWorldLoader(DetectionModelLoader)
```

Loader for YOLO-World v2.1 open-vocabulary detection model.

YOLO-World v2.1 achieves real-time performance (52 FPS) with strong
accuracy on open-vocabulary object detection tasks.

#### load

```python
def load() -> None
```

Load YOLO-World v2.1 model with configured settings.

#### detect

```python
def detect(image: Image.Image, text_prompt: str) -> DetectionResult
```

Detect objects using YOLO-World v2.1 with text prompts.

## GroundingDINOLoader Objects

```python
class GroundingDINOLoader(DetectionModelLoader)
```

Loader for Grounding DINO 1.5 open-vocabulary detection model.

Grounding DINO 1.5 achieves 52.5 AP on COCO with zero-shot open-world
object detection capabilities.

#### load

```python
def load() -> None
```

Load Grounding DINO 1.5 model with configured settings.

#### detect

```python
def detect(image: Image.Image, text_prompt: str) -> DetectionResult
```

Detect objects using Grounding DINO 1.5 with text prompts.

## OWLv2Loader Objects

```python
class OWLv2Loader(DetectionModelLoader)
```

Loader for OWLv2 open-vocabulary detection model.

OWLv2 uses scaled training data and achieves strong performance
on rare and novel object classes.

#### load

```python
def load() -> None
```

Load OWLv2 model with configured settings.

#### detect

```python
def detect(image: Image.Image, text_prompt: str) -> DetectionResult
```

Detect objects using OWLv2 with text prompts.

## Florence2Loader Objects

```python
class Florence2Loader(DetectionModelLoader)
```

Loader for Florence-2 unified vision model.

Florence-2 is a 230M parameter model that supports multiple vision tasks
including object detection, captioning, and grounding.

#### load

```python
def load() -> None
```

Load Florence-2 model with configured settings.

#### detect

```python
def detect(image: Image.Image, text_prompt: str) -> DetectionResult
```

Detect objects using Florence-2 with text prompts.

#### create\_detection\_loader

```python
def create_detection_loader(model_name: str,
                            config: DetectionConfig) -> DetectionModelLoader
```

Factory function to create appropriate detection loader based on model name.

Parameters
----------
model_name : str
    Name of the model to load. Supported values:
    - &quot;yolo-world-v2&quot; or &quot;yoloworld&quot;
    - &quot;grounding-dino-1-5&quot; or &quot;groundingdino&quot;
    - &quot;owlv2&quot; or &quot;owl-v2&quot;
    - &quot;florence-2&quot; or &quot;florence2&quot;
config : DetectionConfig
    Configuration for model loading and inference.

Returns
-------
DetectionModelLoader
    Appropriate loader instance for the specified model.

Raises
------
ValueError
    If model_name is not recognized.

