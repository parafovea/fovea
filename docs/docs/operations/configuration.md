# Configuration

Every Fovea service reads its environment through a single typed
configuration module, validated once at startup. This is the one place
each service answers the question "what does this deployment do when a
variable is unset?", so an operator never has to trace a setting through
scattered reads.

## Where configuration lives

| Service | Config module | Reads from |
| --- | --- | --- |
| Backend | `server/src/config.ts` | `process.env` (optionally a local `.env`) |
| Frontend | `annotation-tool/src/config.ts` | `import.meta.env` (build-time) |
| Model service | `model-service/src/infrastructure/config/settings.py` | `os.environ` (optionally a local `.env`) |

Each module is the **only** file in its service permitted to read the
environment. The backend and frontend enforce this with an ESLint rule,
and the model service with a guard test. New configuration must be added
to the module, not read inline somewhere else.

The committed template `.env.example` is the canonical list of supported
variables. A CI check (`pnpm check:env`) fails the build if `.env.example`
contains a duplicate key or omits any key the backend config module reads,
so the template can never silently drift from the code.

## Fail-fast startup

Each service validates its configuration once, at process start, and
refuses to boot on a fatal problem rather than failing later in a handler:

- The backend imports `config.ts` first (before tracing), validates the
  numeric variables, requires `API_KEY_ENCRYPTION_KEY` to decode to 32
  bytes, and refuses an unset or default `SESSION_SECRET` in production.
- The model service instantiates its `Settings` at the top of the FastAPI
  lifespan.

A misconfigured deployment therefore stops immediately with a clear error.

## Deployment mode

Two variables decide the high-level posture of a backend deployment:

- `FOVEA_MODE` selects the authentication model: `multi-user` (login and
  sessions, the secure default) or `single-user` (auto-login, no
  passwords, for local development).
- `FOVEA_DEMO_MODE` enables the demo layer (a seeded corpus and tour
  endpoints). With `FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH` it also permits
  anonymous, no-login sessions for a public booth.

The backend resolves these into one `config.deploymentMode` object with a
typed `auth` (`single-user` | `multi-user`) and `demo` (`off` | `on` |
`public`), and logs a one-line summary at startup, for example:

```
[config] deployment mode: auth=multi-user demo=off
```

Check that line first when a deployment behaves unexpectedly: it reports
exactly which mode the resolved configuration produced.

The frontend mirrors this with its own `config.deploymentMode`, whose
`kind` is one of `normal`, `public-demo`, `tour-demo`, or
`legacy-demo-shell`, derived from the `VITE_DEMO_PUBLIC`, `VITE_TOUR_DEMO`,
and `VITE_FOVEA_DEMO_MODE` build flags.

## Reference

See `.env.example` for the full, commented list of variables with their
defaults. Storage, S3, CDN, Wikidata, external-link, and demo options are
shipped commented-out because they are optional; uncomment and set them
for deployments that need them. Host-port mappings live in the
`Port Configuration` section at the end of the file.
