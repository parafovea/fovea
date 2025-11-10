---
sidebar_label: tracking_loader
title: tracking_loader
---

Video segmentation and tracking with multiple model architectures.

This module provides a unified interface for loading and running inference with
various video segmentation and tracking models including SAMURAI, SAM2Long,
SAM2.1, and YOLO11n-seg. Models support temporal consistency across frames,
occlusion handling, and mask-based segmentation output.

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

#### OCCLUSION\_CONFIDENCE\_THRESHOLD

#### IOU\_MATCH\_THRESHOLD

#### LOW\_CONFIDENCE\_IOU\_THRESHOLD

## TrackingFramework Objects

```python
class TrackingFramework(str, Enum)
```

Supported tracking frameworks for model execution.

#### PYTORCH

#### ULTRALYTICS

#### SAM2

## TrackingConfig Objects

```python
@dataclass
class TrackingConfig()
```

Configuration for video tracking model loading and inference.

Parameters
----------
model_id : str
    HuggingFace model identifier or model name.
framework : TrackingFramework
    Framework to use for model execution.
device : str, default=&quot;cuda&quot;
    Device to load the model on.
cache_dir : Path | None, default=None
    Directory for caching model weights.
checkpoint_path : Path | None, default=None
    Path to model checkpoint file if using local weights.

#### model\_id

#### framework

#### device

#### cache\_dir

#### checkpoint\_path

## TrackingMask Objects

```python
@dataclass
class TrackingMask()
```

Segmentation mask for a tracked object.

Parameters
----------
mask : np.ndarray
    Binary segmentation mask with shape (H, W) where values are 0 or 1.
confidence : float
    Mask prediction confidence score (0.0 to 1.0).
object_id : int
    Unique identifier for the tracked object across frames.

#### mask

#### confidence

#### object\_id

#### to\_rle

```python
def to_rle() -> dict[str, Any]
```

Convert mask to Run-Length Encoding format.

Returns
-------
dict[str, Any]
    RLE-encoded mask with &#x27;size&#x27; and &#x27;counts&#x27; keys.

## TrackingFrame Objects

```python
@dataclass
class TrackingFrame()
```

Tracking results for a single video frame.

Parameters
----------
frame_idx : int
    Zero-indexed frame number in the video sequence.
masks : list[TrackingMask]
    List of segmentation masks for tracked objects in this frame.
occlusions : dict[int, bool]
    Mapping of object_id to occlusion status (True if occluded).
processing_time : float
    Processing time for this frame in seconds.

#### frame\_idx

#### masks

#### occlusions

#### processing\_time

## TrackingResult Objects

```python
@dataclass
class TrackingResult()
```

Tracking results for a video sequence.

Parameters
----------
frames : list[TrackingFrame]
    Tracking results for each frame in the sequence.
video_width : int
    Video frame width in pixels.
video_height : int
    Video frame height in pixels.
total_processing_time : float
    Total processing time for all frames in seconds.
fps : float
    Processing speed in frames per second.

#### frames

#### video\_width

#### video\_height

#### total\_processing\_time

#### fps

## TrackingModelLoader Objects

```python
class TrackingModelLoader(ABC)
```

Abstract base class for video tracking model loaders.

All tracking loaders must implement the load and track methods.

#### \_\_init\_\_

```python
def __init__(config: TrackingConfig) -> None
```

Initialize the tracking model loader with configuration.

Parameters
----------
config : TrackingConfig
    Configuration for model loading and inference.

#### load

```python
@abstractmethod
def load() -> None
```

Load the tracking model into memory with configured settings.

Raises
------
RuntimeError
    If model loading fails.

#### track

```python
@abstractmethod
def track(frames: list[Image.Image],
          initial_masks: list[np.ndarray[Any, np.dtype[np.uint8]]],
          object_ids: list[int]) -> TrackingResult
```

Track objects across video frames with mask-based segmentation.

