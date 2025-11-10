---
title: Automated Tracking
sidebar_position: 3
---

# Automated Tracking Workflow

Automated tracking uses AI models to generate bounding box sequences for you. This guide covers how to run tracking, review results, and refine them for production use.

## Overview

FOVEA integrates object detection and tracking models to bootstrap annotation workflows. Instead of manually creating keyframes, you can:

1. Run an AI tracking model on your video
2. Review the generated tracking candidates
3. Accept high-confidence tracks as annotations
4. Refine accepted tracks by adding or adjusting keyframes

This hybrid approach combines the speed of automation with the precision of manual refinement.

## Available Tracking Models

| Model | Use Case | Strengths | Speed |
|-------|----------|-----------|-------|
| **SAMURAI** | General object tracking | High accuracy, handles occlusion | Medium |
| **SAM2Long** | Long video sequences | Maintains identity across long clips | Slow |
| **SAM2.1** | Short segments | Fast, good for quick iteration | Fast |
| **ByteTrack** | Multiple objects | Tracks many objects simultaneously | Fast |
| **BoT-SORT** | Crowded scenes | Handles overlapping objects | Medium |
| **YOLO11n-seg** | Real-time detection | Very fast, good for pre-filtering | Very Fast |

:::tip Model Selection
Start with **SAMURAI** for general use. Switch to **ByteTrack** when tracking 5+ objects simultaneously.
:::

## Step 1: Open the Detection Dialog

1. **Load a video** in the annotation workspace
2. **Click the "Detect Objects" button** in the toolbar
3. The detection dialog opens with options for detection and tracking

## Step 2: Configure Tracking Options

### Enable Tracking

1. **Check the "Enable Tracking" checkbox**
2. The dialog expands to show tracking options

### Select Tracking Model

Choose a tracking model from the dropdown:

```
┌─ Tracking Model ──────┐
│ ○ SAMURAI            │
│ ○ SAM2Long           │
│ ○ SAM2.1             │
│ ● ByteTrack          │
│ ○ BoT-SORT           │
│ ○ YOLO11n-seg        │
└──────────────────────┘
```

### Set Confidence Threshold

Adjust the confidence slider to filter low-quality tracks:

- **0.9+**: Only high-confidence tracks (fewer false positives, may miss objects)
- **0.7-0.9**: Balanced (default, good for most cases)
- **Below 0.7**: Include uncertain tracks (more false positives, fewer misses)

### Choose Frame Range

Select which frames to process:

- **Full Video**: Process all frames (slowest, most complete)
- **Current Segment**: Process from current frame to end
- **Custom Range**: Specify start and end frames (frames 100-500)

### Enable Decimation (Optional)

Decimation reduces the number of keyframes by keeping only every Nth frame:

1. **Check "Enable Decimation"**
2. **Set decimation interval** (e.g., 5 means keep every 5th frame)
3. System stores fewer keyframes, re-interpolates between them

**Benefits**:
- Smaller file size on export
- Faster import/export
- Easier to review

**Trade-offs**:
- Less precise control
- Interpolation may not match tracking exactly

## Step 3: Run Tracking

1. **Click "Run Tracking"** button
2. A progress indicator appears
3. The job runs in the background (model service processes the video)
4. You can continue working while tracking runs

:::note Processing Time
Tracking time varies by model and video length:
- **YOLO11n-seg**: ~1-2 seconds per 100 frames
- **SAMURAI**: ~5-10 seconds per 100 frames
- **SAM2Long**: ~15-30 seconds per 100 frames
:::

## Step 4: Review Tracking Candidates

When tracking completes, the **Tracking Results Panel** appears:

```
┌─ Tracking Results (SAMURAI) ────────────────────────────┐
│ Processed: 300 frames | Found: 5 tracks                 │
├─────────────────────────────────────────────────────────┤
│ Track #1  [Person]  95% confidence  ✓ ✗                │
│ ▓▓▓▓▓▓▓▓░░░░░░▓▓▓▓▓▓  Frames: 1-85, 120-200           │
│                                                          │
│ Track #2  [Car]  88% confidence  ✓ ✗                   │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  Frames: 1-180                     │
│                                                          │
│ Track #3  [Person]  72% confidence  ✓ ✗                │
│ ▓▓░░░░░░░░▓▓▓▓▓▓▓  Frames: 1-20, 85-150              │
└─────────────────────────────────────────────────────────┘
```

### Track Row Elements

