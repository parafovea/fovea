# Detection

Use the detection endpoint to ask the model service to find
instances of a persona's entity types in a video and return
bounding boxes. The detection query is built from the persona's
ontology, so the same video produces different detections under
different personas.

## Endpoint

```text
POST /api/videos/:videoId/detect
body: { "personaId": "<id>", "frame": <number> | { "start": ..., "end": ... } }
```

Since v0.1.8 the route runs `assertPersonaOwned` on the
`personaId` body field before reading the persona's ontology to
build the detection query. A foreign `personaId` returns 404.
Previously a user could feed user B's ontology into the detector
and consume model-service quota on B's behalf.

## Detection query construction

The route reads the persona's `entityTypes` from its ontology and
constructs a model query of the form
"detect player, ball, field in frame N". The model service
selects the open-vocabulary detector configured under the
`object_detection` task slot in `models.yaml`; the default is the
OWLv2 family. See
[Reference > Model config](../reference/model-config.md).

## Acting on detections

The frontend offers detected boxes as draft annotations. Each
draft must be confirmed before it becomes a real annotation row.
The confirm path is the standard
`POST /api/annotations` documented in
[Guide > Annotations](annotations.md).
