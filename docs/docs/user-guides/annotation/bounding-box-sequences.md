---
title: Working with Bounding Box Sequences
sidebar_position: 2
---

# Working with Bounding Box Sequences

Bounding box sequences allow you to annotate moving objects across video frames with minimal manual effort. This guide covers the complete workflow for creating, editing, and refining keyframe-based annotations.

## Quick Reference

| Task | Shortcut | Mouse Action |
|------|----------|-------------|
| Draw initial box | **B** | Click "Draw Bounding Box" button |
| Toggle timeline | **T** | Click "Show Timeline" or "Hide Timeline" button |
| Add keyframe | **K** | Click "Add Keyframe" button on timeline |
| Delete keyframe | **Delete** | Click "Delete Keyframe" button on timeline |
| Copy previous frame | **C** | Click "Copy Previous" button on timeline |
| Toggle visibility | **V** | Click visibility toggle on timeline |
| Jump 10 frames | **Shift + →** / **Shift + ←** | Use transport buttons on timeline |
| Jump to next keyframe | **Ctrl + →** | Click keyframe marker on timeline |

## Step 1: Draw the Initial Bounding Box

Every sequence starts with drawing a bounding box on a frame:

1. **Load a video** and select a persona
2. **Seek to the starting frame** where the object first appears
3. **Press B** or click the "Draw Bounding Box" button
4. **Click and drag** to draw a box around the object
5. **Release** to complete the box

The system creates a sequence with one keyframe at the current frame.

### Box Drawing Tips

- Position the box to fully contain the object
- Leave minimal padding (system interpolates size changes)
- Ensure the box is within the video frame bounds
- Use the 8 resize handles to adjust after drawing

### Opening the Timeline Panel

After creating a bounding box, open the timeline panel for precise keyframe control:

1. **Press T** or click the "Show Timeline" button in the video controls
2. The timeline panel slides in from the right, replacing the standard controls
3. The timeline displays frame markers, keyframe positions, and interpolation segments
4. Transport controls (play, step forward/backward, frame navigation) appear at the top
5. Action buttons (Add Keyframe, Delete Keyframe, Copy Previous, Toggle Visibility) appear below

The timeline remains open until you press **T** again or click "Hide Timeline". While the timeline is visible, the standard video controls (persona selector, type selector, mode toggle) are hidden. The action buttons for model services (Edit Summary, Detect Objects) move to a separate row below the timeline when expanded.

To close the timeline and return to standard controls, press **T** or click "Hide Timeline".

## Step 2: Advance to the Next Keyframe Position

Move forward in the video to where you want to place the next keyframe:

### Navigation Options

**Keyboard shortcuts**:
- **→** / **←**: Step 1 frame forward or backward
- **Shift + →** / **Shift + ←**: Jump 10 frames forward or backward
- **Ctrl + →** / **Ctrl + ←**: Jump to next or previous keyframe
- **Home** / **End**: Jump to first or last frame

**Mouse**:
- Click the timeline ruler to jump to a specific frame
- Drag the playhead (red line) to scrub through frames

**Video controls**:
- Click play/pause or press **Space**
- Use frame stepping buttons in the video player

### When to Add Keyframes

Add a keyframe when:
- Object changes direction or speed
- Object changes size significantly
- Object rotates or changes orientation
- Current interpolation deviates noticeably from actual position

## Step 3: Add a Keyframe

Once you've advanced to the desired frame:

1. **Press K** or click the "Add Keyframe" button on the timeline
2. The system adds a keyframe at the current frame
3. A keyframe marker appears on the timeline ruler
4. The bounding box becomes editable (8 resize handles)

If the timeline is not visible, press **T** to open it. The Add Keyframe button is disabled when the current frame already contains a keyframe.

### Adjusting the Keyframe Box

After adding a keyframe, adjust the box to match the object's new position:

- **Drag the box** to reposition it
- **Drag corner handles** to resize proportionally
- **Drag edge handles** to resize width or height independently
- **Fine-tune** with arrow keys (1-pixel nudges)

The system automatically updates all interpolated frames between this keyframe and adjacent keyframes.

## Step 4: Review Interpolation

Seek between keyframes to verify the interpolation looks correct:

1. **Seek to a frame between two keyframes** (not on a keyframe)
2. Observe the **interpolated box** (shown with 4 corner handles)
3. **Check if the box matches the object position**
4. If the interpolation is off, add an additional keyframe

### Visual Indicators

**Keyframe boxes**:
- 8 resize handles (corners and edges)
- Thicker outline (3px)
- Full opacity
- Draggable

**Interpolated boxes**:
- 4 corner handles only
- Thin outline (2px)
- Slightly transparent
- Click handle to convert to keyframe

**Ghost boxes**:
- Dashed outline
- Low opacity
- Non-interactive
- Shows previous frame position for reference

## Step 5: Edit Interpolation Modes (Optional)

The default linear interpolation works for most cases. For complex motion, change the interpolation mode:

