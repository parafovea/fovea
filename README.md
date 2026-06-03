# Fovea

<p align="center">
  <img src="fovea-logo.svg" alt="Fovea Logo" width="200">
</p>

<p align="center">
  <strong>Flexible Ontology Visual Event Analyzer</strong>
</p>

<p align="center">
  <a href="https://github.com/parafovea/fovea/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/parafovea/fovea/ci.yml?branch=main&style=flat-square&logo=github&label=CI" alt="CI Status"></a>
  <a href="https://github.com/parafovea/fovea/releases/latest"><img src="https://img.shields.io/github/v/release/parafovea/fovea?style=flat-square&label=Release" alt="Latest Release"></a>
  <a href="https://github.com/parafovea/fovea/blob/main/LICENSE"><img src="https://img.shields.io/github/license/parafovea/fovea?style=flat-square" alt="License"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript" alt="TypeScript"></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3.12-blue?style=flat-square&logo=python" alt="Python"></a>
</p>

<p align="center">
  <a href="https://fovea.video/docs">Documentation</a> &bull;
  <a href="https://github.com/parafovea/fovea/releases">Releases</a> &bull;
  <a href="https://github.com/parafovea/fovea/discussions">Discussions</a> &bull;
  <a href="CHANGELOG.md">Changelog</a>
</p>

## What is Fovea?

Fovea is a web-based video annotation platform for analysts who need to develop custom annotation ontologies for video data. It supports a persona-based approach where different analysts define their own interpretive frameworks and assign different semantic types to the same real-world objects.

The platform combines manual annotation with AI-supported features including video summarization, object detection, ontology suggestions, and claim extraction.

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Material UI v5, TanStack Query, Zustand, Vite |
| Backend | Node.js 22, Fastify 5, Prisma 6, BullMQ 5, TypeBox |
| Model Service | Python 3.12, FastAPI, PyTorch, Transformers, SGLang, vLLM |
| Databases | PostgreSQL 16, Redis 7 |
| Infrastructure | Docker, OpenTelemetry, Prometheus, Grafana |
| Testing | Vitest, Playwright, pytest, MSW |

## Getting started

### Prerequisites

- **Docker Desktop 4.0+** with Docker Compose v2
- **8 GB RAM minimum** (16 GB recommended)
- **NVIDIA GPU + CUDA** (optional, for GPU-accelerated inference)

### Quick start

```bash
git clone https://github.com/parafovea/fovea.git
cd fovea
docker compose up
```

