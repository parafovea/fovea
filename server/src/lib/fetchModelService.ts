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

import { config } from '../config.js'

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

/** Per-endpoint timeout accessors. Each value is the upper bound the
 * backend waits before aborting a forwarded request to the model-
 * service and surfacing 504 MODEL_SERVICE_TIMEOUT to the caller. The
 * defaults target a GPU-warm production deployment; CPU-cold first-load
 * (e.g. the integration-models E2E stack) is materially slower, so
 * deployments that need higher ceilings override via the matching
 * `MODEL_SERVICE_TIMEOUT_<NAME>_MS` env var. Values are resolved through
 * `config.modelService.timeoutMs` so the env surface lives in one place;
 * each property reads at access time so an env override is honored. */
export const MODEL_SERVICE_TIMEOUTS = Object.freeze({
  /** Detection across N frames: heavier than a simple inference. */
  get detection(): number {
    return config.modelService.timeoutMs('detection')
  },
  /** Single-frame thumbnail render. */
  get thumbnails(): number {
    return config.modelService.timeoutMs('thumbnails')
  },
  /** LLM-backed ontology suggestion. */
  get ontologyAugment(): number {
    return config.modelService.timeoutMs('ontologyAugment')
  },
  /** Transcription / summarization over a whole video. */
  get summarize(): number {
    return config.modelService.timeoutMs('summarize')
  },
  /** Claim extraction over a summary. */
  get extractClaims(): number {
    return config.modelService.timeoutMs('extractClaims')
  },
  /** Synthesizing a final summary from extracted claims. */
  get synthesize(): number {
    return config.modelService.timeoutMs('synthesize')
  },
  /** Audio transcription over a video / audio file. */
  get transcribe(): number {
    return config.modelService.timeoutMs('transcribe')
  },
})
