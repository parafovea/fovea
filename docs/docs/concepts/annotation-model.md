---
title: Annotation Model
sidebar_position: 4
---

# Annotation Model

All bounding box annotations in Fovea are sequences, even if they only appear in a single frame. This unified model handles both static and moving objects.

## Sequences and Keyframes

A sequence contains keyframes where you explicitly set the bounding box position. The system interpolates the intermediate frames automatically. For a static object, you create a sequence with one keyframe. For a moving object, you add keyframes at key positions and choose how to interpolate between them.

## Interpolation

Three interpolation modes control how the bounding box moves between keyframes. Linear interpolation creates straight-line motion. Bezier interpolation uses control points for smooth curves. Hold interpolation keeps the box static until the next keyframe.

## Visibility

Objects don't always stay in frame. Visibility ranges mark when an object is present. If someone walks out of frame and returns later, you create two visibility ranges with a gap in between.
