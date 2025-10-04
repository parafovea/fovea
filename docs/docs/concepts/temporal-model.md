---
title: Temporal Model
sidebar_position: 5
---

# Temporal Model

Time in Fovea isn't just timestamps. The temporal model supports vagueness, uncertainty, and frame-level precision for video analysis.

## Time Objects

A time object can have a start point, an end point, or both. You can specify granularity (second, minute, hour) and add uncertainty bounds when exact timing isn't known. This handles real-world scenarios where you know something happened "around 3pm" rather than at a precise moment.

## Video Frame Mapping

Time objects link to specific video frames. This connects temporal annotations to the visual content, letting you mark when events occur in the video timeline.

## Temporal Collections

Collections of time objects represent patterns. You might group times to show a recurring event or a sequence of related moments.