- **Track ID**: Unique identifier from tracking model
- **Label**: Detected object class
- **Confidence**: Average confidence across all frames
- **Frame coverage bar**: Visual representation of tracking (▓ = tracked, ░ = gap)
- **Frame ranges**: Text description of tracked segments
- **✓ button**: Accept this track as an annotation
- **✗ button**: Reject this track

### Confidence Color Coding

- **Green (above 90%)**: High confidence, likely accurate
- **Yellow (70-90%)**: Medium confidence, review recommended
- **Red (below 70%)**: Low confidence, likely needs refinement

## Step 5: Preview Tracks

Before accepting or rejecting, preview each track:

1. **Click a track row** to select it
2. Video seeks to the track's first frame
3. **All bounding boxes for that track appear** on the video
4. **Press Space** to play through the track with boxes animating
5. **Look for**:
   - Box drifting away from object
   - Box jumping between frames
   - Incorrect object labeling
   - Missing frames (gaps in tracking)

### Preview Controls

- **Space**: Play/pause the video
- **→** / **←**: Step through frames manually
- **Y**: Accept this track (quick keyboard shortcut)
- **N**: Reject this track (quick keyboard shortcut)
- **Esc**: Exit preview without deciding

## Step 6: Accept or Reject Tracks

For each track, decide whether to keep it:

### Accept Track (✓)

Click the **✓** button or press **Y** to accept a track. The system:

1. Converts the track to a bounding box sequence
2. Marks tracked frames as keyframes (or decimated frames if enabled)
3. Adds interpolation segments between keyframes
4. Preserves tracking metadata (source, confidence, track ID)
5. Adds the annotation to your current persona

The annotation appears in the annotations list and on the video.

### Reject Track (✗)

Click the **✗** button or press **N** to reject a track. The system:

1. Removes the track from the candidates list
2. Does not create an annotation
3. Frees up UI space for remaining tracks

**When to reject**:
- Confidence is too low (below 60%)
- Track is clearly wrong (tracking background instead of object)
- Object is not relevant to your annotation goals
- Duplicate tracking (model detected same object twice)

## Step 7: Refine Accepted Tracks

Once you accept a track, it becomes a regular bounding box sequence that you can edit:

### Common Refinements

1. **Add keyframes where tracking drifted**:
   - Seek to the frame where the box is off
   - Press **K** to add a keyframe
   - Adjust the box to match the object

2. **Remove keyframes with errors**:
   - Seek to a bad keyframe
   - Press **Delete** to remove it
   - System re-interpolates that segment

3. **Adjust interpolation mode**:
   - Press **I** to open interpolation mode selector
   - Choose a mode appropriate for the object's motion pattern

4. **Fix visibility ranges**:
   - Press **V** to mark where object truly leaves frame
   - Remove tracking gaps that are model errors

5. **Change the label**:
   - Click the annotation in the annotations list
   - Edit the label or type assignment

## Step 8: Batch Accept Workflow

For videos with many objects, use this workflow:

