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
  persona-scoped ontology model, and the v0.2.x CASL-based RBAC
  scheme. Read these when the goal is "why".
- The [Reference](reference/index.md) is the per-endpoint, per-table,
  per-environment-variable detail. Use it as a lookup.
- The [Project](project/index.md) section covers the changelog, the
  contribution workflow, and the stability policy.

## Project status

Fovea is pre-1.0. The v0.3.x line is the active development line.
v0.3.0 restructured the model service into a Clean Architecture
layout (domain / application / infrastructure), added CPU-mode
inference loaders (ONNX Runtime, llama.cpp, Transformers SmolVLM),
shipped a 2026 model catalog (Wave 1 entries plus Wave 2+3
loaders for SAM 3.1, YOLOv12, YOLOE-26, RF-DETR, Canary-Qwen,
Parakeet TDT, WhisperX), wired OpenTelemetry spans onto every use
case and `model_inference` metrics onto every outbound adapter,
introduced `ThinkingTrace` and `ReasonedText` reasoning-trace
DTOs, hardened the video downloader and processor against SSRF
and path injection, and removed several backcompat shims as
planned breaking changes (see
[Project > Stability](project/stability.md)). v0.3.1
forward-ported the v0.1.8 / v0.2.1 data-fidelity, ownership, and
DoS fixes through CASL. v0.2.x continues as a maintenance line
for the 0.2.0 RBAC framework; v0.1.x continues as a maintenance
line for the 0.1.0 export format. Migrations under
`server/prisma/migrations/` are stable; the public REST surface
documented in the [API reference](reference/api.md) is the
contract. See [Concepts > Clean Architecture](concepts/clean-architecture.md)
for the v0.3.0 model-service refactor and
[Concepts > RBAC](concepts/rbac.md) for the authorization model.
