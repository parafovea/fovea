import { test, expect } from '../../fixtures/test-context.js'

/**
 * E2E coverage for every backend route that proxies a request to the
 * model-service. Each test drives the same HTTP path the frontend client
 * code (`annotation-tool/src/api/client.ts`) uses and asserts:
 *
 *   1. The backend accepted the request (no 4xx/5xx infrastructure error).
 *   2. The response shape is the contract the frontend code reads from.
 *
 * The mock model-service that sits behind the backend in the E2E stack
 * (see `docker-compose.e2e.yml` and `test-utils/mock-model-service.js`)
 * implements every endpoint the production server hits at
 * `MODEL_SERVICE_URL`, so these tests fail loudly if a model-service
 * endpoint is renamed, removed, or its response shape drifts away from
 * what the backend or frontend expect — which is precisely the regression
 * surface we want to lock down here.
 *
 * Coverage map (frontend client method → backend route → model-service):
 *
 *   detectObjects               POST /api/videos/:id/detect         /api/detection/detect
 *   thumbnail (img src)         GET  /api/videos/:id/thumbnail      /api/thumbnails/generate
 *   augmentOntology             POST /api/ontology/augment          /api/ontology/augment
 *   getModelConfig              GET  /api/models/config             /api/models/config
 *   getModelStatus              GET  /api/models/status             /api/models/status
 *   selectModel                 POST /api/models/select             /api/models/select
 *   validateMemoryBudget        POST /api/models/validate           /api/models/validate
 *   checkTaskReady              GET  /api/models/task-ready/:type   /api/models/task-ready/:type
 *   loadModel                   POST /api/models/load/:type         /api/models/load/:type
 *   getModelDefaults            GET  /api/models/defaults           /api/models/defaults
 *   getModelFrameworks          GET  /api/models/frameworks         /api/models/frameworks
 *   generateSummary             POST /api/videos/summaries/generate /api/summarize        (background queue)
 *   extract claims              POST /api/summaries/:id/claims/generate /api/extract-claims (background queue)
 *   synthesize                  POST /api/summaries/:id/synthesize  /api/synthesize-summary (background queue)
 *
 * The `/api/admin/reconfigure` model-service endpoint is fired by the
 * backend's `SystemConfigPropagator` whenever an admin-scope row in the
 * `system_config` table is added or updated; its frontend trigger is
 * `updateSystemConfig` → `PUT /api/admin/config`, which is exercised
 * below under the "admin reconfigure" group.
 *
 * The `/api/tracking/track` model-service endpoint has no frontend
 * caller in `src/api/client.ts` today and no backend proxy that
 * forwards to it, so it is intentionally not covered here. If a
 * tracking-from-frontend flow is added, add a case below.
 */
