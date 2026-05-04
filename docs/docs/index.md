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

- The [Tutorial](tutorial/index.md) builds a complete annotation,
  summary, and claim flow on a single example video. Read this first.
- The [Guides](guide/index.md) are task-oriented. Each page answers
  "how do I do X with Fovea". Reach for these when the goal is known.
- The [Concepts](concepts/index.md) explain the architecture, the
  persona-scoped ontology model, and the v0.1.8 data isolation scheme.
  Read these when the goal is "why".
- The [Reference](reference/index.md) is the per-endpoint, per-table,
  per-environment-variable detail. Use it as a lookup.
- The [Project](project/index.md) section covers the changelog, the
  contribution workflow, and the stability policy.

## Project status

Fovea is pre-1.0. The v0.1.x line is the maintenance line for the
0.1.0 export format. Migrations under `server/prisma/migrations/`
are stable; the public REST surface documented in the
[API reference](reference/api.md) is the contract. Minor releases
within 0.1.x are backward-compatible with the 0.1.0 JSONL export
shape. See [Project > Stability](project/stability.md) for the full
policy.