Open [http://localhost:3000](http://localhost:3000) and log in with `admin` / `admin`.

Place `.mp4` video files in the `videos/` directory to start annotating.

### GPU mode

For NVIDIA GPU-accelerated inference:

```bash
docker compose --profile gpu up
```

### Trying the CVPR demo locally

The CVPR 2026 demo (10 guided tours, persona-scoped fixtures, real CC-licensed footage) runs end-to-end on a developer laptop with one command:

```bash
./scripts/run-demo-local.sh
```

That brings up Postgres + Redis + model-service (CPU build), runs migrations, fetches the demo clip set via yt-dlp + ffmpeg, exports all the demo env flags, boots backend + frontend dev servers with `FOVEA_DEMO_MODE=true` / `VITE_FOVEA_DEMO_MODE=true`, and opens `http://localhost:3000/` on the demo landing page.

First-time build is ~15 minutes (model-service downloads CV + audio weights); subsequent runs reuse cached images and the script idempotently picks up. Tear down with `./scripts/run-demo-local.sh --stop` (keeps DB) or `--reset` (drops DB volume).

Full walkthrough — service map, troubleshooting, attribution requirements — in [`docs/running-demo-locally.md`](docs/running-demo-locally.md). The architecture is documented in `notes/CVPR_2026_DEMO_PLAN.md`; the tour anchors are documented in [`docs/tour-anchors.md`](docs/tour-anchors.md); the video source attribution is in [`docs/demo-attribution.md`](docs/demo-attribution.md).

### Configuration

Create a `.env` file to customize settings:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `ADMIN_PASSWORD` | `admin` | Admin password (change for production) |
| `FOVEA_MODE` | `multi-user` | `single-user` (no login) or `multi-user` |
| `ALLOW_REGISTRATION` | `false` | Allow new user sign-ups |
| `ANTHROPIC_API_KEY` | | Claude API key for external AI |
| `OPENAI_API_KEY` | | OpenAI API key for external AI |
| `GOOGLE_API_KEY` | | Google API key for external AI |

External API keys are optional. Fovea works with local models when no keys are configured.

## Features

### Video annotation
- Bounding box annotation with draw, resize, and drag
- Keyframe-based sequences with linear and bezier interpolation
- Canvas timeline with playhead scrubbing, zoom (1-10x), and keyboard navigation
- Automated tracking (SAMURAI, SAM2, YOLO11-seg) for bootstrapping annotations
- JSON Lines import/export with conflict resolution

### Ontology management
- Persona-scoped types: entities, roles, events, and relations
- AI-powered type suggestions via LLM integration
- Wikidata integration with one-click import and ID mapping
- Rich text gloss editor with autocomplete and claim references

### Video summarization
- Vision Language Model analysis with persona context
- Audio transcription with speaker diarization (7 providers)
- Audio-visual fusion strategies for multimodal understanding
- Background processing with real-time progress updates

### Claims system
- Hierarchical claims and subclaims with manual editing
- LLM-powered extraction and synthesis
- Typed relations with filtering and search
- Provenance tracking and span highlighting

### Object detection
- Multi-model support: YOLO-World, OWLv2, Florence-2, Grounding DINO
- Ontology-aware query prompts
- Detection candidate review with accept/reject controls

### AI model service
- YAML-based model configuration with per-task selection
- GPU inference: SGLang, vLLM, Transformers with 4-bit quantization
- External APIs: Anthropic Claude, OpenAI GPT, Google Gemini
- Model status dashboard with VRAM monitoring

### Authentication
- Session-based auth with progressive lockout
- Single-user mode for local use
- User-scoped API keys with AES-256-GCM encryption

## Project structure

```
fovea/
├── annotation-tool/        Frontend (React + TypeScript + Vite)
├── server/                 Backend (Fastify + Prisma)
├── model-service/          AI model service (FastAPI + PyTorch)
├── wikibase/               Wikibase data loader (Python)
├── docs/                   Documentation (Docusaurus)
├── docker-compose.yml      Service orchestration
└── .github/workflows/      CI/CD pipelines
```

## Development

### Manual setup

```bash
# Start databases
docker compose up -d postgres redis

# Backend
cd server && npm install && npx prisma migrate dev && npx prisma db seed && npm run dev

# Frontend (new terminal)
cd annotation-tool && npm install && npm run dev

# Model service (new terminal, optional)
cd model-service && python3.12 -m venv venv && source venv/bin/activate
pip install -e . && uvicorn src.main:app --reload --port 8000
```

### Dev mode with hot reload

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Includes hot-reload volumes, Jaeger tracing at [localhost:16686](http://localhost:16686), and Maildev at [localhost:1080](http://localhost:1080).

### Running tests

**Frontend:**

```bash
cd annotation-tool
npm run test              # Vitest unit tests
npm run test:e2e          # Playwright E2E tests
npm run lint              # ESLint
npx tsc --noEmit          # Type check
```

**Backend:**

```bash
cd server
npm run test              # Vitest unit tests
npm run lint              # ESLint
```

**Model Service:**

```bash
cd model-service
uv run pytest             # Unit tests
uv run ruff check src/    # Lint
uv run mypy src/          # Type check
```

### Monitoring

| Service | URL |
|---|---|
| Grafana | [localhost:3002](http://localhost:3002) (admin/admin) |
| Prometheus | [localhost:9090](http://localhost:9090) |
| Bull Board | [localhost:3001/admin/queues](http://localhost:3001/admin/queues) |

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and PR process.

## License

[MIT](LICENSE)