1. **Select a bounding box** by clicking it
2. **Click "Interp." button** in the Quick Actions Panel (or press **I**)
3. **Choose an interpolation mode**:
   - **Linear**: Constant velocity (default)
   - **Ease In-Out**: Smooth acceleration and deceleration
   - **Ease In**: Gradual acceleration from rest
   - **Ease Out**: Gradual deceleration to stop
   - **Hold**: No interpolation (box jumps instantly)
   - **Custom**: Bezier curve editor for fine control

4. **Scrub through frames** to preview the effect
5. **Click Apply** to confirm

### When to Use Each Mode

- **Linear**: Vehicles at constant speed, objects in uniform motion
- **Ease In-Out**: People walking, natural human motion
- **Ease In**: Objects starting to move from stationary position
- **Ease Out**: Objects coming to a stop
- **Hold**: Objects that stay still then jump to new position

## Step 6: Handle Visibility (Objects Entering/Leaving Frame) {#visibility-ranges}

When objects leave and re-enter the frame, use visibility ranges:

### Mark Object as Leaving Frame

1. **Seek to the frame** where the object leaves
2. **Press V** to toggle visibility off
3. The timeline shows a gap in the visibility track

### Mark Object as Re-entering Frame

1. **Seek to the frame** where the object returns
2. **Press V** again to toggle visibility back on
3. **Add a new keyframe** (press **K**) at this position
4. **Adjust the box** to match the object's new position

The system creates a discontiguous sequence with two visible ranges and a gap.

### Alternative: In/Out Points

Use **[** and **]** to mark in and out points:

1. **Seek to start of visible range**
2. **Press [** to mark in-point
3. **Seek to end of visible range**
4. **Press ]** to mark out-point

This method is faster for marking long visibility ranges.

## Step 7: Refine and Adjust

After creating the initial sequence, refine it:

### Adding Keyframes Mid-Sequence

1. **Seek to any interpolated frame** where the box is off
2. **Press K** to convert it to a keyframe
3. **Adjust the box** position and size
4. Interpolation updates automatically

### Moving Keyframes in Time

1. **Click a keyframe marker** on the timeline to select it
2. **Drag the marker** left or right to a new frame
3. The box position and size move with the marker
4. Interpolation updates with the new timing

### Deleting Keyframes

1. **Seek to a keyframe** you want to remove
2. **Press Delete** or click "Delete" in Quick Actions Panel
3. The system removes the keyframe and re-interpolates the segment

:::warning Minimum Keyframes
You cannot delete the first or last keyframe. Sequences require at least one keyframe (for static objects) or two keyframes (for motion).
:::

### Multi-Select Keyframes

1. **Ctrl+Click** keyframe markers on the timeline to select multiple
2. **Shift+Click** to select a range of keyframes
3. **Drag selected keyframes** together to adjust timing while preserving relative positions

## Step 8: Use Timeline Action Buttons

The timeline panel contains action buttons for keyframe management. These buttons are located at the bottom of the timeline panel:

### Action Buttons

| Button | Shortcut | Action |
|--------|----------|--------|
| **Add Keyframe (K)** | K | Add keyframe at current frame |
| **Delete Keyframe (Del)** | Del | Remove keyframe at current frame (disabled on first/last keyframe) |
| **Copy Previous (C)** | C | Copy previous frame's box to current frame |
| **Toggle Visibility (V)** | V | Show or hide annotation at current frame |
| **Interpolation Mode** | I | Select interpolation type for current segment |

Buttons are enabled or disabled based on context. For example, Delete Keyframe is disabled when fewer than three keyframes exist or when on the first or last keyframe.

## Step 9: Review and Save

Before finishing:

1. **Scrub through the entire sequence** to verify interpolation
2. **Play the video** (press **Space**) to see the animation in real-time
3. **Check for jumps or glitches** in the motion
4. **Add keyframes** where needed to smooth out issues
5. **Click Save** to persist the annotation

The annotation auto-saves as you work, but clicking Save ensures the latest changes are committed.

## Advanced Techniques

### Copy Previous Frame for Slow Motion

When an object barely moves between frames:

1. **Advance one frame** (press **→**)
2. **Press Ctrl+C** to copy the previous frame's box
3. **Make small adjustments** to match the new position
4. Repeat for each frame (pseudo-tracking)

This technique is useful for:
- Slow-moving objects where interpolation overshoots
- Frame-by-frame refinement of complex motion
- Matching ground truth for evaluation datasets

### Using the Timeline Zoom

For precise keyframe placement:

1. **Click the zoom slider** in the timeline controls
2. **Zoom in** to see individual frames clearly
3. **Click the timeline ruler** to jump to exact frames
4. **Zoom out** to see the full sequence overview

### Parametric Motion Functions (Advanced)

For physics-based motion (falling objects, oscillation):

1. **Click "Interp." button**
2. **Select "Custom" mode**
3. **Click "Parametric Functions" tab**
4. **Choose a preset**:
   - Gravity: Falling objects with acceleration
   - Oscillate: Pendulum or vibration motion
   - Exponential: Fast start, slow finish
5. **Adjust parameters** (frequency, amplitude, rate)
6. **Preview and apply**

## Timeline Component Reference

The timeline displays keyframes and interpolation for the selected annotation. Press **T** or click "Show Timeline" to open the panel.