Parameters
----------
frames : list[Image.Image]
    List of PIL Images representing consecutive video frames.
initial_masks : list[np.ndarray]
    Initial segmentation masks for objects in the first frame.
    Each mask is a binary numpy array with shape (H, W).
object_ids : list[int]
    Unique identifiers for each object to track.

Returns
-------
TrackingResult
    Tracking results with segmentation masks for each frame.

Raises
------
RuntimeError
    If tracking fails or model is not loaded.
ValueError
    If number of initial_masks does not match object_ids length.

#### unload

```python
def unload() -> None
```

Unload the model from memory to free GPU resources.

## SAMURAILoader Objects

```python
class SAMURAILoader(TrackingModelLoader)
```

Loader for SAMURAI motion-aware tracking model.

SAMURAI achieves 7.1% better performance than SAM2 baseline with
motion-aware tracking and occlusion handling capabilities.

#### load

```python
def load() -> None
```

Load SAMURAI model with configured settings.

#### track

```python
def track(frames: list[Image.Image],
          initial_masks: list[np.ndarray[Any, np.dtype[np.uint8]]],
          object_ids: list[int]) -> TrackingResult
```

Track objects using SAMURAI with motion-aware tracking.

## SAM2LongLoader Objects

```python
class SAM2LongLoader(TrackingModelLoader)
```

Loader for SAM2Long long video tracking model.

SAM2Long achieves 5.3% better performance than SAM2 baseline with
error accumulation fixes for long video sequences.

#### load

```python
def load() -> None
```

Load SAM2Long model with configured settings.

#### track

```python
def track(frames: list[Image.Image],
          initial_masks: list[np.ndarray[Any, np.dtype[np.uint8]]],
          object_ids: list[int]) -> TrackingResult
```

Track objects using SAM2Long with error accumulation fixes.

## SAM2Loader Objects

```python
class SAM2Loader(TrackingModelLoader)
```

Loader for SAM2.1 baseline video segmentation model.

SAM2.1 provides baseline performance with proven stability for
general video segmentation and tracking tasks.

#### load

```python
def load() -> None
```

Load SAM2.1 model with configured settings.

#### track

```python
def track(frames: list[Image.Image],
          initial_masks: list[np.ndarray[Any, np.dtype[np.uint8]]],
          object_ids: list[int]) -> TrackingResult
```

Track objects using SAM2.1 baseline implementation.

## YOLO11SegLoader Objects

```python
class YOLO11SegLoader(TrackingModelLoader)
```

Loader for YOLO11n-seg lightweight segmentation model.

YOLO11n-seg is a 2.7M parameter model optimized for real-time
segmentation in speed-critical applications.

#### load

```python
def load() -> None
```

Load YOLO11n-seg model with configured settings.

#### track

```python
def track(frames: list[Image.Image],
          initial_masks: list[np.ndarray[Any, np.dtype[np.uint8]]],
          object_ids: list[int]) -> TrackingResult
```

Track objects using YOLO11n-seg with per-frame segmentation.

Note: YOLO11n-seg performs independent segmentation per frame without
temporal consistency. Object re-identification is based on spatial overlap.

#### create\_tracking\_loader

```python
def create_tracking_loader(model_name: str,
                           config: TrackingConfig) -> TrackingModelLoader
```

Factory function to create appropriate tracking loader based on model name.

Parameters
----------
model_name : str
    Name of the model to load. Supported values:
    - &quot;samurai&quot; (default)
    - &quot;sam2long&quot; or &quot;sam2-long&quot;
    - &quot;sam2&quot; or &quot;sam2.1&quot;
    - &quot;yolo11n-seg&quot; or &quot;yolo11seg&quot;
config : TrackingConfig
    Configuration for model loading and inference.

Returns
-------
TrackingModelLoader
    Appropriate loader instance for the specified model.

Raises
------
ValueError
    If model_name is not recognized.

