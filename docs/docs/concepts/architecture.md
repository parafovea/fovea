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
- Per-row `userId` ownership columns and the `lib/ownership.ts`
  assertion helpers.
- BullMQ queues for summarization, claim extraction, claim
  synthesis, and detection.
- Multipart upload handling for video sync and JSONL import.
- Encrypted API key storage.

## What the model service adds

- FastAPI + Python 3.12 + PyTorch + Transformers.
- A model manager that loads VLM, LLM, detector, and tracker
  models per the task-slot config in
  `model-service/config/models.yaml`.
- Vendor adapters for seven audio transcription providers under
  `model-service/src/external_apis/audio/`.
- An `external_api` framework dispatching to hosted providers
  (Anthropic, OpenAI, Google) when the configured option requires
  an API key.
- An audio-visual fusion stage (`av_fusion.py`) that combines
  audio transcription and visual summarization into the final
  summary.

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
  authentication and ownership.
- The model service never talks to PostgreSQL directly. It
  receives input via the job payload and returns output to the
  backend; the backend writes the row.
- Cross-service traces are correlated via the OTLP propagation
  context attached to BullMQ job payloads.
