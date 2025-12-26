---
title: Environment Variables
sidebar_position: 2
keywords: [environment variables, configuration, env, settings, docker]
---

# Environment Variables

Complete reference for environment variables used across FOVEA services.

## Environment Variables by Service

### Backend Service

#### Core Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Node environment (development, production) |
| `PORT` | `3001` | Backend server port |
| `DATABASE_URL` | `postgresql://fovea:fovea@postgres:5432/fovea` | PostgreSQL connection string |
| `REDIS_URL` | `redis://redis:6379` | Redis connection string |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origins |
| `MODEL_SERVICE_URL` | `http://model-service:8000` | Model service endpoint |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://otel-collector:4318` | OpenTelemetry endpoint |
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |

#### Authentication & User Management

| Variable | Default | Description |
|----------|---------|-------------|
| `FOVEA_MODE` | `single-user` | Authentication mode: `single-user` (no login) or `multi-user` (session-based auth) |
| `ALLOW_REGISTRATION` | `false` | Allow user self-registration (multi-user mode only) |
| `SESSION_SECRET` | (required) | Secret for session cookie signing (min 32 characters, required in multi-user mode) |
| `SESSION_TIMEOUT_DAYS` | `7` | Session expiration in days |
| `ADMIN_PASSWORD` | (required) | Admin user password for database seeding (required in multi-user mode) |
| `API_KEY_ENCRYPTION_KEY` | (required) | 32-byte hex key for API key encryption at rest |

#### Wikidata/Wikibase Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WIKIDATA_MODE` | `online` | `online` for public Wikidata API, `offline` for local Wikibase |
| `WIKIDATA_URL` | `https://www.wikidata.org/w/api.php` | Wikidata/Wikibase API endpoint |
| `WIKIBASE_ID_MAPPING_PATH` | `/wikibase/id-mapping.json` | Path to ID mapping file (offline mode only) |

#### External Links Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOW_EXTERNAL_LINKS` | `true` | Master switch for all external links |
| `ALLOW_EXTERNAL_WIKIDATA_LINKS` | (mode-dependent) | Control Wikidata entity page links. Always `true` in online mode. |
| `ALLOW_EXTERNAL_VIDEO_SOURCE_LINKS` | (master switch) | Control video source links (uploaderUrl, webpageUrl) |

See [Local Wikibase documentation](../wikibase/overview.md) for detailed configuration.

**Example** (in docker-compose.yml):
```yaml
backend:
  environment:
    NODE_ENV: production
    PORT: 3001
    DATABASE_URL: postgresql://fovea:${DB_PASSWORD}@postgres:5432/fovea
    FOVEA_MODE: multi-user
    ALLOW_REGISTRATION: false
    SESSION_SECRET: ${SESSION_SECRET}
    ADMIN_PASSWORD: ${ADMIN_PASSWORD}
    SESSION_TIMEOUT_DAYS: 7
    API_KEY_ENCRYPTION_KEY: ${API_KEY_ENCRYPTION_KEY}
```

### Frontend Service

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:3001` | Backend API URL |
| `VITE_VIDEO_BASE_URL` | `http://localhost:3001/videos` | Video file base URL |

**Example** (in docker-compose.yml):
```yaml
frontend:
  environment:
    VITE_API_URL: http://localhost:3001
    VITE_VIDEO_BASE_URL: http://localhost:3001/videos
```

### Model Service

#### Core Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DEVICE` | `cpu` | Inference device (cpu, cuda). Use `--profile gpu` instead. |
| `MODEL_BUILD_MODE` | `minimal` | Feature set: `minimal`, `recommended`, or `full` |
| `MODEL_CONFIG_PATH` | `/app/config/models.yaml` | Model configuration file |
| `PYTORCH_CUDA_ALLOC_CONF` | `max_split_size_mb:512` | PyTorch CUDA memory config |
| `CUDA_VISIBLE_DEVICES` | (all) | GPU indices when using `--profile gpu` (e.g., "0,1,2,3") |
| `REDIS_URL` | `redis://redis:6379` | Redis connection string |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://otel-collector:4318` | OpenTelemetry endpoint |

