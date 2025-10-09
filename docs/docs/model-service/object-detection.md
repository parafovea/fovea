---
title: Object Detection
---

# Object Detection

Object detection identifies and localizes objects in video frames using bounding boxes. The service supports class-based detection (COCO classes), zero-shot detection with text prompts, and automatic object discovery.

## How It Works

The object detection pipeline:

1. **Frame Extraction**: Load specified frames from video
2. **Preprocessing**: Resize and normalize frames for model input
3. **Model Inference**: Run detection model on frames
4. **Post-processing**: Filter detections by confidence, apply NMS (Non-Maximum Suppression)
5. **Response Generation**: Return bounding boxes with labels and confidence scores

## Available Models

### YOLO-World-v2

**Model ID**: `ultralytics/yolo-world-v2-l`

**Type**: Open-world object detector

**Characteristics**:
- VRAM: 2 GB
- FPS: 52 (GPU T4)
- Supports: Image prompts, COCO classes

**Best for**:
- Real-time detection
- Balanced speed and accuracy
- General-purpose object detection

**Example**:
```bash
curl -X POST http://localhost:8000/api/detect \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/game.mp4",
    "model": "yolo-world-v2",
    "frame_numbers": [0, 30, 60],
    "classes": ["person", "ball", "bat"],
    "confidence_threshold": 0.5
  }'
```

### GroundingDINO 1.5

**Model ID**: `IDEA-Research/grounding-dino-1.5-pro`

**Type**: Zero-shot detector with text prompts

**Characteristics**:
- VRAM: 4 GB
- FPS: 20 (GPU T4)
- AP: 52.5
- Supports: Text prompts, fine-grained detection

**Best for**:
- Custom object categories
- Text-based queries
- High accuracy requirements

**Example**:
```bash
curl -X POST http://localhost:8000/api/detect \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/game.mp4",
    "model": "grounding-dino-1-5",
    "frame_numbers": [0, 30, 60],
    "text_prompt": "baseball pitcher in motion",
    "confidence_threshold": 0.6
  }'
```

### OWLv2

**Model ID**: `google/owlv2-large-patch14-ensemble`

**Type**: Open-vocabulary detector

**Characteristics**:
- VRAM: 6 GB
- FPS: 15 (GPU T4)
- Supports: Rare classes, long-tail distribution

**Best for**:
- Uncommon objects
- Rare class detection
- Fine-grained categories

**Example**:
```bash
curl -X POST http://localhost:8000/api/detect \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/game.mp4",
    "model": "owlv2",
    "frame_numbers": [0, 30, 60],
    "text_prompt": "catcher's mitt",
    "confidence_threshold": 0.4
  }'
```

### Florence-2

**Model ID**: `microsoft/Florence-2-large`

**Type**: Unified vision model

**Characteristics**:
- VRAM: 2 GB
- FPS: 30 (GPU T4)
- Supports: Detection, captioning, segmentation

**Best for**:
- Multi-task scenarios
- Combined detection and captioning
- Efficient inference

**Example**:
```bash
curl -X POST http://localhost:8000/api/detect \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/game.mp4",
    "model": "florence-2",
    "frame_numbers": [0, 30, 60],
    "classes": ["person", "sports equipment"],
    "confidence_threshold": 0.5
  }'
```

## Detection Modes

### Class-Based Detection (COCO)

Detect objects from 80 COCO dataset classes.

**COCO Classes**: person, bicycle, car, motorcycle, airplane, bus, train, truck, boat, traffic light, fire hydrant, stop sign, parking meter, bench, bird, cat, dog, horse, sheep, cow, elephant, bear, zebra, giraffe, backpack, umbrella, handbag, tie, suitcase, frisbee, skis, snowboard, sports ball, kite, baseball bat, baseball glove, skateboard, surfboard, tennis racket, bottle, wine glass, cup, fork, knife, spoon, bowl, banana, apple, sandwich, orange, broccoli, carrot, hot dog, pizza, donut, cake, chair, couch, potted plant, bed, dining table, toilet, tv, laptop, mouse, remote, keyboard, cell phone, microwave, oven, toaster, sink, refrigerator, book, clock, vase, scissors, teddy bear, hair drier, toothbrush

