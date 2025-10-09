---
title: Video Tracking
---

# Video Tracking

Video tracking follows objects across multiple frames, maintaining consistent identities through occlusions, scale changes, and motion. The service provides automated track generation for annotation workflows.

## How It Works

The tracking pipeline:

1. **Initial Detection**: Detect objects in first frame (or use provided bounding boxes)
2. **Feature Extraction**: Extract visual features from detected regions
3. **Frame-to-Frame Association**: Match objects across consecutive frames
4. **Track Management**: Maintain track IDs, handle births and deaths
5. **Interpolation**: Fill gaps in tracks due to occlusions
6. **Response Generation**: Return track sequences with bounding boxes per frame

## Available Models

### SAMURAI

**Model ID**: `yangchris11/samurai`

**Type**: Motion-aware segmentation and tracking

**Characteristics**:
- VRAM: 3 GB
- Speed: Real-time (25-45 fps)
- Accuracy improvement: 7.1% over SAM2.1

**Best for**:
- Fast-moving objects
- Occlusion handling
- Motion-based tracking

**Example**:
```bash
curl -X POST http://localhost:8000/api/track \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/game.mp4",
    "model": "samurai",
    "frame_range": {"start": 0, "end": 100},
    "confidence_threshold": 0.7,
    "decimation": 5
  }'
```

### SAM2Long

**Model ID**: `Mark12Ding/SAM2Long`

**Type**: Long-video tracking with error correction

**Characteristics**:
- VRAM: 3 GB
- Speed: Real-time (30-50 fps)
- Accuracy improvement: 5.3% over SAM2.1

**Best for**:
- Extended video sequences
- Error accumulation prevention
- Long-duration tracking

**Example**:
```bash
curl -X POST http://localhost:8000/api/track \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/game.mp4",
    "model": "sam2long",
    "frame_range": {"start": 0, "end": 500},
    "confidence_threshold": 0.7
  }'
```

### SAM2.1

**Model ID**: `facebook/sam2.1-hiera-large`

**Type**: Segment Anything Model for video

**Characteristics**:
- VRAM: 3 GB
- Speed: Real-time (30-50 fps)
- Baseline model

**Best for**:
- Stable baseline tracking
- Proven reliability
- General-purpose use

**Example**:
```bash
curl -X POST http://localhost:8000/api/track \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/game.mp4",
    "model": "sam2-1",
    "frame_range": {"start": 0, "end": 200},
    "confidence_threshold": 0.6
  }'
```

### YOLO11n-seg

**Model ID**: `ultralytics/yolo11n-seg`

**Type**: Lightweight instance segmentation

**Characteristics**:
- VRAM: 1 GB
- Speed: Very fast (40-70 fps)
- Smallest model

**Best for**:
- Speed-critical applications
- Limited VRAM environments
- Real-time tracking

**Example**:
```bash
curl -X POST http://localhost:8000/api/track \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/game.mp4",
    "model": "yolo11n-seg",
    "frame_range": {"start": 0, "end": 100},
    "confidence_threshold": 0.5
  }'
```

## Tracking Workflow

### Detection → Association → Interpolation

**Step 1: Detection**

Initialize tracks with object detections from first frame.

```json
{
  "initial_detections": [
    {"bbox": {"x": 100, "y": 150, "width": 80, "height": 120}, "label": "person"}
  ]
}
```

Or use automatic detection:
```json
{
  "auto_detect": true,
  "detection_model": "yolo-world-v2"
}
```

**Step 2: Association**

Match objects across frames using visual similarity and motion prediction.

**Association methods**:
- IoU (Intersection over Union): Spatial overlap
- Feature similarity: Visual appearance matching
- Kalman filter: Motion prediction

**Step 3: Interpolation**

Fill gaps in tracks when objects are temporarily occluded.

```json
{
  "interpolation": "linear",
  "max_gap_frames": 10
}
```

## API Endpoint

### Request

```
POST /api/track
```

**Content-Type**: `application/json`

**Request Schema**:

```json
{
  "video_path": "/data/example.mp4",
  "model": "samurai",
  "frame_range": {"start": 0, "end": 100},
  "initial_detections": [
    {"bbox": {"x": 100, "y": 150, "width": 80, "height": 120}, "label": "person"}
  ],
  "confidence_threshold": 0.7,
  "decimation": 5,
  "interpolation": "linear",
  "max_gap_frames": 10
}
```

**Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| video_path | string | Yes | - | Path to video file |
| model | string | No | (from config) | Tracking model to use |
| frame_range | object | Yes | - | Start and end frame numbers |
| initial_detections | array | No | null | Starting bounding boxes (auto-detect if null) |
| auto_detect | boolean | No | false | Automatically detect objects in first frame |
| detection_model | string | No | "yolo-world-v2" | Model for auto-detection |
| confidence_threshold | float | No | 0.7 | Minimum confidence for tracks |
| decimation | integer | No | 1 | Keep every Nth frame (1 = all frames) |
| interpolation | string | No | "linear" | Interpolation mode: linear, cubic, none |
| max_gap_frames | integer | No | 10 | Maximum frames to interpolate across |

### Response

**Status**: 200 OK

```json
{
  "tracks": [
    {
      "track_id": 1,
      "label": "person",
      "boxes": [
        {"frame_number": 0, "bbox": {"x": 100, "y": 150, "width": 80, "height": 120}, "confidence": 0.92},
        {"frame_number": 5, "bbox": {"x": 105, "y": 155, "width": 82, "height": 118}, "confidence": 0.90},
        {"frame_number": 10, "bbox": {"x": 110, "y": 160, "width": 84, "height": 116}, "confidence": 0.89}
      ],
      "frame_count": 3,
      "start_frame": 0,
      "end_frame": 10
    },
    {
      "track_id": 2,
      "label": "ball",
      "boxes": [
        {"frame_number": 0, "bbox": {"x": 300, "y": 200, "width": 40, "height": 40}, "confidence": 0.85},
        {"frame_number": 5, "bbox": {"x": 320, "y": 210, "width": 38, "height": 38}, "confidence": 0.83}
      ],
      "frame_count": 2,
      "start_frame": 0,
      "end_frame": 5
    }
  ],
  "total_tracks": 2,
  "frames_processed": 100,
  "model_used": "samurai",
  "inference_time_ms": 3450,
  "decimated": true,
  "decimation_factor": 5
}
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| tracks | array | Object tracks across frames |
| track_id | integer | Unique identifier for track |
| label | string | Object class |
| boxes | array | Bounding boxes per frame |
| frame_number | integer | Frame index |
| bbox | object | Bounding box coordinates |
| confidence | float | Tracking confidence (0.0-1.0) |
| frame_count | integer | Number of frames in track |
| start_frame | integer | First frame of track |
| end_frame | integer | Last frame of track |
| total_tracks | integer | Number of tracks returned |
| frames_processed | integer | Total frames analyzed |
| model_used | string | Tracking model used |
| inference_time_ms | integer | Total tracking duration |
| decimated | boolean | Whether decimation was applied |
| decimation_factor | integer | Decimation interval |

### Error Responses

**400 Bad Request**:

```json
{
  "error": "Validation Error",
  "message": "frame_range.end must be greater than frame_range.start",
  "details": {
    "field": "frame_range",
    "start": 100,
    "end": 50
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
  "error": "Tracking Error",
  "message": "Track lost at frame 45",
  "track_id": 1,
  "frame_number": 45
}
```

## Track ID Preservation

Track IDs remain consistent across frames, enabling object identity tracking.

### Track Lifecycle

**Birth**: Track starts when object first appears
```json
{
  "track_id": 1,
  "start_frame": 0,
  "label": "person"
}
```

**Continuation**: Track persists across frames
```json
{
  "frame_number": 10,
  "track_id": 1,
  "confidence": 0.87
}
```

**Death**: Track ends when object disappears or confidence drops
```json
{
  "track_id": 1,
  "end_frame": 95,
  "reason": "low_confidence"
}
```

### Re-identification

When objects reappear after occlusion:

**Same track ID** (successful re-ID):
```json
{
  "track_id": 1,
  "frame_number": 85,
  "confidence": 0.75,
  "gap_frames": 15
}
```

**New track ID** (failed re-ID):
```json
{
  "track_id": 3,
  "frame_number": 85,
  "confidence": 0.70,
  "note": "Possible duplicate of track 1"
}
```

## Handling Occlusions

### Temporary Occlusions

Objects briefly hidden behind other objects.

**Solution**: Interpolation fills gaps up to `max_gap_frames`.

```json
{
  "max_gap_frames": 10,
  "interpolation": "linear"
}
```

**Before interpolation**:
```
Frame 0: ✓ Track 1
Frame 5: ✗ Occluded
Frame 10: ✓ Track 1
```

**After interpolation**:
```
Frame 0: ✓ Track 1 (detected)
Frame 5: ✓ Track 1 (interpolated)
Frame 10: ✓ Track 1 (detected)
```

### Permanent Occlusions

Objects remain hidden or leave the scene.

**Solution**: Track terminates after `max_gap_frames`.

```json
{
  "max_gap_frames": 10
}
```

If object missing for 11 frames, track ends.

## Decimation for Efficiency

Process every Nth frame to reduce computation while maintaining track quality.

### Full Frame Processing

```json
{
  "decimation": 1  // Process all frames
}
```

For 100 frames: processes frames 0, 1, 2, 3, ..., 100

**Keyframes**: 100
**Inference time**: 4000ms

### Decimated Processing

```json
{
  "decimation": 5  // Process every 5th frame
}
```

For 100 frames: processes frames 0, 5, 10, 15, ..., 100

**Keyframes**: 20
**Inference time**: 800ms (5x faster)
**Interpolated frames**: 80

### Impact on Accuracy

| Decimation Factor | Keyframes (100 frames) | Speed Gain | Accuracy Loss |
|-------------------|------------------------|------------|---------------|
| 1 (none) | 100 | 1x | 0% |
| 2 | 50 | 2x | &lt;5% |
| 5 | 20 | 5x | 5-10% |
| 10 | 10 | 10x | 10-15% |
| 20 | 5 | 20x | 15-25% |

**Recommendations**:
- Slow motion: decimation 2-5
- Normal speed: decimation 5-10
- Fast motion: decimation 1-2
- Static scenes: decimation 10-20

## Tracking Model Recommendations

### By Use Case

**Fast-moving objects** (sports, wildlife):
```json
{
  "model": "samurai",
  "decimation": 2,
  "confidence_threshold": 0.6
}
```

**Long videos** (surveillance, dashcam):
```json
{
  "model": "sam2long",
  "decimation": 10,
  "max_gap_frames": 30
}
```

**Real-time requirements**:
```json
{
  "model": "yolo11n-seg",
  "decimation": 1,
  "confidence_threshold": 0.7
}
```

**General-purpose**:
```json
{
  "model": "sam2-1",
  "decimation": 5,
  "confidence_threshold": 0.7
}
```

### Performance Comparison

| Model | FPS (GPU T4) | MOTA | Occlusion Handling | Best For |
|-------|--------------|------|--------------------| ---------|
| SAMURAI | 25 | 78.3 | Excellent | Fast motion |
| SAM2Long | 30 | 76.8 | Excellent | Long videos |
| SAM2.1 | 30 | 73.5 | Good | Baseline |
| YOLO11n-seg | 40 | 69.2 | Fair | Speed |

**MOTA**: Multiple Object Tracking Accuracy (higher is better)

## Performance Benchmarks

### Throughput (GPU T4)

| Model | 100 frames (decimation 1) | 100 frames (decimation 5) | 500 frames (decimation 10) |
|-------|---------------------------|---------------------------|----------------------------|
| SAMURAI | 4.0s (25 fps) | 0.8s (125 fps) | 5.0s (100 fps) |
| SAM2Long | 3.3s (30 fps) | 0.7s (143 fps) | 4.2s (119 fps) |
| SAM2.1 | 3.3s (30 fps) | 0.7s (143 fps) | 4.2s (119 fps) |
| YOLO11n-seg | 2.5s (40 fps) | 0.5s (200 fps) | 3.2s (156 fps) |

### Accuracy Metrics

| Model | MOTA | IDF1 | MT | ML |
|-------|------|------|----|----|
| SAMURAI | 78.3 | 82.1 | 65% | 8% |
| SAM2Long | 76.8 | 80.5 | 62% | 10% |
| SAM2.1 | 73.5 | 77.2 | 58% | 12% |
| YOLO11n-seg | 69.2 | 72.8 | 52% | 15% |

**Metrics**:
- MOTA: Multiple Object Tracking Accuracy
- IDF1: ID F1 Score (identity preservation)
- MT: Mostly Tracked (objects tracked &gt;80% of frames)
- ML: Mostly Lost (objects tracked &lt;20% of frames)

## Use Cases and Limitations

### When to Use Video Tracking

1. **Annotation automation**: Generate bounding box sequences automatically
2. **Keyframe reduction**: Decimation produces sparse keyframes for manual refinement
3. **Motion analysis**: Track object trajectories and velocities
4. **Multi-object scenarios**: Track multiple objects simultaneously
5. **Long videos**: Process extended sequences efficiently

### Limitations

1. **Identity switches**: Similar-looking objects may swap IDs
2. **Occlusion recovery**: Re-identification may fail after long occlusions
3. **Scale changes**: Large size changes reduce accuracy
4. **Crowded scenes**: Many overlapping objects cause confusion
5. **Motion blur**: Fast motion reduces feature quality

### Accuracy Expectations

| Scenario | Expected MOTA |
|----------|---------------|
| Clean, isolated objects | 80-90% |
| Partial occlusions | 70-80% |
| Crowded scenes | 60-70% |
| Long-term tracking (>500 frames) | 65-75% |
| Fast erratic motion | 55-70% |

## Troubleshooting

### Track ID Switches

**Symptom**: Objects exchange IDs

**Causes**:
- Similar appearance
- Close proximity
- Occlusions

**Solutions**:

1. Reduce decimation:
```json
{
  "decimation": 2  // More frequent updates
}
```

2. Increase confidence threshold:
```json
{
  "confidence_threshold": 0.8
}
```

3. Use motion-aware model:
```json
{
  "model": "samurai"
}
```

### Tracks Lost During Occlusion

**Symptom**: Tracks terminate when objects hidden

**Cause**: `max_gap_frames` too low

**Solution**: Increase gap tolerance:
```json
{
  "max_gap_frames": 20  // Up from 10
}
```

### Slow Tracking

**Symptom**: Processing takes minutes for short video

**Causes**:
- No decimation
- CPU mode
- Heavy model

**Solutions**:

1. Enable decimation:
```json
{
  "decimation": 5
}
```

2. Use faster model:
```json
{
  "model": "yolo11n-seg"
}
```

3. Switch to GPU mode (see [Configuration](./configuration.md))

### Too Many False Tracks

**Symptom**: Background regions tracked as objects

**Cause**: Confidence threshold too low

**Solution**: Raise threshold:
```json
{
  "confidence_threshold": 0.8  // Up from 0.5
}
```

## Example Workflows

### Workflow 1: Automated Annotation

Generate tracks for manual refinement:

```bash
curl -X POST http://localhost:8000/api/track \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/game.mp4",
    "model": "samurai",
    "frame_range": {"start": 0, "end": 200},
    "auto_detect": true,
    "detection_model": "yolo-world-v2",
    "confidence_threshold": 0.7,
    "decimation": 5,
    "interpolation": "linear"
  }'
```

### Workflow 2: Long Video Surveillance

Track objects in extended footage:

```bash
curl -X POST http://localhost:8000/api/track \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/surveillance.mp4",
    "model": "sam2long",
    "frame_range": {"start": 0, "end": 5000},
    "auto_detect": true,
    "confidence_threshold": 0.6,
    "decimation": 10,
    "max_gap_frames": 30
  }'
```

### Workflow 3: High-Precision Tracking

Track with minimal interpolation:

```bash
curl -X POST http://localhost:8000/api/track \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/data/game.mp4",
    "model": "samurai",
    "frame_range": {"start": 0, "end": 100},
    "initial_detections": [
      {"bbox": {"x": 100, "y": 150, "width": 80, "height": 120}, "label": "pitcher"}
    ],
    "confidence_threshold": 0.8,
    "decimation": 1,
    "interpolation": "cubic"
  }'
```

## Next Steps

- [Use object detection](./object-detection.md) for track initialization
- [Configure models](./configuration.md) for your hardware
- [Use video summarization](./video-summarization.md) for context
- [Enable ontology augmentation](./ontology-augmentation.md)
- [Return to overview](./overview.md)
