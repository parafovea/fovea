# Guides

Task-oriented walkthroughs of each feature. Each page assumes
familiarity with the [Tutorial](../tutorial/index.md) and answers a
specific question of the form "how do I do X with Fovea".

## Modelling

- [Personas](personas.md) covers the persona CRUD surface and the
  `isSystemGenerated` flag.
- [Ontologies](ontologies.md) covers the four type lists
  (entityTypes, eventTypes, roleTypes, relationTypes) and the
  `POST /api/ontology/augment` AI-assisted suggestion path.
- [World state](world-state.md) covers worldEntities,
  worldEvents, worldTimes, worldLocations, and the collection
  shapes.

## Annotation

- [Annotations](annotations.md) covers type vs object annotations,
  the `linkType` column, keyframes, and the interpolation model.
- [Tracking](tracking.md) covers automated bounding-box tracking
  through the model service.
- [Detection](detection.md) covers
  `POST /api/videos/:videoId/detect` and the persona-driven
  detection query.

## Summarisation and claims

- [Summaries](summaries.md) covers the summary job lifecycle and
  the (videoId, personaId) scoping.
- [Claims](claims.md) covers claim extraction, gloss items, and
  modality flags.
- [Relations](relations.md) covers typed claim relations and the
  cross-claim ownership check.

## Linking

- [Wikidata](wikidata.md) covers online Wikidata lookups and
  offline Wikibase mode.

## Data exchange

- [Export and import](export-import.md) covers the JSONL format,
  the v0.1.4 user-scoped stats, and the `Annotation.linkType`
  round-trip introduced in v0.1.8.
- [Cross-user imports](cross-user-imports.md) covers id
  regeneration, gloss remapping, the `metadata` provenance line,
  and the `Completed with Warnings` flow.

## Identity and access

- [Authentication](authentication.md) covers single-user vs
  multi-user mode, registration, and the session model.
- [API keys](api-keys.md) covers user-level and admin-level keys
  for external model providers.

## Operational

- [Audio transcription](audio-transcription.md) covers the seven
  vendor adapters (AssemblyAI, AWS Transcribe, Azure Speech,
  Deepgram, Gladia, Google Speech, Rev.ai).
- [Model configuration](model-config.md) covers
  `model-service/config/models.yaml`, the task slots, and
  fallbacks.
- [Deployment](deployment.md) covers the `gpu` and `cpu` Docker
  Compose profiles and the `BUILD_MODE` matrix.
- [Observability](observability.md) covers the OpenTelemetry
  collector, Prometheus, and the Grafana dashboards.
