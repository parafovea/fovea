---
slug: /
---

# Fovea

Fovea (Flexible Ontology Visual Event Analyzer) is a web-based platform
for annotating video with bounding-box sequences, building per-persona
ontologies, generating VLM video summaries, and extracting structured
claims from those summaries. Three services run side by side: a React
frontend, a Fastify backend over PostgreSQL and Redis, and a FastAPI
model service that hosts the VLM, LLM, detection, and tracking models.

```bash
docker compose up
# frontend       http://localhost:3000
# backend        http://localhost:3001/api
# model service  http://localhost:8000
# default login  admin / <ADMIN_PASSWORD>
```

## Where to start

The documentation follows the [Diátaxis](https://diataxis.fr/) split:

- The [Guides](guide/index.md) are task-oriented. Each page answers
  "how do I do X with Fovea". Reach for these when the goal is known.
- The [Concepts](concepts/index.md) explain the architecture, the
  persona-scoped ontology model, and the CASL-based RBAC scheme.
  Read these when the goal is "why".
- The [Reference](reference/index.md) is the per-endpoint, per-table,
  per-environment-variable detail. Use it as a lookup.
- The [Project](project/index.md) section covers the changelog, the
  contribution workflow, and the stability policy.

## Project status

Fovea is pre-1.0. The model service is laid out as a Clean
Architecture (domain / application / infrastructure), ships
CPU-mode inference loaders (ONNX Runtime, llama.cpp, Transformers
SmolVLM), carries a 2026 model catalog (including SAM 3.1,
YOLOv12, YOLOE-26, RF-DETR, Canary-Qwen, Parakeet TDT, WhisperX),
emits OpenTelemetry spans from every use case and
`model_inference` metrics from every outbound adapter, exposes
`ThinkingTrace` and `ReasonedText` reasoning-trace DTOs, and
hardens the video downloader and processor against SSRF and path
injection. Authorization runs through CASL with data-fidelity,
ownership, and DoS guards wired into every route (see
[Project > Stability](project/stability.md)). Migrations under
`server/prisma/migrations/` are stable; the public REST surface
documented in the [API reference](reference/api.md) is the
contract. See [Concepts > Clean Architecture](concepts/clean-architecture.md)
for the model-service layout and
[Concepts > RBAC](concepts/rbac.md) for the authorization model.
