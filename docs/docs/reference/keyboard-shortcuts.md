---
title: Keyboard Shortcuts
sidebar_position: 5
---

# Keyboard Shortcuts Reference

FOVEA uses keyboard shortcuts throughout the annotation interface. Most actions that require multiple clicks with the mouse can be performed with a single keystroke.

## Video Navigation

The arrow keys control frame-by-frame navigation. Press **→** to move forward one frame or **←** to move backward. Hold **Shift** with either arrow key to jump 10 frames at a time. For larger jumps, **Home** takes you to the first frame and **End** to the last.

When working with keyframes, **Ctrl+→** and **Ctrl+←** jump directly to the next or previous keyframe in the sequence, skipping all interpolated frames between them.

Video playback follows standard conventions. **Space** toggles play and pause. The **J**, **K**, and **L** keys provide reverse, pause, and forward playback respectively, matching professional video editing software.

## Annotation Actions

Press **B** to begin drawing a new bounding box. Once you have a box selected, **K** adds a keyframe at the current frame. To remove a keyframe, navigate to that frame and press **Delete**.

The **V** key toggles visibility for the selected annotation at the current frame. This creates visibility ranges when objects enter or leave the video frame. For more precise control, **[** and **]** mark in and out points for visibility.

To copy the previous frame's bounding box to the current frame, use **Ctrl+C**. This is useful for tracking slowly moving objects where interpolation might overshoot the actual position.

Press **I** to open the interpolation mode selector for the current segment. This lets you change how the system calculates intermediate frames between keyframes.

## Timeline Editing

Click keyframes on the timeline to select them. **Ctrl+Click** adds multiple keyframes to the selection. **Shift+Click** between two keyframes selects all keyframes in that range. **Ctrl+A** selects all keyframes in the sequence.

Drag keyframes to move them in time. Hold **Alt** while dragging to disable snapping, allowing precise frame placement.

## Tracking Workflow

When reviewing tracking results, **Y** accepts the current track as an annotation and **N** rejects it. Press **↓** and **↑** to move between tracks in the results panel. **Enter** previews the selected track. **Ctrl+T** opens the tracking dialog from the video view.

## Selection and Deselection

**Tab** cycles forward through annotations on the current frame. **Shift+Tab** cycles backward. This is faster than clicking each annotation when multiple objects overlap.

**Esc** deselects the current annotation or cancels the current drawing operation. Use it whenever you want to return to an unselected state.

## Box Adjustments

With a box selected, the arrow keys nudge it 1 pixel in any direction. Hold **Shift** with the arrow keys to nudge 10 pixels at a time. This provides precise positioning without requiring mouse interaction.

## Dialog and Export Operations

**Ctrl+E** opens the export dialog. **Ctrl+I** opens the import dialog. These work from anywhere in the application.

**Ctrl+S** saves the current annotation. While annotations auto-save as you work, this provides an explicit save action when needed.

**Ctrl+Z** and **Ctrl+Shift+Z** provide undo and redo functionality across most operations.

## Platform Notes

On macOS, **Cmd** generally replaces **Ctrl** for standard operations like copy, paste, undo, and save. The exception is **Ctrl+Click** for multi-selection, which uses **Ctrl** on all platforms.

## Context Help

Press **?** at any time to show the keyboard shortcuts dialog with context-sensitive shortcuts for your current view.

## Next Steps

The [Bounding Box Sequences Guide](../user-guides/annotation/bounding-box-sequences.md) demonstrates these shortcuts in practice. The [Automated Tracking Guide](../user-guides/annotation/automated-tracking.md) covers tracking-specific shortcuts.
