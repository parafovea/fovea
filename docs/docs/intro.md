---
sidebar_position: 1
slug: /
---

# Fovea

Fovea (Flexible Ontology Visual Event Analyzer) is a web-based video annotation system. It pairs a persona-based annotation model with VLM, LLM, detection, tracking, and audio inference, and runs as a containerized stack of three services backed by PostgreSQL, Redis, and (optionally) GPU hardware.

## What Fovea does

Each analyst (persona) defines an ontology of entity, event, role, and relation types. Annotators mark video content with bounding box sequences linked either to those types or to shared world objects (entities, events, times, locations). Inference services produce video summaries, claim graphs, object detections, and tracks. Projects and groups scope work across users, with role-based access control governing every read and write.

## Documentation map

| Section | Contents |
|---------|----------|
| [Getting Started](./getting-started/installation.md) | Installation, quick start, manual setup, first video |
| [Concepts](./concepts/architecture.md) | Architecture, personas, annotations, projects/groups, RBAC, observability |
| [User Guides](./user-guides/annotation/creating-annotations.md) | Annotation, claims, ontology, audio, collaboration, admin |
| [Model Service](./model-service/overview.md) | Clean Architecture layout, model catalog, audio processing, CPU inference |
| [Deployment](./deployment/overview.md) | Docker profiles, CPU/GPU modes, S3, build modes |
| [Operations](./operations/monitoring/overview.md) | Monitoring, troubleshooting |
| [Development](./development/contributing.md) | Contributing, code style, testing |
| [Reference](./reference/data-model.md) | Data model, environment variables, ports, glossary |
| [API Reference](./api-reference/overview.md) | REST API endpoints |

## Feature areas

- **Persona-based ontologies and annotations.** Persona-scoped types and shared world objects with bounding box sequences (keyframes plus interpolation).
- **Video summarization, claims, and ontology augmentation.** VLM and LLM workers driven through BullMQ.
- **Object detection and tracking.** YOLO, Grounding DINO, Florence-2, OWLv2, SAM 3.1, SAM 2.1, SAMURAI, YOLO11-seg.
- **Audio processing.** Local transcription (Canary-Qwen, Parakeet TDT, WhisperX) and seven external vendor adapters (AssemblyAI, AWS Transcribe, Azure Speech, Deepgram, Gladia, Google Speech, Rev AI), with diarization and VAD.
- **Projects, groups, and RBAC.** Three-scope role model (system, group, project) with CASL, data-driven RolePermission matrix, ownership rules, and re-share caps.
- **Admin configuration surface.** Server-persisted system config and per-user / per-persona inference preferences propagated live to the model service via `/api/admin/reconfigure`.
- **CPU inference.** ONNX Runtime detectors, llama.cpp GGUF text and multimodal loaders, Transformers small-VLM loaders.
- **Clean Architecture model service.** Domain, application, and infrastructure layers with port adapters and a dependency-injection container.

## Related links

- [Common operations](./operations/common-tasks.md)
- [Troubleshooting](./operations/troubleshooting/common-issues.md)
- [GitHub repository](https://github.com/parafovea/fovea)
