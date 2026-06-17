/**
 * Single source of truth for every environment-derived setting.
 *
 * This is the ONLY file in `server/src` permitted to read `process.env`.
 * An ESLint `no-restricted-syntax` rule bans `process.env` everywhere
 * else and points offenders here. Every default, every type coercion,
 * and every required-value check lives in this module so a reader can
 * answer "what does this deployment do when X is unset?" by looking in
 * exactly one place.
 *
 * Shape:
 *   - `config` is a deep-frozen object grouped into nested namespaces by
 *     concern (server, db, redis, auth, storage, modelService, ...).
 *   - Leaf values are exposed as lazy getters or typed helper functions
 *     that re-read `process.env` at access time. This preserves the exact
 *     lazy `process.env.X || default` semantics the codebase relied on
 *     before centralization, so a handler that reads `config.mode.current`
 *     inside a request sees the same value the old inline read saw.
 *   - Coercions (integers, booleans, comma-split lists) are validated
 *     against a TypeBox schema and the raw env is validated eagerly at
 *     module load so an invalid integer fails fast at startup rather than
 *     surfacing as a `NaN` deep in a handler.
 *
 * Fail-fast: importing this module runs `assertStartupConfig()`, which
 * validates the typed env surface and the required
 * `API_KEY_ENCRYPTION_KEY`, and (in production) refuses an unset or
 * dev-default `SESSION_SECRET`. Import this module FIRST in `index.ts`,
 * before `./tracing.js`, so validation throws before any subsystem
 * (OTEL, Fastify, Prisma) initializes.
 *
 * Default unifications applied here (the only intentional behavior
 * change versus the pre-centralization code; every real docker/prod
 * deployment sets these via env, so the default only fires in local
 * dev where the localhost form is correct):
 *   1. STORAGE_PATH default resolves to `<repo>/videos` (the index.ts
 *      computed form), replacing the inconsistent `/videos` literals in
 *      videoStorage.ts and routes/videos/index.ts.
 *   2. FOVEA_MODE default is `multi-user` (the secure default used by 8
 *      of 10 sites), replacing the `single-user` default in
 *      routes/config.ts and routes/auth.ts.
 *   3. MODEL_SERVICE_URL default is `http://localhost:8000` (7 sites),
 *      replacing the `http://model-service:8000` default in
 *      routes/models.ts and services/system-config-propagator.ts.
 *   4. OTEL_EXPORTER_OTLP_ENDPOINT default is `http://localhost:4318`
 *      (tracing.ts), replacing the `http://otel-collector:4318` default
 *      in routes/telemetry.ts.
 *
 * @module
 */

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { Type, type Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import dotenv from 'dotenv'

// Optional local `.env` support. A no-op in docker/prod where no `.env`
// file exists. Must run before any `process.env` read below.
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ---------------------------------------------------------------------------
// Low-level coercion helpers (the only place env strings are parsed).
// ---------------------------------------------------------------------------

function readString(name: string): string | undefined {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return undefined
  return raw
}

function readStringWithDefault(name: string, fallback: string): string {
  return readString(name) ?? fallback
}

function readInt(name: string, fallback: number): number {
  const raw = readString(name)
  if (raw === undefined) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** True only when the env var equals the literal string `'true'`. */
function readBooleanStrictTrue(name: string): boolean {
  return process.env[name] === 'true'
}

/** True when the env var is `'true'` or `'1'` (the demo-flag idiom). */
function readBooleanTrueOrOne(name: string): boolean {
  const raw = process.env[name]
  return raw === 'true' || raw === '1'
}

/** True unless the env var is explicitly `'false'` (default-on switch). */
function readBooleanDefaultTrue(name: string): boolean {
  return process.env[name] !== 'false'
}

// ---------------------------------------------------------------------------
// Default constants. Centralized so every consumer shares one literal.
// ---------------------------------------------------------------------------

const DEFAULT_STORAGE_PATH = join(dirname(__dirname), '..', 'videos')
const DEFAULT_MODE = 'multi-user'
const DEFAULT_MODEL_SERVICE_URL = 'http://localhost:8000'
const DEFAULT_OTEL_ENDPOINT = 'http://localhost:4318'
const DEV_SESSION_SECRET = 'dev-secret-change-in-production'

/** The four localhost origins allowed by default when ALLOWED_ORIGINS is
 * unset. Copied verbatim from the historical inline default. Includes both
 * `localhost` and `127.0.0.1` because some browsers treat them as distinct
 * origins. */
const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
] as const

const ENCRYPTION_KEY_BYTES = 32

/** Per-endpoint model-service timeout defaults (milliseconds). Each value
 * is the upper bound the backend waits before aborting a forwarded request
 * to the model-service and surfacing a 504. Defaults target a GPU-warm
 * production deployment; CPU-cold first-load is materially slower, so
 * deployments override via the matching `MODEL_SERVICE_TIMEOUT_<NAME>_MS`
 * env var. */
const MODEL_SERVICE_TIMEOUT_DEFAULTS = {
  detection: { env: 'MODEL_SERVICE_TIMEOUT_DETECTION_MS', ms: 60_000 },
  thumbnails: { env: 'MODEL_SERVICE_TIMEOUT_THUMBNAILS_MS', ms: 30_000 },
  ontologyAugment: { env: 'MODEL_SERVICE_TIMEOUT_ONTOLOGY_AUGMENT_MS', ms: 60_000 },
  summarize: { env: 'MODEL_SERVICE_TIMEOUT_SUMMARIZE_MS', ms: 300_000 },
  extractClaims: { env: 'MODEL_SERVICE_TIMEOUT_EXTRACT_CLAIMS_MS', ms: 300_000 },
  synthesize: { env: 'MODEL_SERVICE_TIMEOUT_SYNTHESIZE_MS', ms: 300_000 },
  transcribe: { env: 'MODEL_SERVICE_TIMEOUT_TRANSCRIBE_MS', ms: 300_000 },
} as const

/** Names of the per-endpoint model-service timeouts. */
export type ModelServiceTimeoutEndpoint = keyof typeof MODEL_SERVICE_TIMEOUT_DEFAULTS

// ---------------------------------------------------------------------------
// Eagerly-validated typed env surface (fail-fast on malformed coercions).
// ---------------------------------------------------------------------------

/** Schema for the env vars whose coercion can fail (integers). Validated
 * once at startup so a non-numeric `PORT` or `REDIS_PORT` throws a clear
 * error rather than yielding a `NaN` later. Strings that fall back to a
 * default when unset do not need schema validation. */
const NumericEnvSchema = Type.Object({
  PORT: Type.Optional(Type.String({ pattern: '^[0-9]+$' })),
  REDIS_PORT: Type.Optional(Type.String({ pattern: '^[0-9]+$' })),
  SESSION_TIMEOUT_DAYS: Type.Optional(Type.String({ pattern: '^[0-9]+$' })),
  SESSION_IDLE_TIMEOUT_MINUTES: Type.Optional(Type.String({ pattern: '^[0-9]+$' })),
  RATE_LIMIT_MAX: Type.Optional(Type.String({ pattern: '^[0-9]+$' })),
})

type NumericEnv = Static<typeof NumericEnvSchema>

function collectNumericEnv(): NumericEnv {
  const out: Record<string, string> = {}
  for (const key of [
    'PORT',
    'REDIS_PORT',
    'SESSION_TIMEOUT_DAYS',
    'SESSION_IDLE_TIMEOUT_MINUTES',
    'RATE_LIMIT_MAX',
  ]) {
    const raw = process.env[key]
    if (raw !== undefined && raw !== '') out[key] = raw
  }
  return out as NumericEnv
}

/**
 * Resolve and validate the API key encryption key.
 *
 * Reads `API_KEY_ENCRYPTION_KEY`, hex-decodes it, and requires exactly 32
 * bytes (AES-256). Throws a descriptive Error when unset or wrong length.
 * Read at call time so callers always see the current env (the encryption
 * tests mutate it between cases).
 *
 * @returns the 32-byte key buffer
 * @throws {Error} when the key is unset or not 32 bytes after hex decode
 *
 * @example
 * ```typescript
 * const key = config.auth.encryptionKey()
 * crypto.createCipheriv('aes-256-gcm', key, iv)
 * ```
 */
function resolveEncryptionKey(): Buffer {
  const key = process.env.API_KEY_ENCRYPTION_KEY
  if (!key) {
    throw new Error('API_KEY_ENCRYPTION_KEY environment variable not set')
  }
  const keyBuffer = Buffer.from(key, 'hex')
  if (keyBuffer.length !== ENCRYPTION_KEY_BYTES) {
    throw new Error(
      `API_KEY_ENCRYPTION_KEY must be ${ENCRYPTION_KEY_BYTES} bytes (${ENCRYPTION_KEY_BYTES * 2} hex characters)`,
    )
  }
  return keyBuffer
}

/**
 * Validate the startup configuration, throwing on any fatal problem.
 *
 * Runs at module load. Checks performed:
 *   - numeric env vars coerce cleanly (TypeBox `Value.Errors`)
 *   - `API_KEY_ENCRYPTION_KEY` is set and hex-decodes to 32 bytes
 *   - in production, `SESSION_SECRET` is set and is not the dev default
 *
 * @throws {Error} listing every offending key when validation fails
 */
function assertStartupConfig(): void {
  const numericEnv = collectNumericEnv()
  if (!Value.Check(NumericEnvSchema, numericEnv)) {
    const problems = [...Value.Errors(NumericEnvSchema, numericEnv)].map(
      (e) => `${e.path.replace(/^\//, '')}: ${e.message}`,
    )
    throw new Error(
      `Invalid environment configuration:\n  ${problems.join('\n  ')}`,
    )
  }

  // Required: API key encryption key (fail fast before any subsystem boots).
  resolveEncryptionKey()

  // Production guard: refuse an unset or dev-default session secret.
  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.SESSION_SECRET
    if (!secret || secret === DEV_SESSION_SECRET) {
      throw new Error(
        'SESSION_SECRET must be set to a non-default value in production',
      )
    }
  }
}

