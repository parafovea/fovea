# Architecture

Fovea is three services connected by HTTP and BullMQ. The
frontend owns the user interaction; the backend owns persistence,
authorization, and job orchestration; the model service owns AI
inference. A PostgreSQL database and a Redis instance back the
persistence and queue layers.

## What the frontend adds

- React 18 + TypeScript + Material UI v5 + Vite.
- The annotation workspace (canvas, timeline, keyboard model,
  drawing state machine).
- The persona, ontology, world, summary, and claims editors.
- Admin pages for projects, groups, video assignments, sharing,
  and the RBAC permission matrix.
- A command registry with keyboard shortcuts and a command
  palette (`mod+shift+p`).
- An OpenTelemetry trace exporter that posts to
  `POST /api/telemetry/traces` for ingestion through the
  collector.

## What the backend adds

- Fastify 5 + TypeScript + Prisma 6 + PostgreSQL.
- TypeBox-defined request and response schemas with
  fast-json-stringify response serialization.
- Cookie-session authentication with `LoginAttempt`-driven
  brute-force lockout.
- A CASL-based RBAC engine with per-user ability cache and
  per-row ownership conditions. See
  [Concepts > RBAC](rbac.md).
- BullMQ queues for summarization, claim extraction, claim
  synthesis, and detection.
- Multipart upload handling for video sync and JSONL import.
- Encrypted API key storage.

## What the model service adds

- FastAPI + Python 3.12 + PyTorch + Transformers, plus
  llama.cpp and ONNX Runtime for CPU inference.
- A Clean Architecture layout (domain / application /
  infrastructure); see [Clean Architecture](clean-architecture.md).
- A model manager that loads VLM, LLM, detector, and tracker
  models per the task-slot config in
  `model-service/config/models.yaml` (or
  `models-cpu.yaml`).
- Vendor adapters for seven audio transcription providers and
  on-device adapters for Whisper, faster-whisper, Canary,
  Parakeet, and WhisperX, all behind the `IAudioTranscriber`
  port.
- An `external_api` framework dispatching to hosted providers
  (Anthropic, OpenAI, Google) when the configured option
  requires an API key.
- A modality-fusion use case that combines audio transcription
  and visual summarization into the final summary.

## Model service layout

The model service is structured as Clean Architecture layers
(domain, application, infrastructure) with one-way dependencies,
every external dependency hidden behind an outbound port,
OpenTelemetry spans on every use case, and a `model_inference`
metric on every adapter. It ships CPU inference paths (ONNX
Runtime, llama.cpp, Transformers SmolVLM / Moondream), a 2026
model catalog spanning detection (SAM 3 / 3.1, YOLOv12, YOLOE-26,
RF-DETR), audio transcription (Canary-Qwen, Parakeet TDT,
WhisperX), and vision-language summarization. `ThinkingTrace`
and `ReasonedText` DTOs carry chain-of-thought traces, and the
video downloader and processor are hardened against SSRF and
path injection. See [Project > Stability](../project/stability.md)
for the contract surface.

## RBAC layer

CASL layers RBAC, projects, groups, video assignments, and
sharing on top of the persona-scoped data model:

- A CASL `Ability` is built per request from the user's roles plus
  the `RolePermission` table. Routes check the ability for both
  list filters (`accessibleBy`) and instance updates
  (`subject(...)`).
- `Project` rows organize videos, personas, world states,
  summaries, claims, and annotations under a shared owner. A
  project belongs either to a `User` (via `ownerUserId`) or to a
  `UserGroup` (via `ownerGroupId`).
- `UserGroup` rows organize users into teams. `GroupMembership`
  carries the user's group role (`group_owner`, `group_admin`,
  `group_member`).
- `ProjectVideoAssignment` links a video to a project and
  optionally to a user for review workflows.
  `VideoAssignmentRule` rows capture conditions that auto-assign
  matching videos.
- `ResourceShare` rows record per-resource shares between users or
  groups, with `read_only` or `forkable` permission levels and an
  optional expiry.
- `/api/admin/permissions` lets a `system_admin` edit
  `RolePermission` rows at runtime; mutations invalidate the
  per-user ability cache so changes take effect on the next
  request.

Data-fidelity, ownership, and DoS guards are implemented through
CASL rather than the legacy `lib/ownership.ts` helpers. See
[Concepts > RBAC](rbac.md) for the gate shapes.

## How a summary travels

```text
frontend                  backend                       model-service
   |                         |                              |
   | POST /api/videos/        |                              |
   |   summaries/generate     |                              |
   | -----------------------> |                              |
   |                          | enqueue BullMQ job           |
   |                          | ---------------------------> |
   |                          |                              | load VLM
   |                          |                              | extract frames
   |                          |                              | transcribe audio
   |                          |                              | run VLM caption
   |                          |                              | fuse a/v
   |                          | <--------------------------- | result
   |                          | write VideoSummary row       |
   |                          | mark job complete            |
   | GET /api/jobs/:jobId     |                              |
   | -----------------------> |                              |
   | <----------------------- |                              |
```

## Data flow boundaries

- The frontend never talks to the model service directly. Every
  AI call goes through the backend, which gates it on
  authentication and CASL ability.
- The model service never talks to PostgreSQL directly. It
  receives input via the job payload and returns output to the
  backend; the backend writes the row.
- Cross-service traces are correlated via the OTLP propagation
  context attached to BullMQ job payloads.