#### External VLM/LLM API Keys

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Optional | Anthropic Claude API key (get from console.anthropic.com/settings/keys) |
| `OPENAI_API_KEY` | Optional | OpenAI API key (get from [platform.openai.com](https://platform.openai.com/api-keys)) |
| `GOOGLE_API_KEY` | Optional | Google AI API key (get from [aistudio.google.com](https://aistudio.google.com/app/apikey)) |

**Note**: API keys can also be configured via the frontend UI (user-level) or admin panel (system-level). Environment variables serve as fallback.

#### External Audio API Keys

| Variable | Required | Description |
|----------|----------|-------------|
| `ASSEMBLYAI_API_KEY` | Optional | AssemblyAI API key (Universal-2 model) |
| `DEEPGRAM_API_KEY` | Optional | Deepgram API key (Nova-3 model) |
| `AZURE_SPEECH_KEY` | Optional | Azure Speech Services key |
| `AZURE_SPEECH_REGION` | Optional | Azure Speech Services region (e.g., "eastus") |
| `AWS_ACCESS_KEY_ID` | Optional | AWS access key for Transcribe |
| `AWS_SECRET_ACCESS_KEY` | Optional | AWS secret key for Transcribe |
| `AWS_REGION` | Optional | AWS region (e.g., "us-east-1") |
| `REVAI_API_KEY` | Optional | Rev.ai API key |
| `GLADIA_API_KEY` | Optional | Gladia API key |

**Example** (in docker-compose.yml):
```yaml
model-service:
  environment:
    MODEL_BUILD_MODE: recommended
    PYTORCH_CUDA_ALLOC_CONF: max_split_size_mb:512
    ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    OPENAI_API_KEY: ${OPENAI_API_KEY}
    GOOGLE_API_KEY: ${GOOGLE_API_KEY}
    ASSEMBLYAI_API_KEY: ${ASSEMBLYAI_API_KEY}
    DEEPGRAM_API_KEY: ${DEEPGRAM_API_KEY}
```

### PostgreSQL

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | `fovea` | Database user |
| `POSTGRES_PASSWORD` | `fovea` | Database password |
| `POSTGRES_DB` | `fovea` | Database name |

**Example** (in docker-compose.yml):
```yaml
postgres:
  environment:
    POSTGRES_USER: fovea
    POSTGRES_PASSWORD: fovea
    POSTGRES_DB: fovea
```

### Grafana

| Variable | Default | Description |
|----------|---------|-------------|
| `GF_SECURITY_ADMIN_USER` | `admin` | Grafana admin username |
| `GF_SECURITY_ADMIN_PASSWORD` | `admin` | Grafana admin password |
| `GF_AUTH_ANONYMOUS_ENABLED` | `true` | Allow anonymous access |

**Example** (in docker-compose.yml):
```yaml
grafana:
  environment:
    GF_SECURITY_ADMIN_USER: admin
    GF_SECURITY_ADMIN_PASSWORD: secure_password
```

## Configuration Files

### Backend Configuration

Environment variables can be set in `server/.env`:

```env
# Core Configuration
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://fovea:fovea@localhost:5432/fovea
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=http://localhost:5173
MODEL_SERVICE_URL=http://localhost:8000
LOG_LEVEL=info

# Authentication & User Management
FOVEA_MODE=multi-user
ALLOW_REGISTRATION=false
SESSION_SECRET=your-secret-key-here-min-32-chars
ADMIN_PASSWORD=your-secure-password-here
SESSION_TIMEOUT_DAYS=7
API_KEY_ENCRYPTION_KEY=your-32-byte-hex-key-here
```

### Frontend Configuration

Environment variables can be set in `annotation-tool/.env`:

```env
VITE_API_URL=http://localhost:3001
VITE_VIDEO_BASE_URL=http://localhost:3001/videos
```

### Model Service Configuration

Environment variables can be set in `model-service/.env`:

```env
# Core Configuration
MODEL_BUILD_MODE=minimal
MODEL_CONFIG_PATH=/app/config/models.yaml
PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512
REDIS_URL=redis://localhost:6379

# External VLM/LLM API Keys (Optional)
ANTHROPIC_API_KEY=sk-ant-your-key-here
OPENAI_API_KEY=sk-your-key-here
GOOGLE_API_KEY=your-key-here

# External Audio API Keys (Optional)
ASSEMBLYAI_API_KEY=your-key-here
DEEPGRAM_API_KEY=your-key-here
AZURE_SPEECH_KEY=your-key-here
AZURE_SPEECH_REGION=eastus
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
REVAI_API_KEY=your-key-here
GLADIA_API_KEY=your-key-here
```

## Common Configuration Scenarios

### Development (Local without Docker)

**Backend** (`server/.env`):
```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://fovea:fovea@localhost:5432/fovea
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=http://localhost:5173
MODEL_SERVICE_URL=http://localhost:8000
FOVEA_MODE=single-user
SESSION_SECRET=dev-secret-key-min-32-chars-here
API_KEY_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

**Model Service** (`model-service/.env`):
```env
MODEL_BUILD_MODE=minimal
MODEL_CONFIG_PATH=/app/config/models.yaml
REDIS_URL=redis://localhost:6379
# Optional: Add external API keys here
```

**Frontend** (`annotation-tool/.env`):
```env
VITE_API_URL=http://localhost:3001
VITE_VIDEO_BASE_URL=http://localhost:3001/videos
```

### Production (Docker Compose)

**Backend**:
```yaml
backend:
  environment:
    NODE_ENV: production
    PORT: 3001
    DATABASE_URL: postgresql://fovea:${DB_PASSWORD}@postgres:5432/fovea
    REDIS_URL: redis://redis:6379
    CORS_ORIGIN: https://fovea.example.com
```

**Frontend**:
```yaml
frontend:
  environment:
    VITE_API_URL: https://api.fovea.example.com
    VITE_VIDEO_BASE_URL: https://api.fovea.example.com/videos
```

### GPU Mode

Use the `--profile gpu` flag instead of environment variables:

```bash
docker compose --profile gpu up
```

**Model Service** (optional GPU configuration):
```yaml
model-service:
  environment:
    MODEL_BUILD_MODE: recommended
    PYTORCH_CUDA_ALLOC_CONF: max_split_size_mb:512
    CUDA_VISIBLE_DEVICES: "0,1"  # Use first 2 GPUs
```

### Multi-User Mode with External APIs

**Backend**:
```yaml
backend:
  environment:
    FOVEA_MODE: multi-user
    ALLOW_REGISTRATION: false
    SESSION_SECRET: ${SESSION_SECRET}
    ADMIN_PASSWORD: ${ADMIN_PASSWORD}
    SESSION_TIMEOUT_DAYS: 7
    API_KEY_ENCRYPTION_KEY: ${API_KEY_ENCRYPTION_KEY}
```

**Model Service** (fallback keys):
```yaml
model-service:
  environment:
    ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    OPENAI_API_KEY: ${OPENAI_API_KEY}
    ASSEMBLYAI_API_KEY: ${ASSEMBLYAI_API_KEY}
    DEEPGRAM_API_KEY: ${DEEPGRAM_API_KEY}
```

Users can override these with their own keys via Settings > API Keys.

## Security Considerations

### Database Credentials

**Development**: Default credentials (`fovea:fovea`) are acceptable.

**Production**: Use strong passwords and environment variable substitution:
```yaml
postgres:
  environment:
    POSTGRES_USER: ${DB_USER}
    POSTGRES_PASSWORD: ${DB_PASSWORD}
    POSTGRES_DB: fovea
```

Set in `.env` file (not committed to git):
```env
DB_USER=fovea_prod
DB_PASSWORD=strong_random_password_here
```

### Authentication Secrets

**Cookie Secret**: Generate a random 32+ character string:
```bash
openssl rand -base64 32
```

**API Key Encryption Key**: Generate a 32-byte hex key:
```bash
openssl rand -hex 32
```

Set in `.env` file:
```env
SESSION_SECRET=your-generated-secret-here
ADMIN_PASSWORD=your-generated-password-here
API_KEY_ENCRYPTION_KEY=your-generated-hex-key-here
```

### External API Keys

External API keys can be configured in three ways (priority order):

1. **User-level keys**: Settings > API Keys (user-scoped)
2. **System-level keys**: Admin Panel > API Keys (admin-only, fallback for all users)
3. **Environment variables**: model-service/.env (ultimate fallback)

For production, use environment variables as fallback and allow users to configure their own keys via UI.

### Grafana Credentials

Change default admin password in production:
```yaml
grafana:
  environment:
    GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
```

### CORS Configuration

Restrict CORS in production:
```yaml
backend:
  environment:
    CORS_ORIGIN: https://fovea.example.com
```

## Troubleshooting

### Database Connection Fails

**Problem**: Backend cannot connect to PostgreSQL.

**Check**:
- Verify `DATABASE_URL` is correct
- Ensure PostgreSQL container is running: `docker compose ps postgres`
- Check PostgreSQL logs: `docker compose logs postgres`

### Model Service Not Found

**Problem**: Backend cannot reach model service.

**Check**:
- Verify `MODEL_SERVICE_URL` points to correct container: `http://model-service:8000`
- Ensure model service is running: `docker compose ps model-service`
- Check network connectivity: `docker compose exec backend ping model-service`

### Frontend Cannot Reach Backend

**Problem**: Frontend shows API connection errors.

**Check**:
- Verify `VITE_API_URL` matches backend URL
- Check CORS settings in backend `CORS_ORIGIN`
- Inspect browser console for CORS errors

### GPU Not Available

**Problem**: Model service cannot access GPU despite `DEVICE=cuda`.

**Check**:
- Verify NVIDIA driver installed: `nvidia-smi`
- Ensure nvidia-docker2 installed
- Check Docker can access GPU: `docker run --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi`

## Next Steps

- Review [Configuration Guide](../deployment/configuration.md) for detailed setup
- Explore [Service Ports](./service-ports.md) for network configuration
- Read [Docker Profiles](../concepts/docker-profiles.md) for deployment modes
