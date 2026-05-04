# Tracking

Use the tracking flow to extend a hand-drawn keyframe sequence to
neighbouring frames automatically. The model service hosts the
tracker; the backend wraps it as a job. Tracking is used after
two or more keyframes have been drawn and the user wants
intermediate keyframes filled in by the model rather than by
linear interpolation.

## How the tracker is selected

The selected tracker model is configured under the
`object_tracking` task slot in
`model-service/config/models.yaml`. The default is the
co-tracker family; the loader is
`model-service/src/tracking_loader.py`. See
[Reference > Model config](../reference/model-config.md).

## When to use tracking

Linear interpolation between two keyframes is fine when motion is
near-linear. Tracking is the right choice when:

- The annotated object accelerates or changes direction between
  keyframes.
- The annotation needs frame-accurate boxes, not visually
  plausible ones.
- The model service has GPU available
  (`docker compose --profile gpu up`); CPU tracking is slow.

## Lifecycle

The frontend dispatches a tracking request with the
(annotationId, startFrame, endFrame) tuple. The backend forwards
to the model service, which returns interpolated boxes. The
returned frames are written back as additional keyframes on the
annotation. The user can edit or delete any of them through the
normal annotation editing flow documented in
[Guide > Annotations](annotations.md).
