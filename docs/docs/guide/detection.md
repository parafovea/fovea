# Detection

Use the detection endpoint to ask the model service to find
instances of a persona's entity types in a video and return
bounding boxes. The detection query is built from the persona's
ontology, so the same video produces different detections under
different personas.

## Endpoint

```text
POST /api/videos/:videoId/detect
body: {
  "personaId"?: "<uuid>",
  "manualQuery"?: "<string>",
  "queryOptions"?: {...},
  "confidenceThreshold"?: 0.3,
  "frameNumbers"?: [<number>, ...],
  "enableTracking"?: false
}
```

Either `personaId` or `manualQuery` must be provided; they are
alternative query sources. When `personaId` is supplied the route
looks the persona up via Prisma, returns 404 if the row does not
exist, and then runs a CASL ability check
(`request.ability.can('read', subject('Persona', persona))`),
throwing 403 (Forbidden) if the requester cannot read it. So a
`personaId` owned by another user returns 403; a non-existent
`personaId` returns 404.

## Detection query construction

The route reads the persona's `entityTypes` from its ontology and
constructs a structured `DetectionRequest` DTO with the entity
labels and the frame indices. The model service
dispatches the DTO through the `DetectObjectsUseCase`, which
calls the configured `IDetectionModel` adapter. The
`object_detection` task slot in `models.yaml` selects the
adapter; the shipped options are:

```text
sam-3-1                  SAM 3.1                  default on GPU
sam-3                    SAM 3
yolov12-large            YOLOv12 large
yoloe-26                 YOLOE-26
rf-detr-base             RF-DETR base
yolo-world-v2            YOLO-World v2            default on CPU
yolo-world-s-onnx        ONNX Runtime YOLO-World
grounding-dino-1-5       Grounding DINO 1.5
grounding-dino-tiny-onnx ONNX Runtime Grounding DINO
owlv2                    OWLv2 (legacy)
florence-2 / florence-2-base-onnx       Florence-2
```

See [Reference > Model config](../reference/model-config.md) and
[Reference > Model loaders](../reference/model-loaders.md).

## Acting on detections

The frontend offers detected boxes as draft annotations. Each
draft must be confirmed before it becomes a real annotation row.
The confirm path is the standard
`POST /api/annotations` documented in
[Guide > Annotations](annotations.md).
