# Video Annotation Ontology Development Tool

A web-based tool for developing annotation ontologies for video data with AI-supported capabilities for automated video analysis, object detection, and intelligent ontology suggestions.

## Documentation

**Full documentation is available at: [https://fovea.video/docs](https://fovea.video/docs)**

The documentation includes:
- [Getting Started Guide](https://fovea.video/docs/getting-started/installation) - Install and configure FOVEA
- [User Guides](https://fovea.video/docs/user-guides/annotation/creating-annotations) - How to use FOVEA features
- [API Reference](https://fovea.video/docs/api-reference/overview) - Complete API documentation
- [Deployment Guides](https://fovea.video/docs/deployment/overview) - Production deployment options
- [Operations Guides](https://fovea.video/docs/operations/common-tasks) - Maintenance and troubleshooting

## Features

### Core Features
- **Video Browser**: Browse and search through available video data with metadata display
- **Ontology Builder**: Create and manage entities, roles, and events with a persona-based approach
- **Annotation Workspace**: Draw bounding boxes and create temporal annotations on videos
- **Gloss Editor**: Rich text definitions with type references for semantic relationships
- **JSON Schema Validation**: Ensures data integrity for exports
- **JSON Lines Export**: Export ontologies and annotations in a structured format

### AI-Supported Features
- **Video Summarization**: Automatic video analysis using Vision Language Models
- **Job Status Monitoring**: Real-time progress tracking for AI tasks with visual indicators
- **Background Processing**: Asynchronous job queue system for long-running AI operations

## Installation

### Prerequisites
- Docker and Docker Compose (recommended)
- OR: Node.js 22+, Python 3.12+, PostgreSQL 16, Redis 7 (for manual setup)
- Video files in MP4 format with accompanying metadata JSON files

### Quick Start with Docker Compose (Recommended)

1. **CPU Mode (Default)** - For local development:
```bash
docker compose up
```

2. **GPU Mode** - For production with NVIDIA GPUs:
```bash
docker compose --profile gpu up
```

3. Open your browser and navigate to: http://localhost:3000

The Docker Compose setup includes:
- Frontend (port 3000)
- Backend API (port 3001)
- Model Service with AI capabilities (port 8000) - CPU or GPU variant
- PostgreSQL database (port 5432)
- Redis queue (port 6379)
- OpenTelemetry Collector, Prometheus, and Grafana for observability

**Note**: The project uses Docker Compose profiles for CPU/GPU deployment. CPU mode (default) runs the model service with minimal dependencies. GPU mode (`--profile gpu`) enables NVIDIA GPU support with full inference engines. See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed configuration options.

### Manual Development Setup

For active development, you can run services individually:

1. Start PostgreSQL and Redis:
```bash
docker compose up postgres redis
```

2. Install and start backend:
```bash
cd server
npm install
npm run dev
```

3. Install and start frontend:
```bash
cd annotation-tool
npm install
npm run dev
```

4. Install and start model service (optional, for AI features):
```bash
cd model-service
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```

## Usage

### Video Browser
- View all available videos from the data directory
- Search by title, description, or tags
- Click "Annotate" to open a video in the annotation workspace

### Ontology Builder
1. Create a new ontology by defining a persona (role, information need, details)
2. Add entity types (e.g., "Container", "Truck", "Ship")
3. Define roles that can be filled by entities or events
4. Create event types with associated roles
5. Use the gloss editor to create rich definitions with type references

### Annotation Workspace
1. Open a video from the browser
2. Select an annotation mode (Entity, Role, or Event)
3. Draw bounding boxes on the video
4. Navigate frame-by-frame for precision
5. View current annotations in the sidebar

### Data Export
- Click "Export" to generate JSON Lines format
- Exports include the ontology, annotations, and video metadata
- All exports are validated against the JSON schema

### AI Features

#### Video Summarization
The system uses Vision Language Models to automatically generate summaries of video content:
1. Navigate to a video in the Video Browser
2. Click "Generate Summary"
3. Monitor job progress with the real-time status indicator
4. View the generated summary when complete

The summarization pipeline runs as a background job, allowing you to continue working while the AI processes the video.

## Data Format

The tool works with video files and metadata in the following format:
- Video files: `.mp4` format
- Metadata files: `.info.json` containing video information
- Both files should be in the `/data` directory

## Architecture

### Frontend
- **Framework**: React 18 + TypeScript 5.3+ + Vite 5
- **UI**: Material-UI v6, CSS-in-JS with Emotion
- **State Management**: Redux Toolkit + TanStack Query v5
- **Video Player**: video.js with custom annotation overlay
- **Testing**: Vitest, Playwright, Testing Library, MSW 2.0

### Backend
- **Framework**: Node.js 22 LTS + Fastify 5 + TypeScript 5.3+
- **Database**: PostgreSQL 16 with Prisma 6 ORM
- **Queue**: BullMQ 5 with Redis 7
- **Validation**: Zod for type-safe schema validation
- **Development**: tsx for hot reload

### Model Service
- **Framework**: Python 3.12 + FastAPI 0.110+ + Pydantic v2
- **ML Stack**: PyTorch 2.5+, Transformers 4.47+
- **Inference**: SGLang 0.4+ (primary) with vLLM 0.6+ fallback
- **Async**: asyncio + aiohttp for non-blocking I/O

### Infrastructure
- **Containerization**: Docker with BuildKit, Compose Spec
- **Observability**: OpenTelemetry, Prometheus, Grafana, Loki
- **Logging**: Structured logging with pino (Node.js), structlog (Python)

## Development

### Frontend Development
```bash
cd annotation-tool
npm run dev          # Start development server
npm run test         # Run unit tests with Vitest
npm run test:e2e     # Run E2E tests with Playwright
npm run lint         # Run ESLint
npx tsc --noEmit     # Type checking
```

### Backend Development
```bash
cd server
npm run dev          # Start with hot reload (tsx)
npm run build        # Compile TypeScript
npm run test         # Run tests
npm run lint         # Run ESLint
```

### Model Service Development
```bash
cd model-service
pip install -r requirements-dev.txt
pytest --cov=src     # Run tests with coverage
ruff check .         # Lint Python code
mypy src/            # Type checking
```

### Observability

The application includes a complete observability stack with distributed tracing, metrics collection, and monitoring dashboards.

Access monitoring dashboards when running with Docker Compose:
- **Grafana**: http://localhost:3002 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Bull Board** (Queue monitoring): http://localhost:3001/admin/queues

**For detailed information** on metrics, tracing, custom instrumentation, and dashboard creation, see [OBSERVABILITY.md](OBSERVABILITY.md).