1. **Run tracking on the full video**
2. **Sort tracks by confidence** (highest first)
3. **Accept all tracks above 90% confidence** without preview
4. **Preview tracks 70-90% confidence** and accept good ones
5. **Reject all tracks below 70% confidence**
6. **Manually annotate missed objects** (tracking didn't detect them)

This hybrid approach balances speed and accuracy.

## Hybrid Workflow: Tracking + Manual

The most efficient workflow combines both approaches:

### 1. Easy Objects: Automated Tracking

- Run tracking for objects with clear visibility and simple motion
- Accept high-confidence tracks (>90%)
- Minimal refinement needed

### 2. Hard Objects: Manual Annotation

- Manually annotate objects that:
  - Move too quickly for tracking
  - Are heavily occluded
  - Have complex appearance changes
  - Were missed by the tracking model

### 3. Medium Objects: Tracking + Refinement

- Accept medium-confidence tracks (70-90%)
- Add keyframes where tracking drifted (usually 2-5 keyframes)
- Adjust interpolation for smooth motion

### Efficiency Metrics

Professional annotation workflows typically show:

- **Automated only**: 70% accuracy, 100% speed (baseline)
- **Manual only**: 100% accuracy, 10% speed (baseline)
- **Hybrid (recommended)**: 95% accuracy, 40% speed (baseline)

The hybrid approach provides high-quality results while significantly reducing annotation time compared to pure manual annotation.

## Decimation Deep Dive

Decimation reduces storage and processing by keeping only every Nth frame as a keyframe.

### How It Works

Without decimation:
```
Tracking outputs: Frame 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
Keyframes stored:  1, 2, 3, 4, 5, 6, 7, 8, 9, 10 (10 keyframes)
```

With decimation (interval=5):
```
Tracking outputs: Frame 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
Keyframes stored:  1,       5,          10 (3 keyframes)
Interpolation:     1→2→3→4→5→6→7→8→9→10 (linear between keyframes)
```

### Choosing Decimation Interval

| Interval | Use Case | File Size | Accuracy |
|----------|----------|-----------|----------|
| **1** | No decimation, store all frames | 100% | 100% |
| **3** | Small reduction, high fidelity | 33% | 98% |
| **5** | Balanced (recommended) | 20% | 95% |
| **10** | Large reduction, lower fidelity | 10% | 90% |
| **30** | Extreme reduction (30 fps = 1 keyframe/sec) | 3% | 80% |

For most cases, an interval of **5 frames** provides good balance between file size and accuracy.

### When to Avoid Decimation

Do not use decimation when:
- Object motion is erratic or non-linear
- Frame-perfect accuracy is required
- Export will be used for evaluation datasets
- Tracking is already sparse (few frames tracked)

## Tracking Metadata

Accepted tracks preserve metadata for provenance:

```typescript
{
  trackId: "track-42",
  trackingSource: "samurai",
  trackingConfidence: 0.95,
  perFrameConfidence: [0.98, 0.96, 0.94, ...],
  decimationInterval: 5
}
```

This metadata allows you to:
- Re-run tracking if results are poor
- Filter annotations by tracking source
- Analyze confidence trends over time
- Audit which annotations came from automation vs manual work

## Troubleshooting

### Tracking Returns No Results

**Problem**: Tracking runs successfully but finds 0 tracks.

**Solutions**:
- Lower the confidence threshold to 0.5 or below
- Try a different tracking model (YOLO11n-seg is most permissive)
- Check that the object is actually visible in the selected frame range
- Verify the model service is running (http://localhost:8000/docs)

### Tracking Drifts Off Object

**Problem**: Track starts correctly but drifts to background or wrong object.

**Solutions**:
- Accept the track anyway, then add keyframes where it drifts
- Try a different tracking model (SAMURAI designed for occlusion scenarios)
- Use shorter frame ranges (tracking accumulates error over time)
- Manually annotate the difficult segment

### Duplicate Tracks for Same Object

**Problem**: Tracking model creates 2+ tracks for the same object.

**Solutions**:
- Accept the best track (highest confidence or longest duration)
- Reject the duplicate tracks
- Use ByteTrack or BoT-SORT models (designed for identity preservation)

### Tracking Takes Too Long

**Problem**: Processing time is excessive for video length.

**Solutions**:
- Use a faster model (YOLO11n-seg or SAM2.1)
- Reduce frame range (track shorter segments)
- Enable decimation with larger interval (10 or 30)
- Check model service logs for errors slowing processing

### Accepted Track Has Wrong Label

**Problem**: Track labeled as "person" but you want "player".

**Solutions**:
- Click the annotation in the annotations list
- Change the type assignment to the correct entity type
- Add a custom label in the annotation properties
- Labels from tracking are suggestions, not locked

## Performance Tips

### Optimize Frame Range

Instead of tracking the entire video:

1. **Identify segments where each object appears**
2. **Run tracking on each segment separately**
3. **Accept tracks per segment**
4. **Combine or link annotations as needed**

This approach is faster and reduces tracking drift.

### Use Model Service Queue

If tracking multiple videos:

1. **Submit all tracking jobs at once**
2. Jobs queue in Redis (BullMQ)
3. **Monitor progress** at http://localhost:3001/admin/queues
4. Model service processes jobs in order
5. **Review results** as each job completes

### GPU vs CPU Performance

Tracking performance depends on hardware:

| Model | CPU (frames/sec) | GPU (frames/sec) | Speedup |
|-------|------------------|------------------|---------|
| YOLO11n-seg | 10-15 | 60-100 | 6x |
| SAMURAI | 2-5 | 15-25 | 7x |
| SAM2Long | 1-3 | 8-15 | 8x |
| ByteTrack | 5-10 | 30-50 | 6x |

For production deployments with many videos, GPU mode is recommended. See [GPU Mode Deployment](../../deployment/gpu-mode.md).

## Next Steps

- [Bounding Box Sequences Guide](./bounding-box-sequences.md): Refine accepted tracks
- [Export Annotations](../data-management/exporting-data.md): Include tracking metadata in exports
- [Model Service Configuration](../../model-service/configuration.md): Customize tracking models
- [GPU Deployment](../../deployment/gpu-mode.md): Speed up tracking with GPU acceleration
