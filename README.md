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
  <a href="https://fovea.video">Documentation</a> &bull;
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
| Frontend | React 18, TypeScript, shadcn-ui, Tailwind CSS v4, TanStack Query, Zustand, Vite |
| Backend | Node.js 22, Fastify 5, Prisma 6, BullMQ 5, TypeBox |
| Model Service | Python 3.12, FastAPI, PyTorch, Transformers, SGLang, vLLM, llama.cpp, ONNX Runtime |
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

### Trying the demo locally

The guided-tour demo (twelve guided tours, persona-scoped fixtures, real CC-licensed footage) runs end-to-end on a developer laptop with one command:

```bash
./scripts/run-demo-local.sh
```

That brings up Postgres + Redis + model-service (CPU build), runs migrations, fetches the demo clip set via yt-dlp + ffmpeg, exports the demo env flags, boots backend + frontend dev servers with `FOVEA_DEMO_MODE=true` + `VITE_FOVEA_DEMO_MODE=true`, and opens `http://localhost:3000/` on the demo landing page.

First-time build is around 15 minutes (model-service downloads CV + audio weights); subsequent runs reuse cached images and the script idempotently picks up. Tear down with `./scripts/run-demo-local.sh --stop` (keeps DB) or `--reset` (drops DB volume).

For deploying the same demo at a public URL (e.g. `demo.fovea.video`), see the [demo deployment runbook](https://fovea.video/docs/operations/demo-fovea-deployment) which uses a different env-var path (`VITE_TOUR_DEMO=1` + `VITE_DEMO_PUBLIC=1`) with the MSW model-service interception layer. The tour-anchor reference and per-tour walkthroughs live under the [Reference](https://fovea.video/docs/reference/tour-anchors) and [Guide](https://fovea.video/docs/guide/tour-catalog) sections.

### Configuration

Create a `.env` file to customize settings:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `ADMIN_PASSWORD` | `admin` | Admin password (change for production) |
| `ALLOW_REGISTRATION` | `false` | Allow new user sign-ups |
| `HF_TOKEN` | | HuggingFace token for gated models (pyannote diarization, etc.) |
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
- Multi-model support: YOLO-World, OWLv2, Florence-2, Grounding DINO, SAM 3 / 3.1
- Ontology-aware query prompts
- Detection candidate review with accept/reject controls

### AI model service
- YAML-based model configuration with per-task selection
- GPU inference: SGLang, vLLM, Transformers with 4-bit quantization
- External APIs: Anthropic Claude, OpenAI GPT, Google Gemini
- Model status dashboard with VRAM monitoring

### Authentication
- Session-based auth with progressive lockout
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

All install, lint, type-check, test, and build recipes live in one place: the
root `Makefile` (Node via pnpm, Python via uv). Run `make help` to list every
target.

```bash
make install          # Install all dependencies (pnpm workspace + uv)
make lint             # Lint every component
make typecheck        # Type-check every component (tsc + mypy)
make test             # Run every test suite
make build            # Build the frontend and backend
```

Per-suite targets are also available, e.g. `make test-frontend`,
`make test-backend`, `make test-model-service`, `make test-wikibase` (and the
matching `lint-*`). Backend tests need Postgres and Redis — start them first
with `make dev-infra`.

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