**Example**:
```json
{
  "model": "yolo-world-v2",
  "classes": ["person", "sports ball", "baseball bat"]
}
```

### Text Prompt Detection (Zero-Shot)

Detect objects using natural language descriptions.

**Supported models**: GroundingDINO, OWLv2

**Example**:
```json
{
  "model": "grounding-dino-1-5",
  "text_prompt": "pitcher throwing baseball from mound"
}
```

**Best practices**:
- Use specific descriptions ("red bicycle" vs "bicycle")
- Include context ("person holding tennis racket" vs "person")
- Avoid ambiguous terms
- Test prompt variations for best results

### Automatic Detection

Detect all objects without specifying classes.

**Example**:
```json
{
  "model": "yolo-world-v2",
  "auto_detect": true,
  "confidence_threshold": 0.6
}
```

Returns all detected objects above confidence threshold.

## API Endpoint

### Request

```
POST /api/detect
```

**Content-Type**: `application/json`

**Request Schema**:

```json
{
  "video_path": "/data/example.mp4",
  "model": "yolo-world-v2",
  "frame_numbers": [0, 30, 60, 90],
  "classes": ["person", "ball"],
  "confidence_threshold": 0.5,
  "batch_size": 4,
  "nms_threshold": 0.45
}
```

**Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| video_path | string | Yes | - | Path to video file |
| model | string | No | (from config) | Detection model to use |
| frame_numbers | array | Yes | - | Frame indices to process |
| classes | array | No | null | COCO class names to detect |
| text_prompt | string | No | null | Text description for zero-shot |
| confidence_threshold | float | No | 0.5 | Minimum confidence (0.0-1.0) |
| batch_size | integer | No | 4 | Frames per batch |
| nms_threshold | float | No | 0.45 | NMS IoU threshold |
| auto_detect | boolean | No | false | Detect all objects |

### Response

**Status**: 200 OK

```json
{
  "detections": [
    {
      "frame_number": 0,
      "objects": [
        {
          "bbox": {"x": 245, "y": 180, "width": 120, "height": 200},
          "label": "person",
          "confidence": 0.92,
          "class_id": 0
        },
        {
          "bbox": {"x": 520, "y": 340, "width": 45, "height": 45},
          "label": "sports ball",
          "confidence": 0.87,
          "class_id": 32
        }
      ],
      "detection_count": 2
    },
    {
      "frame_number": 30,
      "objects": [
        {
          "bbox": {"x": 250, "y": 185, "width": 115, "height": 195},
          "label": "person",
          "confidence": 0.94,
          "class_id": 0
        }
      ],
      "detection_count": 1
    }
  ],
  "total_frames": 2,
  "total_detections": 3,
  "model_used": "yolo-world-v2",
  "inference_time_ms": 145
}
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| detections | array | Detections per frame |
| frame_number | integer | Frame index |
| objects | array | Detected objects in frame |
| bbox | object | Bounding box (x, y, width, height in pixels) |
| label | string | Object class name |
| confidence | float | Detection confidence (0.0-1.0) |
| class_id | integer | COCO class ID |
| total_frames | integer | Number of frames processed |
| total_detections | integer | Total objects detected |
| model_used | string | Model that performed inference |
| inference_time_ms | integer | Total inference duration |

### Error Responses

**400 Bad Request**:

```json
{
  "error": "Validation Error",
  "message": "frame_numbers cannot be empty",
  "details": {
    "field": "frame_numbers",
    "constraint": "min_length:1"
  }
}
```

**404 Not Found**:

```json
{
  "error": "Not Found",
  "message": "Video file not found: /data/missing.mp4"
}
```

**500 Internal Server Error**:

```json
{
  "error": "Detection Error",
  "message": "Model inference failed on frame 60",
  "model": "yolo-world-v2",
  "frame_number": 60
}
```

## Bounding Box Format

Bounding boxes use pixel coordinates with origin at top-left corner.

**Format**:
```json
{
  "x": 100,        // Left edge (pixels from left)
  "y": 150,        // Top edge (pixels from top)
  "width": 200,    // Box width (pixels)
  "height": 250    // Box height (pixels)
}
```

**Coordinate system**:
```
(0,0)────────────────> x
 │
 │   (x,y)────────┐
 │    │           │
 │    │  Object   │ height
 │    │           │
 │    └───────────┘
 │        width
 v
 y
