---
title: Quick Start
sidebar_position: 2
---

# Quick Start

This tutorial will guide you through creating your first video annotation with FOVEA using keyframe-based bounding box sequences. You'll learn the basics of FOVEA's efficient annotation workflow.

:::tip
This is a hands-on tutorial. Make sure you have [installed FOVEA](./installation.md) before starting.
:::

## Step 1: Start FOVEA

```bash
# From the FOVEA repository root
docker compose up
```

Wait for all services to start (about 30-60 seconds). You should see:
```
✅ frontend      Started
✅ backend       Started
✅ model-service Started
✅ postgres      Started
✅ redis         Started
```

Open your browser and navigate to:
```
http://localhost:3000
```

## Step 2: Browse Available Videos

1. The **Video Browser** displays all available videos from the `/data` directory
2. Use the search bar to filter videos by title, description, or tags
3. Click **Annotate** on any video card to open it in the annotation workspace

:::note
If no videos appear, see [Working with Your First Video](./first-video.md) to add your own video files.
:::

## Step 3: Create a Persona

Personas represent different analytical perspectives. Create your first persona:

1. Click the **Personas** tab in the left sidebar
2. Click **+ New Persona**
3. Fill in the form:
   - **Role**: Sports Analyst
   - **Information Need**: Track player movements
   - **Details**: Analyzing player positions and formations
4. Click **Save**

Your persona now has an empty ontology. We'll add entity types next.

## Step 4: Define an Entity Type

Entity types describe what you're annotating. Let's create a "Player" type:

1. Stay in the Personas view
2. Click your "Sports Analyst" persona
3. In the **Ontology** section, click **+ Add Entity Type**
4. Fill in:
   - **Name**: Player
   - **Definition**: A person participating in the game
5. Click **Save**

You now have a persona-specific ontology with one entity type.

## Step 5: Draw Your First Bounding Box

Now let's annotate a player in the video:

1. Click the **Videos** tab to return to the video browser
2. Click **Annotate** on your chosen video
3. Select your **Sports Analyst** persona from the dropdown
4. Find a frame where a player is visible (use the video controls)
5. Click the **Draw Bounding Box** button (or press **B**)
6. Draw a box around the player by clicking and dragging
7. In the dialog that appears:
   - Select **Player** as the entity type
   - Add a label (e.g., "Player #10")
   - Click **Save**

Congratulations! You've created your first annotation. But it only exists on one frame. Let's make it a sequence.

## Step 6: Add Keyframes for Motion

FOVEA uses keyframes to track objects across multiple frames efficiently:

1. **Advance the video** 10 frames forward (press **Shift + →** or drag the playhead)
2. Notice the **ghost box** from the previous frame showing where the player was
3. Press **K** to add a keyframe at the current frame
4. **Adjust the bounding box** to match the player's new position
   - Drag the box to reposition it
   - Drag the corner handles to resize it
5. **Advance another 10 frames** and repeat:
   - Press **Shift + →** to jump forward
   - Press **K** to add a keyframe
   - Adjust the box position and size

:::tip Magic of Interpolation
As you add keyframes, FOVEA automatically **interpolates** the boxes for all frames between keyframes. Seek to any frame between your keyframes to see this in action!
:::

## Step 7: See Interpolation in Action

1. **Seek to a frame between two keyframes** (not on a keyframe)
2. You'll see an **interpolated box** with 4 corner handles (not 8)
3. The box position and size are automatically calculated
4. Press **K** on an interpolated frame to convert it to a keyframe if you need to adjust it

This is the power of keyframe annotation: **3 keyframes** can create annotations for **30+ frames**.

:::tip Timeline Panel
Press **T** to open the timeline panel. The timeline shows all your keyframes as markers on a ruler, with lines connecting them to show interpolation segments. You can click keyframes to select them or drag them to adjust timing. The timeline includes buttons for adding keyframes, deleting them, and toggling visibility.
:::

## Step 8: Save Your Annotation

1. The annotation auto-saves as you work
2. Click **Save** in the annotation panel to ensure it's persisted
3. Your annotation now appears in the **Annotations List** on the right

## Next Steps

### Learn More About Annotations

- [Bounding Box Sequences](../user-guides/annotation/bounding-box-sequences.md): Master keyframe workflows
- [Automated Tracking](../user-guides/annotation/automated-tracking.md): Use AI to bootstrap annotations
- [Keyboard Shortcuts](../reference/keyboard-shortcuts.md): Annotate faster with shortcuts

### Explore Advanced Features

- [Interpolation Modes](../concepts/annotation-model.md#interpolation-types): Bezier curves, easing, parametric functions
- [Visibility Ranges](../user-guides/annotation/bounding-box-sequences.md#visibility-ranges): Objects entering/leaving frame
- [Export Your Work](../user-guides/data-management/exporting-data.md): Share annotations in JSON Lines format

### Understand the System

- [Annotation Model Concepts](../concepts/annotation-model.md): How keyframes and interpolation work
- [Personas and Ontologies](../concepts/personas.md): Why persona-based annotation matters
- [Architecture Overview](../concepts/architecture.md): How FOVEA is built

## Keyboard Shortcuts Cheatsheet

| Shortcut | Action |
|----------|--------|
| **B** | Begin drawing bounding box |
| **K** | Add keyframe at current frame |
| **→** / **←** | Step 1 frame forward/backward |
| **Shift + →** / **Shift + ←** | Jump 10 frames forward/backward |
| **Space** | Play/pause video |
| **Delete** | Remove selected keyframe |
| **Esc** | Cancel drawing or deselect |

For the complete list, see [Keyboard Shortcuts Reference](../reference/keyboard-shortcuts.md).

## Troubleshooting

### I don't see any videos
See [Working with Your First Video](./first-video.md) to learn how to add video files to the `/data` directory.

### Interpolation looks wrong
Try adding more keyframes at positions where the object's motion changes direction or speed.

### Can't draw a bounding box
Make sure you've selected a persona and have at least one entity type defined in that persona's ontology.

### Keyframe not saving
Check that the bounding box is fully inside the video frame bounds. Boxes outside the frame cannot be saved.

## Need Help?

- Check the [Common Issues](../operations/troubleshooting/common-issues.md) page
- Review the [User Guides](../user-guides/annotation/creating-annotations.md)
- See [Concepts](../concepts/architecture.md) for architectural understanding
