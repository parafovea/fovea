# Environment variables

The set read by the backend (`server/.env.example`) and the model
service. Required variables have no safe default; recommended
variables have defaults but should be overridden in production.

## Database and queues

```text
DATABASE_URL              required   -                              postgres URL
REDIS_HOST                no         redis (compose)                BullMQ host
REDIS_PORT                no         6379                           BullMQ port
```

## Server

```text
NODE_ENV                  no         development                    development | production
PORT                      no         3001                           backend HTTP port
LOG_LEVEL                 no         info                           Pino log level
ALLOWED_ORIGINS           no         http://localhost:5173          CORS origins
```

## Authentication

```text
FOVEA_MODE                recommended multi-user                    multi-user | single-user
ALLOW_REGISTRATION        no         false                          enable POST /api/auth/register
SESSION_SECRET            required   -                              cookie signing (min 32 chars)
SESSION_TIMEOUT_DAYS      no         7                              session expiration window
ADMIN_PASSWORD            required   -                              seeded admin password
TEST_USER_PASSWORD        no         test123                        seeded test user password
```

## API key encryption

```text
API_KEY_ENCRYPTION_KEY    required   -                              32-byte hex string for AES-256-GCM
```

## Model service

```text
MODEL_SERVICE_URL         no         http://model-service:8000      backend -> model-service base
```

### Per-call timeouts

Every `MODEL_SERVICE_TIMEOUTS.<KIND>` ceiling on the backend is
overridable via a matching `MODEL_SERVICE_TIMEOUT_<KIND>_MS` env var.
A value that is not a positive integer is ignored and the built-in
default applies. Defaults are the prior hardcoded values so existing
deployments do not change behavior.

```text
MODEL_SERVICE_TIMEOUT_DETECTION_MS         no   60000      detection ceiling
MODEL_SERVICE_TIMEOUT_THUMBNAILS_MS        no   30000      thumbnail ceiling
MODEL_SERVICE_TIMEOUT_ONTOLOGY_AUGMENT_MS  no   60000      ontology augment ceiling
MODEL_SERVICE_TIMEOUT_SUMMARIZE_MS         no   300000     summary ceiling
MODEL_SERVICE_TIMEOUT_EXTRACT_CLAIMS_MS    no   300000     claim extract ceiling
MODEL_SERVICE_TIMEOUT_SYNTHESIZE_MS        no   300000     claim synthesis ceiling
MODEL_SERVICE_TIMEOUT_TRANSCRIBE_MS        no   300000     transcribe / diarize ceiling
```

CPU-first-load deployments will typically raise the
detection, thumbnail, and ontology-augment ceilings; the
`docker-compose.e2e.real-models.yml` override is the canonical example.

## Hugging Face credentials

```text
HF_TOKEN                  if gated   -                              read token for pyannote (speaker diarization)
                                                                     and any other gated model in models.yaml
```

The pyannote 3.1 model used by `POST /api/diarize` requires the user
to accept the model license on huggingface.co and pass a read token
to the model-service container. See
[Guide > Transcribe and diarize](../guide/transcribe-and-diarize.md).

## Telemetry

```text
OTEL_EXPORTER_OTLP_ENDPOINT no       http://otel-collector:4318     OTLP HTTP endpoint
OTEL_SERVICE_NAME           no       fovea-backend                  service.name attribute
```

## Video storage

```text
VIDEO_STORAGE_TYPE        no         local                          local | s3 | hybrid
STORAGE_PATH              no         /videos                        local file root
VIDEO_BASE_URL            no         /api/videos                    public URL prefix
S3_BUCKET                 if s3      -                              bucket name
S3_REGION                 if s3      -                              AWS region
S3_ACCESS_KEY_ID          if s3      -                              access key
S3_SECRET_ACCESS_KEY      if s3      -                              secret key
S3_ENDPOINT               no         -                              S3-compatible endpoint
S3_PUBLIC_BUCKET          no         false                          if true, do not sign URLs
AWS_ACCESS_KEY_ID         no         -                              fallback for boto3
AWS_SECRET_ACCESS_KEY     no         -                              fallback for boto3
```

## CDN

```text
CDN_ENABLED               no         false                          rewrite video URLs through CDN
CDN_BASE_URL              if enabled -                              CDN origin
CDN_SIGNED_URLS           no         true                           sign CDN URLs
```

## Thumbnails

```text
THUMBNAIL_STORAGE_TYPE    no         local                          local | s3
THUMBNAIL_PATH            no         /videos/thumbnails             local thumbnail root
THUMBNAIL_S3_PREFIX       no         thumbnails/                    S3 key prefix
THUMBNAIL_OUTPUT_ROOT     no         /tmp/thumbnails                model-service thumbnail output
```

## Wikidata

```text
WIKIDATA_MODE             no         online                         online | offline
WIKIDATA_URL              no         https://www.wikidata.org/w/api.php  endpoint
WIKIBASE_ID_MAPPING_PATH  no         -                              offline-mode id mapping JSON
```

## External link gating

```text
ALLOW_EXTERNAL_LINKS                no   true   master switch
ALLOW_EXTERNAL_WIKIDATA_LINKS       no   true   offline mode only
ALLOW_EXTERNAL_VIDEO_SOURCE_LINKS   no   true   uploaderUrl, webpageUrl
```

## Model service vendor keys

These are read by the model-service container. They serve as the
last-resort fallback after the requester's user-level key and the
admin shared-pool key.

```text
ANTHROPIC_API_KEY         no         -                              Claude family
OPENAI_API_KEY            no         -                              GPT family
GOOGLE_API_KEY            no         -                              Gemini family
```

Other vendor keys (AssemblyAI, Deepgram, Gladia, Rev.ai, Azure
Speech, Google Speech, AWS Transcribe) are stored in the
`ApiKey` table; see [Guide > API keys](../guide/api-keys.md).

## Model service build

```text
DEVICE                    no         cpu                            cpu | gpu (build arg, selects base image
                                                                     and the active-models.yaml symlink)
MODEL_BUILD_MODE          no         minimal (cpu) / full (gpu)     ungated-only vs full set (build arg)
PRELOAD_MODELS            no         false                          pre-download default models at build (build arg);
                                                                     reads HF token from /run/secrets/hf_token
MODEL_CONFIG_PATH         no         /app/config/active-models.yaml symlink resolves to models.yaml or models-cpu.yaml
TRANSFORMERS_CACHE        no         /models                        Hugging Face cache root
```

## Model service admin

```text
MODEL_SERVICE_ADMIN_TOKEN no         -                              token gating the model-service
                                                                     /api/admin/reconfigure endpoint
                                                                     used by the SystemConfigPanel
```

## Frontend build flags

These are Vite build args read at bundle time, not runtime env. They
are passed through `docker-compose.yml` to the `frontend` service.

```text
VITE_TOUR_DEMO            no   ""    when "1", installs the MSW tour-mock worker so the
                                     six model-service routes resolve from the
                                     TourContentBundle instead of forwarding to a model
                                     service. See Guide > Tour demo mode.
VITE_DEMO_PUBLIC          no   ""    when "1", mounts the public TourCatalogPage at /
                                     and moves the authenticated app under /app. Used
                                     by demo.fovea.video.
VITE_FOVEA_DEMO_MODE      no   ""    legacy landing-page flag; superseded by
                                     VITE_TOUR_DEMO / VITE_DEMO_PUBLIC but still
                                     respected by the local run-demo-local.sh script.
```

Builds without `VITE_TOUR_DEMO` tree-shake the entire
`src/mocks/tourDemo/` subtree out of the bundle.
