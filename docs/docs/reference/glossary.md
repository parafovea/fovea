---
title: Glossary
sidebar_position: 6
---

# Glossary

This glossary defines terms used throughout FOVEA documentation and the application interface.

## Annotation

An annotation links video content to types or world objects. Annotations in FOVEA use bounding box sequences to mark objects across multiple frames. Each annotation belongs to a persona and references either a type from that persona's ontology or an existing world object (entity, event, or time).

## Bounding Box

A bounding box marks a rectangular region in a video frame. It stores four values: x and y coordinates for the top-left corner, and width and height dimensions. Bounding boxes track objects as they move through the video.

## Bounding Box Sequence

All annotations in FOVEA use bounding box sequences. A sequence contains keyframes where you explicitly position boxes, interpolation segments that define how boxes transition between keyframes, and visibility ranges that mark when objects appear in the frame. Even single-frame annotations are sequences with one keyframe.

## Decimation

Decimation reduces storage by keeping only every Nth frame from tracking output as a keyframe. For example, decimation with interval 5 keeps frames 0, 5, 10, 15, and discards frames 1-4, 6-9, 11-14. The system interpolates the discarded frames. This creates smaller export files while maintaining smooth motion.

## Entity

An entity represents a physical or conceptual object in the world model. Entities exist independently of any single video and can appear across multiple videos. Examples include specific people, vehicles, or locations. Entities have type assignments that link them to entity types in various personas' ontologies.

## Entity Type

An entity type is a category definition in a persona's ontology. It describes what kind of entities the persona recognizes. For example, a sports analyst might define "Player", "Coach", and "Referee" as entity types. Entity types are persona-specific, allowing different analysts to categorize the same real-world objects differently.

## Event

An event represents something that happens in the world model. Events link entities through roles and have temporal extent. Like entities, events can span multiple videos and have persona-specific interpretations through event types.

## Export

Export creates a JSON Lines file containing personas, ontologies, world state, and annotations. You can export in keyframes-only mode (stores keyframes and interpolation configuration) or fully interpolated mode (stores every frame with a bounding box). Keyframes-only mode produces files 50-100x smaller.

## Interpolation

Interpolation generates bounding boxes for frames between keyframes. The system supports multiple interpolation modes. Linear interpolation creates constant-velocity motion. Bezier interpolation uses control points for curved paths with acceleration. Ease-in, ease-out, and ease-in-out provide natural-looking motion with speed changes. Hold interpolation keeps the box static until jumping to the next keyframe.

## Interpolation Segment

An interpolation segment defines how to transition between two keyframes. It stores the start frame, end frame, and interpolation type. For bezier interpolation, it also stores control points. A sequence with three keyframes has two interpolation segments.

## JSON Lines

JSON Lines is the file format FOVEA uses for import and export. Each line in the file contains one JSON object. The first field is always "type" (persona, entity, annotation, etc.) and the second is "data" containing that object. This format allows streaming large files line by line rather than loading everything into memory.

## Keyframe

A keyframe is a frame where you explicitly set the bounding box position and size. The system marks keyframes and uses them as anchors for interpolation. Adding more keyframes gives you more control over object motion. Removing keyframes makes the system interpolate longer distances.

## Ontology

An ontology belongs to a persona and contains that persona's type definitions. This includes entity types, event types, role types, and relation types. Each persona has exactly one ontology. Ontologies allow different analysts to define their own conceptual frameworks for understanding video content.

## Persona

A persona represents an analyst with a specific perspective and information need. Each persona has their own ontology defining how they categorize and interpret video content. For example, a sports analyst and a biomechanics researcher might both watch the same game footage but create different types and annotations based on their distinct analytical goals.

## Sequence

See Bounding Box Sequence.

## Track

A track is the output from an automated tracking model. When you run object detection and tracking, the model generates tracks showing where it thinks objects appear across frames. You review these tracks and accept the good ones as annotations or reject the bad ones.

## Tracking Confidence

Tracking confidence is a score between 0 and 1 indicating how certain the tracking model is that it correctly followed an object. Tracks with confidence above 0.9 are usually accurate. Tracks with confidence below 0.7 often have errors and need review.

## Tracking Metadata

When you accept a track as an annotation, the system preserves metadata about where it came from. This includes the tracking model used (SAMURAI, ByteTrack, etc.), the track ID assigned by the model, and confidence scores. This metadata helps you audit which annotations came from automation versus manual work.

## Type Assignment

A type assignment links a world object (entity or event) to a type in a persona's ontology. One entity can have type assignments from multiple personas. For example, the same person might be typed as "Player" by a sports analyst and "Athlete" by a physiotherapist.

## Visibility Range

A visibility range marks when an object is present in the video. Each range has a start frame, end frame, and visibility flag. Objects that leave and re-enter the frame have multiple visibility ranges with gaps between them. Keyframes can only exist within visible ranges.

## World State

The world state contains all entities, events, times, and collections that exist across videos. Unlike types which are persona-specific, world objects in the world state are shared. Multiple personas can refer to the same entity but assign it different types.

## Next Steps

The [Quick Start Tutorial](../getting-started/quick-start.md) uses these terms in context. The [Annotation Model Concepts](../concepts/annotation-model.md) page explains keyframes, interpolation, and sequences in detail.