```

**Converting to other formats**:

**To center-based** (x_center, y_center, width, height):
```python
x_center = x + width / 2
y_center = y + height / 2
```

**To corner-based** (x1, y1, x2, y2):
```python
x1 = x
y1 = y
x2 = x + width
y2 = y + height
```

**To normalized** (0.0-1.0):
```python
x_norm = x / frame_width
y_norm = y / frame_height
width_norm = width / frame_width
height_norm = height / frame_height
```

## Confidence Thresholds and Filtering

### Confidence Threshold

Minimum confidence score for detections. Lower values increase recall, higher values increase precision.

| Threshold | Effect | Use Case |
|-----------|--------|----------|
| 0.3 | High recall, low precision | Exploratory analysis, find all candidates |
| 0.5 | Balanced (default) | General-purpose detection |
| 0.7 | High precision, low recall | Production, minimize false positives |
| 0.9 | Very high precision | Critical applications, manual review |

**Example**:
```json
{
  "confidence_threshold": 0.7  // Only detections above 70% confidence
}
```

### NMS (Non-Maximum Suppression)

Removes duplicate detections of the same object. NMS threshold controls overlap tolerance.

| NMS Threshold | Effect |
|---------------|--------|
| 0.3 | Aggressive merging, fewer boxes |
| 0.45 | Balanced (default) |
| 0.6 | Lenient merging, more boxes |

**Example**:
```json
{
  "nms_threshold": 0.45
}
```

### Class-Specific Thresholds

Different thresholds per class (requires model support):

```json
{
  "class_thresholds": {
    "person": 0.6,
    "ball": 0.4,
    "bat": 0.5
  }
}
```

## Batch Processing

Process multiple frames efficiently using batching.

### Single Frame

```json
{
  "frame_numbers": [45],
  "batch_size": 1
}
```

Inference time: ~50ms (YOLO-World-v2 on GPU T4)

### Batch Processing

```json
{
  "frame_numbers": [0, 10, 20, 30, 40, 50, 60, 70],
  "batch_size": 4
}
```

Processes in 2 batches of 4. Inference time: ~80ms (vs 400ms sequential)

**Batch size recommendations**:

| Model | CPU | GPU T4 | GPU A100 |
|-------|-----|--------|----------|
| YOLO-World-v2 | 1 | 4-8 | 16-32 |
| GroundingDINO | 1 | 2-4 | 8-16 |
| OWLv2 | 1 | 2-4 | 8-16 |
| Florence-2 | 1 | 4-8 | 16-32 |

## Performance Benchmarks

### Frames Per Second (GPU T4)

| Model | Single Frame | Batch (4) | Batch (8) |
|-------|--------------|-----------|-----------|
| YOLO-World-v2 | 52 fps | 60 fps | 65 fps |
| GroundingDINO | 20 fps | 24 fps | 26 fps |
| OWLv2 | 15 fps | 18 fps | 20 fps |
| Florence-2 | 30 fps | 36 fps | 40 fps |

### Accuracy (COCO Dataset)

| Model | mAP | AP50 | AP75 |
|-------|-----|------|------|
| YOLO-World-v2 | 45.2 | 62.8 | 48.5 |
| GroundingDINO | 52.5 | 69.7 | 56.9 |
| OWLv2 | 48.3 | 65.1 | 52.2 |
| Florence-2 | 43.8 | 61.5 | 46.8 |

### Latency Breakdown (Single Frame, GPU T4)

Using YOLO-World-v2:

| Step | Duration | Percentage |
|------|----------|------------|
| Frame loading | 8 ms | 16% |
| Preprocessing | 4 ms | 8% |
| Model inference | 32 ms | 64% |
| Post-processing (NMS) | 4 ms | 8% |
| Response formatting | 2 ms | 4% |
| **Total** | **50 ms** | **100%** |

## Use Cases and Limitations

### When to Use Object Detection

1. **Bootstrap annotations**: Generate initial bounding boxes for manual refinement
2. **Object tracking initialization**: Provide starting boxes for tracking
3. **Quality control**: Verify annotation coverage
4. **Dataset analysis**: Understand object distribution
5. **Automated annotation**: Process large video datasets

### Limitations

1. **Small objects**: Objects smaller than 32x32 pixels may be missed
2. **Occlusions**: Partially hidden objects have lower confidence
3. **Class limitations**: COCO-based models limited to 80 classes
4. **Domain shift**: Models trained on natural images struggle with specialized domains
5. **Motion blur**: Fast-moving objects may have lower detection rates

### Accuracy Expectations

| Scenario | Expected mAP |
|----------|--------------|
| Clear, well-lit objects | 70-85% |
| Partial occlusions | 50-65% |
| Small objects (< 32px) | 30-45% |
| Rare classes | 40-60% |
| Domain-specific (medical, aerial) | 35-55% |

## Troubleshooting

### No Detections

**Symptom**: Empty detections array for frames with objects

**Causes**:
- Confidence threshold too high
- Wrong class names
- Objects too small

**Solutions**:

1. Lower confidence threshold:
```json
{
  "confidence_threshold": 0.3
}
```

2. Verify class names (COCO classes only):
```json
{
  "classes": ["person", "sports ball"]  // Not "human", "ball"
}
```

3. Use auto-detect to find all objects:
```json
{
  "auto_detect": true
}
```

### Duplicate Detections

**Symptom**: Multiple boxes for same object

**Cause**: NMS threshold too high

**Solution**: Lower NMS threshold:
```json
{
  "nms_threshold": 0.3  // More aggressive merging
}
```

### Slow Inference

**Symptom**: Detection takes multiple seconds

**Causes**:
- CPU mode
- Large batch size
- High-resolution frames

**Solutions**:

1. Use GPU mode (see [Configuration](./configuration.md))

2. Reduce batch size:
```json
{
  "batch_size": 1
}
```

3. Use faster model:
```json
{
  "model": "yolo-world-v2"  // Fastest option
}
```

### CUDA Out of Memory

**Symptom**: Error during batch processing

**Cause**: Batch size too large for GPU

**Solution**: Reduce batch size:
```json
{
  "batch_size": 2  // Down from 8
}
```

## Example Workflows

### Workflow 1: Bootstrap Annotation

Detect objects for manual annotation:

```bash
curl -X POST http://localhost:8000/api/detect \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/game.mp4",
    "model": "yolo-world-v2",
    "frame_numbers": [0, 30, 60, 90, 120],
    "classes": ["person", "sports ball", "baseball bat"],
    "confidence_threshold": 0.5,
    "batch_size": 4
  }'
```

### Workflow 2: Zero-Shot Detection

Detect custom objects with text prompt:

```bash
curl -X POST http://localhost:8000/api/detect \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/game.mp4",
    "model": "grounding-dino-1-5",
    "frame_numbers": [0, 30, 60],
    "text_prompt": "baseball pitcher in windup position",
    "confidence_threshold": 0.6
  }'
```

### Workflow 3: High-Recall Detection

Find all candidate objects:

```bash
curl -X POST http://localhost:8000/api/detect \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/game.mp4",
    "model": "yolo-world-v2",
    "frame_numbers": [0, 30, 60],
    "auto_detect": true,
    "confidence_threshold": 0.3,
    "nms_threshold": 0.4
  }'
```

## Next Steps

- [Set up video tracking](./video-tracking.md) using detections
- [Configure models](./configuration.md) for your hardware
- [Use video summarization](./video-summarization.md) for context
- [Enable ontology augmentation](./ontology-augmentation.md)
- [Return to overview](./overview.md)
