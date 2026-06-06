# Tracking

Use the tracking flow to extend a hand-drawn keyframe sequence to
neighboring frames automatically. The model service exposes the
tracker directly at `/api/tracking/track`; the Fovea backend and
annotation tool do not yet forward to it, so this flow is reachable
only by calling the model-service API directly. Tracking is intended
for use after two or more keyframes have been drawn and the user
wants intermediate keyframes filled in by the model rather than by
linear interpolation.

## How the tracker is selected

The selected tracker model is configured under the
`object_tracking` task slot in
`model-service/config/models.yaml`. The shipped options are:

```text
sam-3-1-tracking   SAM 3.1 tracking adapter   default on GPU
sam2-1             SAM 2.1
sam2long           SAM 2 Long
samurai            SAMURAI
yolo11n-seg        YOLO 11 nano segmentation
```

The loader lives under
`model-service/src/infrastructure/adapters/outbound/models/tracking/`
(SAM 2 family) and
`models/sam3/tracking_adapter.py` (SAM 3 / 3.1). Every adapter
implements the `ITrackingModel` outbound port; the use case is
`TrackObjectsUseCase`. See
[Reference > Model config](../reference/model-config.md) and
[Concepts > Clean Architecture](../concepts/clean-architecture.md).

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

The model-service `/api/tracking/track` endpoint accepts a video
reference and a seed box and returns interpolated boxes for the
requested frame range. Wiring this through the Fovea backend
(`server/src/routes/videos/`) and into the annotation tool
(`annotation-tool/src/store/queries/`) so that returned frames are
written back as additional keyframes on an annotation is planned
but not yet implemented; in the current build, propagation between
keyframes in the annotation tool is handled by client-side linear
interpolation (see `annotation-tool/src/utils/interpolation.ts`).
Once wired, the returned frames will be editable through the normal
annotation editing flow documented in
[Guide > Annotations](annotations.md).
