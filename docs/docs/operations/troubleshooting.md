---
sidebar_label: Troubleshooting
---

# Troubleshooting

Failure modes operators have actually hit, grouped by the
symptom the user reports.

## "I get a MODEL_SERVICE_TIMEOUT toast"

The backend gives every model service call a per-kind HTTP
deadline configured under `MODEL_SERVICE_TIMEOUTS` in
`server/src/lib/fetchModelService.ts`. If the model service
takes longer than that, the backend aborts the request and
returns 504. The toast in the frontend reads
"MODEL_SERVICE_TIMEOUT" or similar.

Every kind has a matching `MODEL_SERVICE_TIMEOUT_<KIND>_MS`
environment variable that overrides the default. The defaults
are tuned for GPU deployments. On CPU-only hardware, raise the
ceilings; the `docker-compose.e2e.real-models.yml` overlay has
working CPU values to copy from.

Common ones to raise on CPU:

| Variable                                  | GPU default | CPU first-load suggestion |
| ----------------------------------------- | ----------- | ------------------------- |
| `MODEL_SERVICE_TIMEOUT_DETECTION_MS`      | 60000       | 600000                    |
| `MODEL_SERVICE_TIMEOUT_THUMBNAILS_MS`     | 30000       | 600000                    |
| `MODEL_SERVICE_TIMEOUT_ONTOLOGY_AUGMENT_MS`| 60000      | 600000                    |
| `MODEL_SERVICE_TIMEOUT_SUMMARIZE_MS`      | 300000      | 1800000                   |
| `MODEL_SERVICE_TIMEOUT_EXTRACT_CLAIMS_MS` | 300000      | 1800000                   |

If raising the ceiling does not fix it, the model service is
genuinely stuck. Check its logs (`docker compose logs -f
model-service`) for a hung load or for a model that needs an
`HF_TOKEN` to download.

## "Model service won't start"

Most failures here are config errors that the YAML loader
catches loudly. The exception message names the offending
entry. The two recurring ones:

- `architecture` block missing from a `models.yaml` entry. Every
  task option must declare an architecture; see
  [Reference / Model config](../reference/model-config.md) for
  the schema and
  [Reference / Model loaders](../reference/model-loaders.md) for
  the architecture catalog.
- `framework` set to something the registry does not recognize.
  The supported framework strings are listed in the model
  loader reference.

On CPU stacks, also check that `MODEL_CONFIG_PATH` is pointing
at `models-cpu.yaml`, not the default `models.yaml`. The default
selects GPU-required models that crash on first load on a CPU
host.

## "Login works but the page is blank after"

The frontend container served the React build, the user got a
JWT, but the SPA shell cannot reach `/api`. Almost always the
reverse proxy is not forwarding `/api/*` to the backend. The
nginx config inside the frontend container handles `/api/*`
internally when the frontend and backend are in the same
compose network; in deployments that route the frontend through
an external proxy, that proxy needs an explicit `/api/*`
location pointing at the backend container.

## "Detection returns zero boxes"

Three causes, in decreasing order of likelihood:

1. The query string did not match anything. Open-vocabulary
   detection is sensitive to phrasing; try "person walking"
   instead of "pedestrian", "vehicle" instead of "car".
2. The selected model is text-only (e.g. a misconfigured
   ontology-augment model landed in the detection slot). Check
   `tasks.object_detection.selected` in `models.yaml`.
3. The confidence threshold is too high. The default 0.3 is
   reasonable for YOLO-World; raise this only for models known
   to be over-confident.

## "Summarization output is garbled or is the literal string '\<coroutine object ...\>'"

The selected VLM loader returned an unawaited coroutine. The
fix is in the loader code, not in operator config; upgrade to
the patch release that fixed it. The symptom is unambiguous in
the user's summary output and in the backend logs.

## "Tour demo mode loads the catalog but tours don't run"

The MSW worker did not register, almost always because the
deploy is missing `mockServiceWorker.js` at the site root.
Check the frontend container's `/usr/share/nginx/html/`
for the file; the build step is supposed to copy it. If it is
absent, the build was done without `VITE_TOUR_DEMO=1`. Rebuild
with the flag set.

## "Postgres connection refused after a restart"

Postgres takes longer to come up than the backend's
connection-retry budget by default. The base `docker-compose.yml`
already ships the postgres healthcheck (`pg_isready -U fovea`)
and the backend's `depends_on: postgres: condition:
service_healthy`, so the symptom usually means a customized
compose has dropped one of those blocks. Verify both are still
present in the effective compose: a common cause is an
operator-supplied override that re-declares the postgres service
without the healthcheck, or a backend override that replaces
`depends_on` with the plain list form (which discards the
condition).

## "Admin UI shows an empty SystemConfig panel"

The admin RBAC permission for system-config visibility is
missing from the user's role. Either grant it through the
admin role editor, or re-run
`docker compose exec backend npm run seed` if the upgrade step
was skipped (the seed script runs the permissions seeder; see
[Upgrades](upgrades.md)).

## Where to look first

For any failure that does not match a symptom above:

```bash
docker compose logs -f --tail=200 backend
docker compose logs -f --tail=200 model-service
docker compose ps
curl -s http://localhost:3001/api/health
```

The first two surface the loud-fail messages the application
emits on bad config. The third confirms which containers are
even running. The fourth confirms the backend can reach
Postgres and Redis.
