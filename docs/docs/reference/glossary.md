# Glossary

Domain terms used throughout the documentation, alphabetical.

**Annotation.** A bounding-box sequence with keyframes and a
label, stored as one row in the `annotations` table. Either type
or object; see [Concepts > Annotation model](../concepts/annotation-model.md).

**BullMQ.** The Redis-backed job queue library. Backs
summarization, claim extraction, claim synthesis, and detection.

**Claim.** A hierarchical assertion extracted from a video
summary. Carries text, gloss, modality flags, and optional
parent. See
[Concepts > Claims model](../concepts/claims-model.md).

**Claim relation.** A typed edge between two claims. Type comes
from the persona's `relationTypes`.

**Cross-user import.** Import where the JSONL was exported by a
different user, detected via `metadata.exporterUserId`. Triggers
id regeneration and gloss remapping.

**Detection.** Open-vocabulary object detection driven by the
persona's `entityTypes`. See
[Guide > Detection](../guide/detection.md).

**Fovea.** Flexible Ontology Visual Event Analyzer. The
project.

**Fusion.** Combining audio transcription and visual
summarization into a single summary. Strategies are
`sequential`, `parallel`, `audio-first`.

**Gloss item.** One entry in a claim's gloss array. Type is one
of `text`, `objectRef`, `typeRef`, `annotationRef`, `claimRef`.

**Information need.** Free-text statement on a persona of what
the persona is trying to learn from a video.

**Keyframe.** A frame at which the user has explicitly placed a
bounding box. Frames between keyframes are interpolated.

**linkType.** Column added in v0.1.8 on `Annotation` to record
whether an object annotation is linked to an entity, event, time,
or location. See [Guide > Annotations](../guide/annotations.md).

**Model service.** The FastAPI process hosting VLM, LLM,
detector, tracker, and audio adapters. See
[Concepts > Model service](../concepts/model-service.md).

**Multi-user mode.** `FOVEA_MODE=multi-user`. Each user has
private personas, ontologies, world state, annotations,
summaries, and claims. The default for production.

**Object annotation.** An annotation whose label is a
world-object id (entity, event, time, or location). Discriminated
by `linkType`.

**Ontology.** The four type lists belonging to a persona:
entityTypes, eventTypes, roleTypes, relationTypes.

**Persona.** Named role plus information need. Owns one
ontology. Scopes annotations, summaries, and claims.

**Single-user mode.** `FOVEA_MODE=single-user`. The single
seeded user owns everything. Used for local development and
demos.

**Synthesis.** Re-running claim extraction against a revised
summary. Distinct from initial extraction.

**Type annotation.** An annotation whose label is an ontology
typeId. Requires `personaId`.

**VLM.** Vision-language model. Used for video summarization.

**Wikibase / Wikidata.** External linked-data backends. Online
mode hits public Wikidata; offline mode hits a local Wikibase.

**World state.** Per-user collections of named entities,
events, times, locations, and relations. Persona-independent.
