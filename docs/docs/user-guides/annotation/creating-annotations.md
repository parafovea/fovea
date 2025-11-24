---
title: Creating Annotations
sidebar_position: 1
---

# Creating Annotations

Annotations in FOVEA link video regions to your ontology types or to world objects. This guide introduces the annotation system and helps you choose the right workflow.

## What Are Annotations?

An **annotation** is a spatial-temporal marker on a video that identifies where and when something appears or happens. Each annotation consists of:

- **Spatial region**: Bounding box(es) defining the object's position
- **Temporal range**: Frame numbers where the object is visible
- **Assignment**: Link to an entity type, event type, or world object
- **Metadata**: Persona, confidence, tracking source (if AI-generated)

## Annotation Modes

FOVEA supports multiple annotation modes depending on what you're linking to:

### 1. Type Assignment

Assign a persona-specific type to a video region:

- **Entity Type Assignment**: Mark a bounding box as "Person", "Vehicle", "Animal", etc.
- **Event Type Assignment**: Mark a video segment as "Goal Scored", "Collision", "Migration", etc.

This mode is useful when you're developing an ontology and want to define types for objects without creating world objects yet.

### 2. Entity Linking

Link a bounding box to an existing Entity instance:

- Select from your existing entities
- Video region becomes grounded to a specific real-world object
- Same entity can appear in multiple videos
- Supports tracking object identity across clips

### 3. Event Linking

Link a video segment to an existing Event instance:

- Mark when a known event occurs in the video
- Events can span multiple frames or occur at specific moments
- Same event can be observed from multiple camera angles

### 4. Location Linking

Link a video region to a Location instance:

- Mark where in the video a geographic location appears
- Useful for surveillance footage or geographic studies
- Locations can have GPS coordinates

### 5. Collection Linking

Link to entity or event collections:

- Annotate groups of related objects
- Mark scenes with semantic relationships
- Collections inherit properties from their members

## Annotation Workflows

FOVEA provides two complementary approaches:

### Manual Annotation

Create annotations by hand with full control:

1. Draw bounding boxes on video frames
2. Add keyframes to track object movement
3. System interpolates boxes between keyframes
4. Choose interpolation modes (linear, bezier, ease-in-out)

**When to use**:
- High precision required
- Complex or occluded objects
- Small number of objects
- Ground truth datasets

**See**: [Working with Bounding Box Sequences](./bounding-box-sequences.md)

### Automated Tracking

Bootstrap annotations with AI models:

1. Run object detection and tracking
2. Review generated tracking candidates
3. Accept high-confidence tracks
4. Refine with manual keyframes

**When to use**:
- Many objects to annotate
- Objects with clear visibility
- Speed is important
- Willing to refine AI results

**See**: [Automated Tracking Workflow](./automated-tracking.md)

### Hybrid Workflow (Recommended)

The most efficient approach combines both:

1. **Run tracking** on the full video
2. **Accept high-confidence tracks** (>90%) without review
3. **Preview medium-confidence tracks** (70-90%), accept good ones
4. **Manually annotate** objects tracking missed or got wrong
5. **Refine all annotations** by adding keyframes where needed

Hybrid workflows typically achieve high accuracy (90%+) while significantly reducing annotation time compared to pure manual annotation.

## Bounding Box Sequences

All spatial annotations in FOVEA use bounding box sequences, which consist of:

### Keyframes

**Keyframes** are frames where you explicitly define the box position and size:

- Drawn manually or from tracking
- Shown with 8 resize handles (corners + edges)
- Editable (drag to move, resize handles to adjust)

### Interpolated Frames

**Interpolated frames** are automatically generated between keyframes:

- System calculates box position and size
- Shown with 4 corner handles
- Can be converted to keyframes by pressing **K**

### Interpolation Modes

Choose how the system interpolates between keyframes:

| Mode | Description | Use Case |
|------|-------------|----------|
| **Linear** | Constant velocity | Vehicles at steady speed |
| **Ease In-Out** | Smooth acceleration/deceleration | People walking |
| **Ease In** | Gradual start | Objects starting to move |
| **Ease Out** | Gradual stop | Objects coming to rest |
| **Bezier** | Custom curve | Complex motion paths |
| **Hold** | No interpolation, instant jump | Teleporting or cut scenes |

### Visibility Ranges

Objects can have discontiguous visibility when they leave and re-enter the frame:

```
Frames:  0   10   20   30   40   50   60   70   80
Visible: ▓▓▓▓▓▓▓▓░░░░░░░░░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓
         (visible) (hidden)  (visible again)
```

Press **V** to toggle visibility at the current frame.

## Quick Start: Your First Annotation

### Option A: Manual (30 seconds)

1. **Load a video** and select a persona
2. **Press B** to draw a bounding box around an object
3. **Advance 10-20 frames** (Shift + →)
4. **Press K** to add a keyframe
5. **Adjust the box** to match the new position
6. **Press Space** to preview the interpolation
7. **Click Save** to persist the annotation

### Option B: Automated (60 seconds)

1. **Load a video** and click "Detect Objects"
2. **Enable Tracking** and select "SAMURAI" model
3. **Set confidence threshold** to 0.7
4. **Click Run Tracking** and wait for results
5. **Review tracking candidates** in the results panel
6. **Press Y** to accept good tracks, **N** to reject bad ones
7. **Refine accepted tracks** by adding keyframes where tracking drifted

## Auto-Save Behavior

Annotations automatically save as you work, eliminating the need to manually save after every change.

### How Auto-Save Works