// ---------------------------------------------------------------------------
// The frozen config object. Leaf values are getters/functions that re-read
// env so runtime mutation (tests, hot-reconfigured deployments) is honored.
// ---------------------------------------------------------------------------

/** Coerce a model-service timeout env var to a positive integer, falling
 * back to the endpoint default when unset or malformed. */
function resolveTimeoutMs(endpoint: ModelServiceTimeoutEndpoint): number {
  const { env, ms } = MODEL_SERVICE_TIMEOUT_DEFAULTS[endpoint]
  const raw = readString(env)
  if (raw === undefined) return ms
  const parsed = Number.parseInt(raw, 10)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return ms
}

const config = Object.freeze({
  server: Object.freeze({
    get port(): number {
      return readInt('PORT', 3001)
    },
    get nodeEnv(): string {
      return readStringWithDefault('NODE_ENV', 'development')
    },
    get isProduction(): boolean {
      return process.env.NODE_ENV === 'production'
    },
    get isTest(): boolean {
      return process.env.NODE_ENV === 'test'
    },
    get isDevelopment(): boolean {
      return readStringWithDefault('NODE_ENV', 'development') === 'development'
    },
    get logLevel(): string {
      return readStringWithDefault('LOG_LEVEL', 'info')
    },
  }),

  redis: Object.freeze({
    get host(): string {
      return readStringWithDefault('REDIS_HOST', 'localhost')
    },
    get port(): number {
      return readInt('REDIS_PORT', 6379)
    },
  }),

  auth: Object.freeze({
    /** Cookie-signing secret. Insecure dev default; production requires an
     * override (enforced by `assertStartupConfig`). */
    get sessionSecret(): string {
      return readStringWithDefault('SESSION_SECRET', DEV_SESSION_SECRET)
    },
    get sessionTimeoutDays(): number {
      return readInt('SESSION_TIMEOUT_DAYS', 7)
    },
    get sessionIdleTimeoutMinutes(): number {
      return readInt('SESSION_IDLE_TIMEOUT_MINUTES', 60)
    },
    get allowRegistration(): boolean {
      return readBooleanStrictTrue('ALLOW_REGISTRATION')
    },
    get allowTestAdminBypass(): boolean {
      return readBooleanStrictTrue('ALLOW_TEST_ADMIN_BYPASS')
    },
    /** Validated 32-byte AES key. Throws when unset or wrong length. */
    encryptionKey(): Buffer {
      return resolveEncryptionKey()
    },
  }),

  storage: Object.freeze({
    get path(): string {
      return readStringWithDefault('STORAGE_PATH', DEFAULT_STORAGE_PATH)
    },
    get videoStorageType(): string {
      return readStringWithDefault('VIDEO_STORAGE_TYPE', 'local')
    },
    get videoBaseUrl(): string {
      return readStringWithDefault('VIDEO_BASE_URL', '/api/videos')
    },
    s3: Object.freeze({
      get bucket(): string | undefined {
        return readString('S3_BUCKET')
      },
      get region(): string | undefined {
        return readString('S3_REGION')
      },
      /** AWS-prefixed key preferred, S3-prefixed key as fallback. */
      get accessKeyId(): string | undefined {
        return readString('AWS_ACCESS_KEY_ID') ?? readString('S3_ACCESS_KEY_ID')
      },
      get secretAccessKey(): string | undefined {
        return (
          readString('AWS_SECRET_ACCESS_KEY') ?? readString('S3_SECRET_ACCESS_KEY')
        )
      },
      get endpoint(): string | undefined {
        return readString('S3_ENDPOINT')
      },
      get publicBucket(): boolean {
        return readBooleanStrictTrue('S3_PUBLIC_BUCKET')
      },
    }),
    cdn: Object.freeze({
      get enabled(): boolean {
        return readBooleanStrictTrue('CDN_ENABLED')
      },
      get baseUrl(): string {
        return readStringWithDefault('CDN_BASE_URL', '')
      },
      get signedUrls(): boolean {
        return readBooleanDefaultTrue('CDN_SIGNED_URLS')
      },
    }),
    thumbnails: Object.freeze({
      get storageType(): string {
        return readStringWithDefault('THUMBNAIL_STORAGE_TYPE', 'local')
      },
      get path(): string {
        return readStringWithDefault('THUMBNAIL_PATH', '/videos/thumbnails')
      },
      get s3Prefix(): string {
        return readStringWithDefault('THUMBNAIL_S3_PREFIX', 'thumbnails/')
      },
    }),
  }),

  modelService: Object.freeze({
    get url(): string {
      return readStringWithDefault('MODEL_SERVICE_URL', DEFAULT_MODEL_SERVICE_URL)
    },
    get adminToken(): string | undefined {
      return readString('MODEL_SERVICE_ADMIN_TOKEN')
    },
    /**
     * Per-endpoint client-side timeout in milliseconds.
     *
     * @param endpoint - which model-service call this timeout applies to
     * @returns the configured timeout, or the endpoint default when the
     *   matching `MODEL_SERVICE_TIMEOUT_<NAME>_MS` env var is unset or
     *   non-positive
     *
     * @example
     * ```typescript
     * await fetchModelService(url, { timeoutMs: config.modelService.timeoutMs('detection') })
     * ```
     */
    timeoutMs(endpoint: ModelServiceTimeoutEndpoint): number {
      return resolveTimeoutMs(endpoint)
    },
  }),

  rateLimit: Object.freeze({
    get max(): number {
      return readInt('RATE_LIMIT_MAX', 1000)
    },
    get window(): string {
      return readStringWithDefault('RATE_LIMIT_WINDOW', '1 minute')
    },
  }),

  cors: Object.freeze({
    /** Comma-split allow-list, or the four localhost defaults when unset. */
    get allowedOrigins(): string[] {
      const raw = readString('ALLOWED_ORIGINS')
      if (raw === undefined) return [...DEFAULT_ALLOWED_ORIGINS]
      return raw.split(',')
    },
  }),

  otel: Object.freeze({
    get exporterEndpoint(): string {
      return readStringWithDefault('OTEL_EXPORTER_OTLP_ENDPOINT', DEFAULT_OTEL_ENDPOINT)
    },
  }),

  mode: Object.freeze({
    /** Current FOVEA_MODE (`multi-user` default). */
    get current(): string {
      return readStringWithDefault('FOVEA_MODE', DEFAULT_MODE)
    },
    get isSingleUser(): boolean {
      return readStringWithDefault('FOVEA_MODE', DEFAULT_MODE) === 'single-user'
    },
  }),

  demo: Object.freeze({
    /** FOVEA_DEMO_MODE master flag (`'true'` or `'1'`). */
    get enabled(): boolean {
      return readBooleanTrueOrOne('FOVEA_DEMO_MODE')
    },
    get allowAnonymousAuth(): boolean {
      return readBooleanTrueOrOne('FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH')
    },
    /** Shared seeder secret; null when unset or shorter than 32 chars. */
    get seedToken(): string | null {
      const t = process.env.FOVEA_DEMO_SEED_TOKEN
      if (!t || t.length < 32) return null
      return t
    },
    get clipsManifestPath(): string | undefined {
      return readString('FOVEA_DEMO_CLIPS_MANIFEST')
    },
    get fixturesDir(): string | undefined {
      return readString('FOVEA_DEMO_FIXTURES_DIR')
    },
  }),

  tours: Object.freeze({
    get dir(): string | undefined {
      return readString('FOVEA_TOURS_DIR')
    },
  }),

  wikidata: Object.freeze({
    get mode(): string {
      return readStringWithDefault('WIKIDATA_MODE', 'online')
    },
    get url(): string {
      return readStringWithDefault('WIKIDATA_URL', 'https://www.wikidata.org/w/api.php')
    },
    get idMappingPath(): string | undefined {
      return readString('WIKIBASE_ID_MAPPING_PATH')
    },
  }),

  externalLinks: Object.freeze({
    /** Master ALLOW_EXTERNAL_LINKS switch (on unless explicitly `'false'`). */
    get master(): boolean {
      return readBooleanDefaultTrue('ALLOW_EXTERNAL_LINKS')
    },
    /**
     * Whether Wikidata links are allowed.
     *
     * Online mode always allows them. Offline mode is governed by
     * `ALLOW_EXTERNAL_WIKIDATA_LINKS`, falling back to the master switch
     * when that specific var is unset.
     *
     * @param wikidataMode - the resolved Wikidata mode (`online`/`offline`)
     * @returns true when Wikidata links should be shown
     */
    wikidata(wikidataMode: string): boolean {
      return (
        wikidataMode === 'online' ||
        readBooleanStrictTrue('ALLOW_EXTERNAL_WIKIDATA_LINKS') ||
        (readBooleanDefaultTrue('ALLOW_EXTERNAL_WIKIDATA_LINKS') &&
          readBooleanDefaultTrue('ALLOW_EXTERNAL_LINKS'))
      )
    },
    /**
     * Whether external video-source links (uploader/webpage URLs) are
     * allowed. Governed by `ALLOW_EXTERNAL_VIDEO_SOURCE_LINKS`, falling
     * back to the master switch when that specific var is unset.
     *
     * @returns true when video-source links should be shown
     */
    get videoSources(): boolean {
      return (
        readBooleanStrictTrue('ALLOW_EXTERNAL_VIDEO_SOURCE_LINKS') ||
        (readBooleanDefaultTrue('ALLOW_EXTERNAL_VIDEO_SOURCE_LINKS') &&
          readBooleanDefaultTrue('ALLOW_EXTERNAL_LINKS'))
      )
    },
  }),

  defaultUser: Object.freeze({
    get username(): string {
      return readStringWithDefault('DEFAULT_USER_USERNAME', 'default-user')
    },
    get displayName(): string {
      return readStringWithDefault('DEFAULT_USER_DISPLAY_NAME', 'Default User')
    },
  }),

  /**
   * Resolve a provider's API key from the conventional env var.
   *
   * Reads `<PROVIDER>_API_KEY` (provider upper-cased), e.g. `anthropic`
   * reads `ANTHROPIC_API_KEY`. Used as a fallback when no admin-stored
   * key exists for the provider.
   *
   * @param provider - provider name (case-insensitive), e.g. `anthropic`
   * @returns the key string, or undefined when the env var is unset/empty
   *
   * @example
   * ```typescript
   * const key = config.getProviderApiKey('anthropic')
   * ```
   */
  getProviderApiKey(provider: string): string | undefined {
    return readString(`${provider.toUpperCase()}_API_KEY`)
  },
})

assertStartupConfig()

export { config }
