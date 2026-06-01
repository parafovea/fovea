/**
 * Wraps `fetch()` for calls to the Python model service with a hard
 * client-side timeout and a clean error taxonomy. Every call site in
 * `server/src` that talks to MODEL_SERVICE_URL via `fetch()` (i.e. the
 * routes that did not already use the `axios` client) must go through
 * this helper so that a hung model service surfaces as a fast 504 to
 * the caller rather than an unbounded await.
 *
 * Background: production reports of indefinite spinners on object
 * detection, thumbnail generation, ontology augment, summarize, claim
 * extraction, and claim synthesis. Each of those backend routes used a
 * bare `fetch()` with no `signal`, so a stalled model-service request
 * stalled the whole HTTP request. The axios call sites in
 * `routes/models.ts` and `services/system-config-propagator.ts` already
 * had explicit `timeout:` values; this helper closes the gap for the
 * fetch-based call sites.
 */

export class ModelServiceTimeoutError extends Error {
  readonly endpoint: string
  readonly timeoutMs: number
  constructor(endpoint: string, timeoutMs: number) {
    super(`Model service did not respond within ${timeoutMs}ms at ${endpoint}`)
    this.name = 'ModelServiceTimeoutError'
    this.endpoint = endpoint
    this.timeoutMs = timeoutMs
  }
}

export class ModelServiceUnreachableError extends Error {
  readonly endpoint: string
  readonly cause: Error
  constructor(endpoint: string, cause: Error) {
    super(`Model service unreachable at ${endpoint}: ${cause.message}`)
    this.name = 'ModelServiceUnreachableError'
    this.endpoint = endpoint
    this.cause = cause
  }
}

export interface FetchModelServiceOptions {
  /** Hard timeout in milliseconds; the request is aborted after this. */
  timeoutMs: number
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: Record<string, string>
  /** JSON body — will be serialized and Content-Type set automatically. */
  body?: unknown
}

/**
 * Call the model service with a guaranteed upper bound on wall-clock time.
 * On timeout, throws `ModelServiceTimeoutError`. On network failure (DNS,
 * connection refused, etc.), throws `ModelServiceUnreachableError`. On
 * HTTP non-2xx, returns the Response so the caller can read the body and
 * forward the status code to its own caller — same shape as bare fetch.
 */
export async function fetchModelService(
  url: string,
  options: FetchModelServiceOptions,
): Promise<Response> {
  const { timeoutMs, method = 'GET', headers = {}, body } = options
  const init: RequestInit = {
    method,
    headers: body !== undefined
      ? { 'Content-Type': 'application/json', ...headers }
      : headers,
    signal: AbortSignal.timeout(timeoutMs),
  }
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  try {
    return await fetch(url, init)
  } catch (err) {
    if (err instanceof Error) {
      // `AbortSignal.timeout()` rejects with a DOMException whose name is
      // 'TimeoutError' (per the spec); some runtimes also surface
      // 'AbortError'. Either way we want a typed timeout error.
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new ModelServiceTimeoutError(url, timeoutMs)
      }
      throw new ModelServiceUnreachableError(url, err)
    }
    throw err
  }
}

/** Parse a positive-integer env var, falling back to a default when unset
 * or malformed. Used by the per-endpoint timeouts below so deployments
 * with slower upstream hardware (CPU-only model-service, cold-start
 * cloud instances) can raise the ceiling without a code change.
 */
function envTimeoutMs(name: string, defaultMs: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return defaultMs
  const parsed = Number.parseInt(raw, 10)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return defaultMs
}

/** Per-endpoint timeout defaults. Each value is the upper bound the
 * backend waits before aborting a forwarded request to the model-
 * service and surfacing 504 MODEL_SERVICE_TIMEOUT to the caller. The
 * defaults below target a GPU-warm production deployment; CPU-cold
 * first-load (e.g. the integration-models E2E stack) is materially
 * slower (an LLM augmenter call took 94s on first invocation, beyond
 * the prior 60s detection / augment ceilings), so deployments that
 * need higher ceilings override these via the matching env vars.
 */
export const MODEL_SERVICE_TIMEOUTS = {
  /** Detection across N frames: heavier than a simple inference. */
  detection: envTimeoutMs('MODEL_SERVICE_TIMEOUT_DETECTION_MS', 60_000),
  /** Single-frame thumbnail render. */
  thumbnails: envTimeoutMs('MODEL_SERVICE_TIMEOUT_THUMBNAILS_MS', 30_000),
  /** LLM-backed ontology suggestion. */
  ontologyAugment: envTimeoutMs('MODEL_SERVICE_TIMEOUT_ONTOLOGY_AUGMENT_MS', 60_000),
  /** Transcription / summarization over a whole video. */
  summarize: envTimeoutMs('MODEL_SERVICE_TIMEOUT_SUMMARIZE_MS', 300_000),
  /** Claim extraction over a summary. */
  extractClaims: envTimeoutMs('MODEL_SERVICE_TIMEOUT_EXTRACT_CLAIMS_MS', 300_000),
  /** Synthesizing a final summary from extracted claims. */
  synthesize: envTimeoutMs('MODEL_SERVICE_TIMEOUT_SYNTHESIZE_MS', 300_000),
} as const