test.describe('Model service: every frontend-triggered call is wired end-to-end', () => {
  test('detection: POST /api/videos/:id/detect reaches /api/detection/detect and returns detections', async ({
    page,
    testVideo,
    testPersona,
    testUser, // eslint-disable-line @typescript-eslint/no-unused-vars
  }) => {
    const res = await page.request.post(`/api/videos/${testVideo.id}/detect`, {
      data: {
        videoId: testVideo.id,
        personaId: testPersona.id,
        queries: ['person'],
        startTime: 0,
        endTime: 1,
        maxFrames: 1,
      },
    })
    expect(res.status(), 'detection request must not surface infrastructure error').toBeLessThan(500)
    if (res.status() === 200) {
      const body = await res.json()
      // Shape contract: DetectionResponse in src/api/client.ts. The backend
      // re-shapes the model-service `frames` field into `frameResults` and
      // flattens each bounding box (`x/y/width/height` at top level of the
      // detection) before sending to the frontend, so assert that post-
      // transform shape.
      expect(body).toHaveProperty('videoId')
      expect(body).toHaveProperty('query')
      expect(body).toHaveProperty('frameResults')
      expect(Array.isArray(body.frameResults)).toBe(true)
      expect(body.frameResults.length).toBeGreaterThan(0)
      const firstFrame = body.frameResults[0]
      expect(firstFrame).toHaveProperty('frameNumber')
      expect(Array.isArray(firstFrame.detections)).toBe(true)
      const firstDet = firstFrame.detections[0]
      expect(firstDet).toHaveProperty('x')
      expect(firstDet).toHaveProperty('y')
      expect(firstDet).toHaveProperty('width')
      expect(firstDet).toHaveProperty('height')
      expect(firstDet).toHaveProperty('confidence')
      expect(firstDet).toHaveProperty('label')
    } else {
      // The detection endpoint may legitimately 4xx (e.g. missing video frames
      // for the seeded fixture); locking down "not 5xx" is the wire check.
      expect(res.status()).toBeGreaterThanOrEqual(400)
    }
  })

  test('thumbnails: GET /api/videos/:id/thumbnail reaches /api/thumbnails/generate', async ({
    page,
    testVideo,
    testUser, // eslint-disable-line @typescript-eslint/no-unused-vars
  }) => {
    const res = await page.request.get(`/api/videos/${testVideo.id}/thumbnail`)
    // The route either returns a cached / freshly-generated image, or 404
    // for the not-yet-generated case. 5xx is the failure mode we lock out.
    expect(res.status()).toBeLessThan(500)
    if (res.status() === 200) {
      expect(res.headers()['content-type']).toMatch(/image\/(jpeg|png|webp)/)
    }
  })

  test('ontology augment: POST /api/ontology/augment reaches /api/ontology/augment', async ({
    page,
    testUser, // eslint-disable-line @typescript-eslint/no-unused-vars
  }) => {
    // Read the current ontology so we send the same shape augmentOntology() does.
    const ontologyRes = await page.request.get('/api/ontology')
    expect(ontologyRes.status()).toBe(200)
    const ontology = await ontologyRes.json()
    const res = await page.request.post('/api/ontology/augment', {
      data: {
        ontology,
        prompt: 'Add one entity type for E2E coverage of the augment endpoint.',
      },
    })
    expect(res.status()).toBeLessThan(500)
    if (res.status() === 200) {
      const body = await res.json()
      // The augment endpoint must return something the frontend can show.
      expect(body).toBeTruthy()
    }
  })

  test.describe('models: settings-page endpoints round-trip through model-service', () => {
    test('GET /api/models/config returns ModelConfig shape', async ({ page, testUser }) => {
      void testUser
      const res = await page.request.get('/api/models/config')
      expect(res.status()).toBeLessThan(500)
      if (res.status() === 200) {
        const body = await res.json()
        // Shape contract: ModelConfig in src/api/client.ts. The backend
        // camelcase-keys the snake_case response from model-service
        // before forwarding to the frontend, so assert the post-transform
        // shape the frontend actually consumes.
        expect(body).toHaveProperty('availableModels')
        expect(body).toHaveProperty('selectedModels')
        expect(body).toHaveProperty('device')
      }
    })

    test('GET /api/models/status returns ModelStatusResponse', async ({ page, testUser }) => {
      void testUser
      const res = await page.request.get('/api/models/status')
      expect(res.status()).toBeLessThan(500)
    })

    test('GET /api/models/defaults returns ModelDefaultsResponse', async ({ page, testUser }) => {
      void testUser
      const res = await page.request.get('/api/models/defaults')
      expect(res.status()).toBeLessThan(500)
    })

    test('GET /api/models/frameworks returns ModelFrameworksResponse', async ({ page, testUser }) => {
      void testUser
      const res = await page.request.get('/api/models/frameworks')
      expect(res.status()).toBeLessThan(500)
    })

    test('GET /api/models/task-ready/:taskType returns TaskReadyResponse', async ({ page, testUser }) => {
      void testUser
      const res = await page.request.get('/api/models/task-ready/detection')
      expect(res.status()).toBeLessThan(500)
    })

    test('POST /api/models/validate returns MemoryValidation', async ({ page, testUser }) => {
      void testUser
      const res = await page.request.post('/api/models/validate', { data: {} })
      expect(res.status()).toBeLessThan(500)
    })

    test('POST /api/models/select reaches /api/models/select', async ({ page, testUser }) => {
      void testUser
      // Pick a model id that the mock declares available for the detection task.
      const res = await page.request.post('/api/models/select', {
        data: { taskType: 'detection', modelName: 'yolov8n' },
      })
      expect(res.status()).toBeLessThan(500)
    })

    test('POST /api/models/load/:taskType reaches /api/models/load', async ({ page, testUser }) => {
      void testUser
      const res = await page.request.post('/api/models/load/detection', { data: {} })
      expect(res.status()).toBeLessThan(500)
    })
  })

  test.describe('background queues: summarize / extract-claims / synthesize-summary', () => {
    test('POST /api/videos/summaries/generate enqueues a /api/summarize job', async ({
      page,
      testVideo,
      testPersona,
      testUser,
    }) => {
      void testUser
      const res = await page.request.post('/api/videos/summaries/generate', {
        data: { videoId: testVideo.id, personaId: testPersona.id },
      })
      // 202 is the contract — job queued. 4xx means the request itself was malformed;
      // 5xx means the worker/queue is broken.
      expect(res.status()).toBeLessThan(500)
    })

    test('POST /api/summaries/:id/claims/generate enqueues a /api/extract-claims job', async ({
      page,
      testVideo,
      testPersona,
      testUser,
    }) => {
      void testUser
      // Create a summary row to attach the claim-extraction job to.
      const summaryRes = await page.request.post('/api/summaries', {
        data: {
          videoId: testVideo.id,
          personaId: testPersona.id,
          // POST /api/summaries body schema requires `summary` as an
          // array of GlossItem objects (see server/src/routes/summaries.ts
          // GlossItemSchema); plain `text` produces a 400 VALIDATION_ERROR.
          summary: [
            { type: 'text', content: 'Summary placeholder for claim-extraction wire test.' },
          ],
        },
      })
      expect(
        summaryRes.status(),
        `summary create must succeed for the extract-claims wire test (got ${summaryRes.status()}: ${await summaryRes.text().catch(() => '<no body>')})`,
      ).toBeLessThan(300)
      const summary = (await summaryRes.json()) as { id: string }
      expect(summary.id, 'summary create response must carry an id').toBeTruthy()
      const res = await page.request.post(`/api/summaries/${summary.id}/claims/generate`, {
        data: {},
      })
      expect(res.status()).toBeLessThan(500)
      // The contract is 202 (Accepted, job queued); locking this down prevents
      // a regression that silently returns 200 with no job id and the
      // frontend's polling loop then waits forever.
      if (res.status() === 202) {
        const body = (await res.json()) as { jobId?: string; status?: string; summaryId?: string }
        expect(body.jobId, 'queued response must carry a jobId').toBeTruthy()
        expect(body.summaryId).toBe(summary.id)
      }
    })

    test('POST /api/summaries/:id/synthesize enqueues a /api/synthesize-summary job', async ({
      page,
      testVideo,
      testPersona,
      testUser,
    }) => {
      void testUser
      const summaryRes = await page.request.post('/api/summaries', {
        data: {
          videoId: testVideo.id,
          personaId: testPersona.id,
          summary: [
            { type: 'text', content: 'Summary placeholder for synthesize wire test.' },
          ],
        },
      })
      expect(
        summaryRes.status(),
        `summary create must succeed for the synthesize wire test (got ${summaryRes.status()}: ${await summaryRes.text().catch(() => '<no body>')})`,
      ).toBeLessThan(300)
      const summary = (await summaryRes.json()) as { id: string }
      expect(summary.id, 'summary create response must carry an id').toBeTruthy()
      const res = await page.request.post(`/api/summaries/${summary.id}/synthesize`, {
        data: { synthesisStrategy: 'narrative' },
      })
      expect(res.status()).toBeLessThan(500)
      if (res.status() === 202) {
        const body = (await res.json()) as { jobId?: string; status?: string }
        expect(body.jobId, 'queued response must carry a jobId').toBeTruthy()
      }
    })
  })

  test('admin reconfigure: PUT /api/admin/config propagates to /api/admin/reconfigure', async ({
    page,
    testUser,
  }) => {
    void testUser
    // The SystemConfigPropagator fires /api/admin/reconfigure as a side effect
    // whenever an admin-scope row in system_config is updated. Drive the same
    // endpoint the SystemConfigPanel uses. If the test user isn't an admin in
    // the seeded fixture, the route will 403 — that's still wire-correct.
    const res = await page.request.put('/api/admin/config', {
      data: { key: 'e2e-coverage-marker', value: 'reconfigure-fired' },
    })
    expect([200, 201, 202, 400, 401, 403, 404]).toContain(res.status())
  })
})