- **Automatic**: Changes save 1 second after you stop editing
- **Debounced**: Multiple rapid changes trigger one save (not one per change)
- **Silent**: No visual feedback or "saved" indicator (background operation)
- **Smart**: System distinguishes new annotations from database updates

### What Triggers Auto-Save

- Adding or moving keyframes
- Adjusting bounding box position or size
- Changing annotation properties (type, visibility, etc.)
- Modifying interpolation settings

### Manual Save (Ctrl+S)

While annotations auto-save, you can force immediate save with **Ctrl+S**. Use this before:

- Switching to a different video
- Closing the browser
- Testing that changes persisted correctly

**Tip**: You don't need to save manually in most workflows. Auto-save handles persistence automatically.

## Keyboard Shortcuts

Master these shortcuts to annotate efficiently:

| Action | Shortcut |
|--------|----------|
| Draw bounding box | **B** |
| Toggle timeline | **T** |
| Add keyframe | **K** |
| Delete keyframe | **Delete** |
| Toggle visibility | **V** |
| Copy previous frame | **C** |
| Next frame | **→** |
| Previous frame | **←** |
| Jump 10 frames | **Shift + →** / **Shift + ←** |
| Jump to keyframe | **Ctrl + →** / **Ctrl + ←** |
| Play/pause | **Space** |
| Interpolation mode | **I** |

See the full list in [Keyboard Shortcuts Reference](../../reference/keyboard-shortcuts.md).

## Understanding the Timeline

The timeline panel displays keyframes and interpolation for the selected annotation. Press **T** to toggle the timeline visibility. The timeline slides in from the right and replaces the standard video controls when expanded.

```
┌─────────────────────────────────────────────────────────┐
│ Frame: 0    10    20    30    40    50    60    70    80│
│        ●═════●══════════●═══════════●═════════●         │
│        ▓▓▓▓▓▓▓▓▓▓░░░░░░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓         │
└─────────────────────────────────────────────────────────┘
```

- **●** Keyframe marker (click to select, drag to move in time)
- **═** Interpolation segment (line connecting keyframes)
- **▓** Visible range (annotation is shown)
- **░** Hidden range (annotation is hidden)
- **Red line** Current frame indicator (playhead)

The timeline includes transport controls for frame navigation and action buttons for keyframe operations (Add Keyframe, Delete Keyframe, Copy Previous, Toggle Visibility). Press **T** or click "Hide Timeline" to return to standard controls.

## Export Modes

When exporting annotations, choose between:

### Keyframes-Only Export

Exports only keyframes with interpolation metadata:

- **Smaller file size** (10-20% of full export)
- **Preserves intent** (shows where you added keyframes)
- **Re-interpolation required** on import

### Fully Interpolated Export

Exports every frame with explicit box coordinates:

- **Larger file size** (every frame stored)
- **Frame-precise** (no re-interpolation needed)
- **Compatible with tools** that don't support interpolation

See [Exporting Data](../data-management/exporting-data.md) for details.

## Common Patterns

### Annotating a Single Object

1. Draw initial box at first appearance
2. Add keyframes every 10-20 frames
3. Use **Ease In-Out** interpolation for natural motion
4. Mark visibility when object leaves/enters frame
5. Export with keyframes-only mode

### Annotating Multiple Objects

1. Run automated tracking with **SAMURAI** model
2. Accept all high-confidence tracks
3. Manually annotate objects tracking missed
4. Refine by adding keyframes where tracking drifted
5. Export with fully interpolated mode for compatibility

### Annotating Long Videos (1000+ frames)

1. Use sparse keyframes (every 50-100 frames)
2. Let interpolation handle most frames
3. Review in sections rather than full scrub
4. Enable decimation in tracking (interval=10)
5. Export with keyframes-only to reduce file size

### Annotating Events (not objects)

1. Create event in world state
2. Enter annotation mode and select "Event Linking"
3. Mark start and end frames of event occurrence
4. Add bounding box if event has spatial extent (optional)
5. Link to event instance

## Next Steps

Choose a guide based on your preferred workflow:

- **[Bounding Box Sequences](./bounding-box-sequences.md)**: Detailed manual annotation guide with keyframes, interpolation, and timeline
- **[Automated Tracking](./automated-tracking.md)**: AI-powered tracking workflow with model selection, confidence tuning, and refinement
- **[Exporting Data](../data-management/exporting-data.md)**: Share your annotations in JSON Lines format
- **[Importing Data](../data-management/importing-data.md)**: Load annotations with conflict resolution

## Troubleshooting

### Cannot Draw Bounding Box

**Problem**: Pressing B doesn't activate drawing mode.

**Solutions**:
- Ensure a video is loaded and playing
- Select a persona from the persona dropdown
- Check that you're in annotation workspace (not ontology workspace)

### Keyframe Won't Save

**Problem**: Box disappears when trying to save keyframe.

**Solutions**:
- Ensure box is fully inside video frame bounds
- Check box has non-zero width and height
- Verify you're on a visible frame (not in hidden range)

### Interpolation Looks Wrong

**Problem**: Box doesn't match object between keyframes.

**Solutions**:
- Add more keyframes where motion changes
- Try different interpolation mode (ease-in-out for natural motion)
- Use custom bezier curves for complex paths

### Tracking Returns No Results

**Problem**: Automated tracking finds 0 objects.

**Solutions**:
- Lower confidence threshold to 0.5 or below
- Try a different model (YOLO11n-seg is most permissive)
- Check that objects are actually visible in selected range
- Verify model service is running (http://localhost:8000/docs)
