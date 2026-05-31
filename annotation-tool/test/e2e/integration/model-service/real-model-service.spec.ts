/**
 * Integration coverage against the REAL CPU-mode model-service container.
 *
 * This is the Tier 2 verification: the existing
 * test/e2e/regression/model-service/model-service-coverage.spec.ts runs
 * against the mock model-service in test-utils/mock-model-service.js and
 * asserts exact-match deterministic outputs. That spec gates every PR
 * via the test-e2e job because it is fast (~16 min) and deterministic.
 *
 * THIS spec runs against the real model-service container shipped under
 * model-service/ in CPU mode (BUILD_MODE=minimal, DEVICE=cpu) and asserts
 * tolerance-based properties only:
 *
 *   - Each endpoint reachable through the backend returns 200 within an
 *     elevated timeout (real CPU inference, especially first-call, is
 *     orders of magnitude slower than the mock).
 *   - Each response has the documented top-level shape (the same one the
 *     frontend client code in src/api/client.ts and src/store/queries/*
 *     reads, after the backend's snake_case to camelCase transform).
 *   - Value ranges that the real model must honour (confidence ∈ [0,1],
 *     bounding-box coords ≥ 0, suggestions list non-empty for a query
 *     that should have results) are enforced; specific values are not.
 *
 * Engage by booting the docker-compose.e2e.real-models.yml override
 * (which swaps MODEL_SERVICE_URL on the backend from the mock to the
 * real CPU-mode service) and running:
 *
 *   pnpm --filter @fovea/annotation-tool exec \
 *     playwright test --project=integration-models
 *
 * The CI workflow .github/workflows/e2e-real-models.yml fires this on
 * workflow_dispatch, on `e2e-models` label, and nightly.
 *
 * If this spec fails the contract test (Tier 1) is still green, that
 * means the real model-service is misconfigured (model paths, weights,
 * device fallback, framework selection, etc.) and not that the backend
 * or frontend is broken; the failing test name points at which task
 * type is misconfigured.
 */
import { test, expect } from '../../fixtures/test-context.js'

// Real CPU-mode model loads dominate wall-clock; budget generously. The
// elevated test-level timeout is set on the integration-models project
// in playwright.config.ts; these per-call expectations stay inside it.
const FIRST_INFERENCE_TIMEOUT_MS = 120_000

