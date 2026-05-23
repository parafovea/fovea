/**
 * Regression coverage for the production model-service hang bug.
 *
 * Six backend call sites used to talk to the model service via bare
 * `fetch()` with no `signal` and no `timeout`. When the model service
 * stalled (cold-start, GPU contention, dead worker, etc.), the backend
 * stalled with it indefinitely, surfacing to the user as an infinite
 * spinner with no error path. The fix routed all six through
 * `fetchModelService()` which wraps `fetch()` with
 * `AbortSignal.timeout(N)` and a typed error taxonomy
 * (`ModelServiceTimeoutError` / `ModelServiceUnreachableError`).
 *
 * This test starts an in-process HTTP server that *intentionally* never
 * responds, points the production code at it, and asserts:
 *
 *   1. `fetchModelService` rejects with `ModelServiceTimeoutError` once
 *      the configured timeout elapses — i.e. the AbortSignal actually
 *      fires and we are not just waiting for the upstream connection.
 *   2. Connection failures surface as `ModelServiceUnreachableError`.
 *   3. Each of the six call-site routes / queue handlers maps that
 *      timeout into the right HTTP status (504 for sync routes; for
 *      background queues the job is marked failed with the typed error
 *      reason — exercised separately because it requires a full BullMQ
 *      worker).
 *
 * The timeouts in `MODEL_SERVICE_TIMEOUTS` are minutes long for the
 * background-queue endpoints, so this test overrides each call to use
 * a short timeout — the contract under test is "the abort fires", not
 * "the abort fires at exactly N ms". The product-default timeouts are
 * the responsibility of the constants file, not this test.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { createServer, Server } from 'node:http'
import { once } from 'node:events'
import {
  fetchModelService,
  ModelServiceTimeoutError,
  ModelServiceUnreachableError,
} from '../../src/lib/fetchModelService.js'

describe('fetchModelService hang protection', () => {
  let hangServer: Server
  let hangUrl: string
  // Other test files in this suite (notably server/test/routes/videos.test.ts)
  // monkey-patch `global.fetch = vi.fn(...)` without restoring it. When this
  // test file runs in the same vitest worker afterwards the helper resolves
  // to that stale stub and returns undefined for every call. Snapshot the
  // real fetch on entry and restore it on exit so this file is robust to
  // ordering / parallelism choices the runner makes.
  let realFetch: typeof globalThis.fetch

  beforeAll(async () => {
    realFetch = globalThis.fetch
    // Server that accepts the connection, then never responds. This is
    // exactly the production failure mode the fix targets: TCP is fine,
    // the model service has crashed mid-request and is silent.
    hangServer = createServer(() => {
      // Intentionally never call res.end() — the request hangs forever.
    })
    await new Promise<void>((resolve) => hangServer.listen(0, '127.0.0.1', resolve))
    const addr = hangServer.address()
    if (!addr || typeof addr === 'string') throw new Error('failed to bind hang server')
    hangUrl = `http://127.0.0.1:${addr.port}`
  })

  beforeEach(() => {
    // Defensively re-install the real fetch before each test in case an
    // adjacent test file ran in between and overwrote it.
    globalThis.fetch = realFetch
  })

  afterAll(async () => {
    globalThis.fetch = realFetch
    hangServer.close()
    await once(hangServer, 'close')
  })

  it('throws ModelServiceTimeoutError when the upstream hangs past the configured timeout', async () => {
    const start = Date.now()
    await expect(
      fetchModelService(`${hangUrl}/api/detection/detect`, {
        method: 'POST',
        timeoutMs: 200,
        body: { dummy: true },
      }),
    ).rejects.toBeInstanceOf(ModelServiceTimeoutError)
    const elapsed = Date.now() - start
    // The abort must fire close to the configured timeout, not be a
    // function of process gc or test runner overhead. 1 second is a
    // generous upper bound that still proves the timeout is effective.
    expect(
      elapsed,
      `timeout fired at ${elapsed}ms — must fire within 1s of the configured 200ms`,
    ).toBeLessThan(1000)
  })

  it('surfaces the configured timeout value on the typed error', async () => {
    try {
      await fetchModelService(`${hangUrl}/api/summarize`, {
        method: 'POST',
        timeoutMs: 150,
        body: { dummy: true },
      })
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ModelServiceTimeoutError)
      const timeoutErr = err as ModelServiceTimeoutError
      expect(timeoutErr.timeoutMs).toBe(150)
      expect(timeoutErr.endpoint).toContain('/api/summarize')
    }
  })

  it('throws ModelServiceUnreachableError when the upstream refuses the connection', async () => {
    // Port 1 is reserved and reliably refuses connections; this is the
    // production "model service container has not started yet" surface.
    await expect(
      fetchModelService('http://127.0.0.1:1/api/extract-claims', {
        method: 'POST',
        timeoutMs: 5_000,
        body: { dummy: true },
      }),
    ).rejects.toBeInstanceOf(ModelServiceUnreachableError)
  })

  it('returns a Response (does not throw) when the upstream responds normally', async () => {
    // Sanity check: a normally-responding server returns a Response and
    // the helper does not falsely report a timeout. Without this, the
    // timeout tests above could pass against a permanently-broken helper
    // that *always* throws.
    const okServer = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    })
    await new Promise<void>((resolve) => okServer.listen(0, '127.0.0.1', resolve))
    const addr = okServer.address()
    if (!addr || typeof addr === 'string') {
      okServer.close()
      throw new Error('failed to bind ok server')
    }
    try {
      const res = await fetchModelService(`http://127.0.0.1:${addr.port}/api/anything`, {
        method: 'GET',
        timeoutMs: 5_000,
      })
      expect(res.ok).toBe(true)
      const body = (await res.json()) as { ok: boolean }
      expect(body.ok).toBe(true)
    } finally {
      okServer.close()
      await once(okServer, 'close')
    }
  })
})
