# FOVEA

[![CI](https://github.com/parafovea/fovea/actions/workflows/ci.yml/badge.svg)](https://github.com/parafovea/fovea/actions/workflows/ci.yml)
[![Documentation](https://github.com/parafovea/fovea/actions/workflows/docs.yml/badge.svg)](https://fovea.video/docs)
[![Docker](https://github.com/parafovea/fovea/actions/workflows/docker.yml/badge.svg)](https://github.com/parafovea/fovea/actions/workflows/docker.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **Note:** This project is currently in prerelease. APIs and features may change.

FOVEA (Flexible Ontology Visual Event Analyzer) is a web-based video annotation tool designed for analysts who need to develop custom annotation ontologies for video data. The system supports a persona-based approach, where different analysts can define their own interpretive frameworks and assign different semantic types to the same real-world objects.

The platform combines manual annotation capabilities with AI-supported features including automated video summarization, object detection, and intelligent ontology suggestions.

**Documentation:** [https://fovea.video/docs](https://fovea.video/docs)

## Features

FOVEA provides tools for browsing video collections, building custom ontologies, and creating spatial-temporal annotations. The ontology builder lets you define entities, roles, events, and their relationships using a persona-specific approach. The annotation workspace supports bounding box drawing with keyframe-based tracking and multiple interpolation modes.

Rich text definitions can include references to Wikidata entities and type relationships. All exports use JSON Lines format with schema validation to ensure data integrity.

AI capabilities include video summarization using Vision Language Models (local or external APIs), audio transcription with speaker diarization, audio-visual fusion strategies for multimodal analysis, and background job processing with real-time progress monitoring. External API support includes Claude Sonnet 4.5, GPT-4o, and Gemini 2.5 Flash for vision and language tasks, plus seven audio transcription providers (AssemblyAI, Deepgram, Azure, AWS, Google, Rev.ai, Gladia).

## Quick Start

The recommended way to run FOVEA is with Docker Compose. If you prefer manual setup, you'll need Node.js 22+, Python 3.12+, PostgreSQL 16, and Redis 7.

### Docker Compose (Recommended)

For local development with CPU-based inference:

```bash
docker compose up
```

For production deployment with NVIDIA GPU support:

```bash
docker compose --profile gpu up
```

Open your browser to [http://localhost:3000](http://localhost:3000) after the services start.

The stack includes frontend (port 3000), backend API (port 3001), model service (port 8000), PostgreSQL (port 5432), Redis (port 6379), and observability services (OpenTelemetry Collector, Prometheus, Grafana). CPU mode runs with minimal dependencies, while GPU mode enables NVIDIA GPU support with full inference engines. See the [Deployment Guide](https://fovea.video/docs/deployment/overview) for configuration details.

### Manual Development Setup

For active development with individual service control:

```bash
# Start infrastructure
docker compose up postgres redis

# Backend
cd server && npm install && npm run dev

# Frontend
cd annotation-tool && npm install && npm run dev

# Model service (optional)
cd model-service && pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```

### Development with Hot Reload and Debugging Tools

For active development with live reload, distributed tracing, and email testing:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

This provides:
- Hot-reload volumes for code changes (no rebuild needed)
- Jaeger distributed tracing at [http://localhost:16686](http://localhost:16686)
- Maildev email testing at [http://localhost:1080](http://localhost:1080)
- Auto-reload for backend, frontend, and model service

## Usage

Place video files (`.mp4`) and their metadata files (`.info.json`) in the `/data` directory. The video browser will display all available videos with searchable metadata.

### Creating Annotations

Open a video from the browser to enter the annotation workspace. Select an annotation mode (Entity, Role, or Event) and draw bounding boxes on the video. Use keyboard shortcuts to navigate frame-by-frame for precision. The system supports keyframe-based tracking with automatic interpolation between frames.

### Building Ontologies

Start by defining a persona that describes your analytical role and information needs. Add entity types, event types, and role types that reflect your interpretive framework. The gloss editor supports rich text definitions with references to other types and Wikidata entities.

### AI-Assisted Analysis

Generate video summaries by clicking "Generate Summary" in the video browser. The system uses Vision Language Models to analyze video content, with optional audio transcription and speaker diarization for multimodal understanding. Choose between local models (GPU-based) or external APIs (Claude Sonnet 4.5, GPT-4o, Gemini 2.5 Flash). Select from four audio-visual fusion strategies to control how audio and visual information are combined. All processing runs in the background so you can continue working, with real-time progress updates.

### Exporting Data

Click "Export" to generate JSON Lines format output. Exports include ontology definitions, annotations, and video metadata, all validated against the JSON schema to ensure data integrity.

## Architecture

FOVEA uses a three-tier architecture with a React frontend, Node.js backend, and Python model service. All services communicate via REST APIs and use PostgreSQL for persistence with Redis for job queuing.

The frontend uses React 18 with TypeScript, Material-UI v5, and Redux Toolkit for state management. TanStack Query v5 handles server state synchronization. The video player is built on video.js with custom annotation overlays. Testing uses Vitest, Playwright, and MSW 2.0.

The backend runs on Node.js 22 LTS with Fastify 5 and TypeScript. PostgreSQL 16 with Prisma 6 ORM provides data persistence. BullMQ 5 and Redis 7 handle background job processing. Schema validation uses TypeBox with Fastify type provider.

The model service is built with Python 3.12, FastAPI 0.110+, and Pydantic v2. Machine learning capabilities use PyTorch 2.5+ and Transformers 4.47+. Inference runs on SGLang 0.4+ with vLLM 0.6+ fallback. All I/O operations are non-blocking with asyncio and aiohttp.

Infrastructure uses Docker with BuildKit and Compose Spec for containerization. Observability is provided by OpenTelemetry, Prometheus, Grafana, and Loki. Structured logging uses pino for Node.js and structlog for Python.

## Development

Each service has its own development workflow. The frontend and backend support hot reload for rapid iteration.

**Frontend:**
```bash
cd annotation-tool
npm run dev          # Development server
npm run test         # Unit tests (Vitest)
npm run test:e2e     # All E2E tests (Playwright)
npm run test:e2e -- --project=functional     # Keyboard shortcuts (35 tests)
npm run test:e2e -- --project=smoke          # Critical paths (17 tests)
npm run test:e2e -- --project=accessibility  # WCAG 2.1 AA compliance (50 tests)
npm run lint         # ESLint
npx tsc --noEmit     # Type checking
```

**Backend:**
```bash
cd server
npm run dev          # Development server with hot reload
npm run build        # Compile TypeScript
npm run test         # Run tests
npm run lint         # ESLint
```

**Model Service:**
```bash
cd model-service
pip install -r requirements-dev.txt
pytest --cov=src     # Tests with coverage
ruff check .         # Lint
mypy src/            # Type checking
```

### Testing Mode

The frontend supports a developer testing mode that pre-populates the Redux store with sample data (tactical analyst persona, Wikidata-referenced ontology types, and sample entities/locations). Enable it by creating `annotation-tool/.env.local` with `VITE_ENABLE_TEST_DATA=true`. The application will display console warnings when test mode is active. This data exists only in browser memory and does not persist to the database.

### Monitoring

When running with Docker Compose, access monitoring dashboards at:

- Grafana: [http://localhost:3002](http://localhost:3002) (admin/admin)
- Prometheus: [http://localhost:9090](http://localhost:9090)
- Bull Board: [http://localhost:3001/admin/queues](http://localhost:3001/admin/queues)

See the [Monitoring Guide](https://fovea.video/docs/operations/monitoring/overview) for details on metrics, tracing, and custom instrumentation.

## Contributing

Contributions are welcome in all forms: bug fixes, feature additions, documentation improvements, and issue reports. See `CONTRIBUTING.md` for development environment setup, coding standards, pull request process, testing requirements, and documentation guidelines.

For questions or discussions, visit [GitHub Discussions](https://github.com/parafovea/fovea/discussions).

## License

MIT License. See `LICENSE` for details.