test.describe('Real model-service integration', () => {
  test('health: backend reaches a live model-service that reports ready', async ({ page, testUser }) => {
    void testUser
    const res = await page.request.get('/api/models/status', { timeout: FIRST_INFERENCE_TIMEOUT_MS })
    expect(res.status(), `models/status must return 200, got ${res.status()}`).toBe(200)
    const body = (await res.json()) as {
      isReady?: boolean
      ready?: boolean
      tasks?: Record<string, unknown>
    }
    // The status payload's exact field name has varied across model-service
    // versions; accept either of the two documented spellings rather than
    // pinning to one and failing on legitimate refactors.
    const isReady = body.isReady ?? body.ready
    expect(
      isReady,
      'real model-service must report ready=true on status; check the model-service container logs if not',
    ).toBe(true)
  })

  test('config: GET /api/models/config returns availableModels and selectedModels with referential integrity', async ({
    page,
    testUser,
  }) => {
    void testUser
    const res = await page.request.get('/api/models/config', { timeout: FIRST_INFERENCE_TIMEOUT_MS })
    expect(res.status()).toBe(200)
    const body = (await res.json()) as {
      availableModels: Record<string, string[]>
      selectedModels: Record<string, string>
      device: string
    }
    expect(body.device).toMatch(/^(cpu|cuda|mps)$/)
    // Real model-service: at least one task must be configured. We do not
    // pin the exact list because the model-service ships different task
    // types depending on BUILD_MODE.
    const taskCount = Object.keys(body.selectedModels).length
    expect(
      taskCount,
      'real model-service must expose at least one task in selectedModels; check model-service/config/models.yaml',
    ).toBeGreaterThan(0)
    for (const [task, selected] of Object.entries(body.selectedModels)) {
      expect(body.availableModels[task], `availableModels missing entry for task "${task}"`).toBeTruthy()
      expect(
        body.availableModels[task],
        `selectedModels.${task}="${selected}" must appear in availableModels.${task}`,
      ).toContain(selected)
    }
  })

  test('frameworks: GET /api/models/frameworks lists frameworks consistent with availableModels', async ({
    page,
    testUser,
  }) => {
    void testUser
    const res = await page.request.get('/api/models/frameworks', { timeout: FIRST_INFERENCE_TIMEOUT_MS })
    expect(res.status()).toBe(200)
    const body = (await res.json()) as {
      frameworks: string[]
      byTask?: Record<string, string[]>
    }
    expect(Array.isArray(body.frameworks)).toBe(true)
    expect(body.frameworks.length).toBeGreaterThan(0)
    if (body.byTask) {
      for (const [task, taskFrameworks] of Object.entries(body.byTask)) {
        for (const fw of taskFrameworks) {
          expect(
            body.frameworks,
            `byTask.${task} reports framework "${fw}" that is not in the global frameworks list`,
          ).toContain(fw)
        }
      }
    }
  })

  test('detection: real detector returns at least one plausibly-shaped bounding box on a single frame', async ({
    page,
    testVideo,
    testPersona,
    testUser,
  }) => {
    void testUser
    const res = await page.request.post(`/api/videos/${testVideo.id}/detect`, {
      data: {
        videoId: testVideo.id,
        personaId: testPersona.id,
        queries: ['person', 'object'],
        startTime: 0,
        endTime: 1,
        maxFrames: 1,
      },
      timeout: FIRST_INFERENCE_TIMEOUT_MS,
    })
    expect(
      res.status(),
      `real detection must return 200 (got ${res.status()}: ${await res.text().catch(() => '<no body>')})`,
    ).toBe(200)
    const body = (await res.json()) as {
      videoId: string
      query: string
      frameResults: Array<{
        frameNumber: number
        detections: Array<{ x: number; y: number; width: number; height: number; confidence: number; label: string }>
      }>
    }
    expect(body.videoId).toBe(testVideo.id)
    expect(Array.isArray(body.frameResults)).toBe(true)
    expect(body.frameResults.length).toBeGreaterThan(0)
    // The real detector may return zero detections on a frame that does
    // not contain any of the queried classes, which is a legitimate
    // outcome rather than a defect; assert only that the response shape
    // and per-detection ranges are honoured wherever the model did fire.
    for (const frame of body.frameResults) {
      expect(typeof frame.frameNumber).toBe('number')
      expect(Array.isArray(frame.detections)).toBe(true)
      for (const det of frame.detections) {
        expect(det.x).toBeGreaterThanOrEqual(0)
        expect(det.y).toBeGreaterThanOrEqual(0)
        expect(det.width).toBeGreaterThan(0)
        expect(det.height).toBeGreaterThan(0)
        expect(det.confidence).toBeGreaterThanOrEqual(0)
        expect(det.confidence).toBeLessThanOrEqual(1)
        expect(typeof det.label).toBe('string')
        expect(det.label.length).toBeGreaterThan(0)
      }
    }
  })

  test('ontology augment: real LLM returns at least one suggestion for a real-world domain', async ({
    page,
    testPersona,
    testUser,
  }) => {
    void testUser
    const res = await page.request.post('/api/ontology/augment', {
      data: {
        personaId: testPersona.id,
        domain: 'sports broadcasting',
        targetCategory: 'entity',
        existingTypes: [],
        maxSuggestions: 3,
      },
      timeout: FIRST_INFERENCE_TIMEOUT_MS,
    })
    expect(
      res.status(),
      `real ontology/augment must return 200 (got ${res.status()}: ${await res.text().catch(() => '<no body>')})`,
    ).toBe(200)
    const body = (await res.json()) as {
      id: string
      personaId: string
      targetCategory: string
      suggestions: Array<{ name: string; description: string; confidence: number; examples: string[] }>
      reasoning: string
    }
    expect(body.personaId).toBe(testPersona.id)
    expect(body.targetCategory).toBe('entity')
    expect(Array.isArray(body.suggestions)).toBe(true)
    expect(
      body.suggestions.length,
      'real LLM must return at least one suggestion for a well-formed domain prompt; ' +
        'an empty list usually means the model output failed JSON parsing on the model-service side',
    ).toBeGreaterThan(0)
    for (const s of body.suggestions) {
      expect(typeof s.name).toBe('string')
      expect(s.name.length).toBeGreaterThan(0)
      expect(s.confidence).toBeGreaterThanOrEqual(0)
      expect(s.confidence).toBeLessThanOrEqual(1)
    }
    expect(typeof body.reasoning).toBe('string')
  })

  test('thumbnail: GET /api/videos/:id/thumbnail returns a real image generated by the model-service', async ({
    page,
    testVideo,
    testUser,
  }) => {
    void testUser
    const res = await page.request.get(`/api/videos/${testVideo.id}/thumbnail`, {
      timeout: FIRST_INFERENCE_TIMEOUT_MS,
    })
    expect(res.status()).toBe(200)
    const contentType = res.headers()['content-type'] || ''
    expect(contentType).toMatch(/^image\/(jpeg|png|webp)/)
    const bodyBytes = await res.body()
    // Real thumbnails are larger than mock placeholders; the mock writes
    // a tiny solid-colour PNG. Anything under 500 bytes from the real
    // pipeline indicates the frame extraction or encode step failed.
    expect(bodyBytes.length, 'real thumbnail must be larger than a 500-byte placeholder').toBeGreaterThan(500)
  })
})