### Timeline Layout

The timeline panel contains four sections from top to bottom:

1. **Transport Controls**: Play/pause button and frame navigation (step forward/backward by 1 or 10 frames)
2. **Timeline Ruler**: Horizontal ruler showing frame numbers with time markers
3. **Keyframe Track**: Visual representation of keyframes (circles) connected by interpolation segments (lines)
4. **Action Buttons**: Add Keyframe, Delete Keyframe, Copy Previous, Toggle Visibility, and interpolation mode selector

### Timeline Elements

```
┌─────────────────────────────────────────────────────────┐
│ ◄  ▐▐  ►    ◄◄  ►►                          [Hide]     │
│ Frame: 0    10    20    30    40    50    60    70    80│
│        ●═════●══════════●═══════════●═════════●         │
│        ▓▓▓▓▓▓▓▓▓▓░░░░░░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓         │
│        Visible   Hidden Visible Range                  │
│ [K]  [Del]  [C]  [V]  [Interp: Linear ▼]              │
└─────────────────────────────────────────────────────────┘
```

- **●** Keyframe marker (circle on timeline ruler)
- **═** Interpolation segment (line connecting keyframes)
- **▓** Visible range (annotation is shown in video)
- **░** Hidden range (annotation is not visible)
- **Vertical red line** Playhead (current frame indicator)

### Timeline Interactions

- **Click ruler** to seek to a specific frame
- **Click keyframe marker** to select it (marker highlights)
- **Drag keyframe marker** left or right to move it in time
- **Click Add Keyframe button** to add keyframe at current frame (or press **K**)
- **Click Delete Keyframe button** to remove keyframe at current frame (or press **Delete**)
- **Click Copy Previous button** to copy the previous keyframe box to current frame (or press **C**)
- **Click Toggle Visibility button** to show/hide annotation at current frame (or press **V**)
- **Click interpolation dropdown** to change interpolation mode between keyframes

### Slide-Out Behavior

When the timeline is expanded:

- The timeline panel slides in from the right with a 300ms animation
- The standard controls (persona selector, type/object toggle, annotation mode) slide out to the left
- Transport controls move from the standard controls into the timeline panel
- The timeline takes full width of the control area
- Press **T** or click "Hide Timeline" to reverse the animation and restore standard controls

The timeline uses absolute positioning with CSS transforms for the slide animation. The standard controls have `pointer-events: none` and `opacity: 0` when hidden, while the timeline has `pointer-events: auto` and `opacity: 1` when visible.

## Troubleshooting

### Interpolation Looks Wrong

**Problem**: Box position doesn't match object between keyframes.

**Solution**:
- Add more keyframes at points where motion changes
- Try different interpolation modes (ease-in-out for natural motion, linear for constant velocity)
- Use custom bezier curves for complex motion

### Keyframe Won't Save

**Problem**: Cannot save keyframe, box disappears.

**Solution**:
- Ensure the box is fully inside the video frame bounds
- Check that you're on a visible frame (not in a hidden range)
- Verify the box has non-zero width and height

### Box Jumps Between Frames

**Problem**: Box appears to teleport rather than move smoothly.

**Solution**:
- Check that you're not using "Hold" interpolation mode
- Verify keyframes are in the correct order (timeline shows them sorted)
- Look for unintended visibility gaps (check visibility track on timeline)

### Cannot Add Keyframe

**Problem**: Pressing K doesn't add a keyframe.

**Solution**:
- Ensure a bounding box is selected (click it first)
- Verify you're not already on a keyframe (seeking away and back may help)
- Check that the frame is within a visible range

### Timeline Not Showing

**Problem**: Timeline panel doesn't appear when pressing T.

**Solution**:
- Select a bounding box annotation first (click on a box in the video)
- Check that the annotation has at least one keyframe
- Press **T** again or click the "Show Timeline" button in the video controls
- Verify an annotation is selected in the annotation list

### Cannot Access Standard Controls

**Problem**: Persona selector and mode toggle are not visible.

**Solution**:
- The timeline hides standard controls when expanded
- Press **T** or click "Hide Timeline" to collapse the timeline panel
- Standard controls slide back in from the left when timeline is hidden

## Performance Tips

### Working with Long Sequences

For sequences spanning 1000+ frames:

- Use sparse keyframes (every 50-100 frames for slow motion)
- Let interpolation do most of the work
- Review in sections rather than scrubbing through all frames
- Use timeline zoom to focus on specific segments

### Batch Annotation Workflow

For multiple similar objects:

1. Annotate the first object completely
2. Accept automated tracking for remaining objects (see [Automated Tracking](./automated-tracking.md))
3. Refine tracking results by adding keyframes where tracking drifted
4. Use consistent interpolation modes across similar motions

## Next Steps

- [Automated Tracking Guide](./automated-tracking.md) - Bootstrap annotations with AI tracking
- [Interpolation Modes](../../concepts/annotation-model.md#interpolation-types) - Deep dive into interpolation
- [Export Sequences](../data-management/exporting-data.md) - Share your work
- [Keyboard Shortcuts Reference](../../reference/keyboard-shortcuts.md) - Full shortcut list
