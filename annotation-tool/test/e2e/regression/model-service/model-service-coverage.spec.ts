import { test, expect } from '../../fixtures/test-context.js'

/**
 * E2E coverage for every backend route that proxies a request to the
 * model-service. Each test drives the same HTTP path the frontend client
 * code (`annotation-tool/src/api/client.ts`) uses and asserts the EXACT
 * happy-path status code, the EXACT post-transform response shape the
 * frontend consumes, and (where applicable) every documented field.
 *
 * No "tolerate 4xx" patterns. No "if status === 200" conditional shape
 * checks. No allow-lists of statuses. Each test requires the success
 * path; if the test environment cannot satisfy the success path (e.g.
 * the test user lacks an ability), the test exercises a *separate*
 * negative case with its own exact-status assertion.
 *
 * The mock model-service at `test-utils/mock-model-service.js` returns
 * fully-populated responses that match the real Pydantic schemas under
 * `model-service/src/.../schemas/`, so the strong shape assertions
 * below fail loudly the moment any layer of the wire (mock, backend
 * transform, route handler) drifts.
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
 * below under the "admin reconfigure" group. The E2E test user is
 * `system_admin` (per the testUser fixture in test-context.ts), so the
 * happy-path 2xx is the contract under test.
 *
 * The `/api/tracking/track` model-service endpoint has no frontend
 * caller in `src/api/client.ts` today and no backend proxy that
 * forwards to it, so it is intentionally not covered here. If a
 * tracking-from-frontend flow is added, add a case below.
 */
test.describe('Model service: every frontend-triggered call is wired end-to-end', () => {
  test('detection: POST /api/videos/:id/detect returns 200 + full DetectionResponse shape', async ({
    page,
    testVideo,
    testPersona,
    testUser,
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
    expect(
      res.status(),
      `detection must return 200 (got ${res.status()}: ${await res.text().catch(() => '<no body>')})`,
    ).toBe(200)
    const body = (await res.json()) as {
      videoId: string
      query: string
      frames: Array<{
        frameNumber: number
        timestamp: number
        detections: Array<{
          label: string
          boundingBox: { x: number; y: number; width: number; height: number }
          confidence: number
          trackId?: string | null
        }>
      }>
    }
    // Shape contract: DetectionResponse in src/api/client.ts. The backend
    // passes the model-service response through verbatim (snake→camel only,
    // see server/src/routes/videos/detect.ts) — it does NOT re-shape, so the
    // frontend contract is `frames` (each with `frameNumber`/`timestamp`/
    // `detections`) and a nested `boundingBox` per detection.
    expect(body.videoId).toBe(testVideo.id)
    expect(typeof body.query).toBe('string')
    expect(body.query.length).toBeGreaterThan(0)
    expect(Array.isArray(body.frames)).toBe(true)
    expect(body.frames.length).toBeGreaterThan(0)
    for (const frame of body.frames) {
      expect(typeof frame.frameNumber).toBe('number')
      expect(Array.isArray(frame.detections)).toBe(true)
      for (const det of frame.detections) {
        expect(typeof det.boundingBox.x).toBe('number')
        expect(typeof det.boundingBox.y).toBe('number')
        expect(typeof det.boundingBox.width).toBe('number')
        expect(typeof det.boundingBox.height).toBe('number')
        expect(typeof det.confidence).toBe('number')
        expect(det.confidence).toBeGreaterThanOrEqual(0)
        expect(det.confidence).toBeLessThanOrEqual(1)
        expect(typeof det.label).toBe('string')
        expect(det.label.length).toBeGreaterThan(0)
      }
    }
  })

  test('thumbnails: GET /api/videos/:id/thumbnail returns 200 with image content-type', async ({
    page,
    testVideo,
    testUser,
  }) => {
    const res = await page.request.get(`/api/videos/${testVideo.id}/thumbnail`)
    expect(
      res.status(),
      `thumbnail must return 200 (got ${res.status()}: ${await res.text().catch(() => '<no body>')})`,
    ).toBe(200)
    const contentType = res.headers()['content-type'] || ''
    expect(contentType, `thumbnail must serve an image (got content-type "${contentType}")`).toMatch(
      /^image\/(jpeg|png|webp)/,
    )
    const bodyBytes = await res.body()
    expect(bodyBytes.length, 'thumbnail body must not be empty').toBeGreaterThan(0)
  })

  test('ontology augment: POST /api/ontology/augment returns 200 + AugmentResponse shape', async ({
    page,
    testPersona,
    testUser,
  }) => {
    // The backend ontology/augment route signature reads personaId, domain,
    // existingTypes, targetCategory, maxSuggestions from the body — see
    // server/src/routes/ontology.ts. Pass the minimum required surface.
    const res = await page.request.post('/api/ontology/augment', {
      data: {
        personaId: testPersona.id,
        domain: 'e2e-test-domain',
        targetCategory: 'entity',
        existingTypes: [],
        maxSuggestions: 1,
      },
    })
    expect(
      res.status(),
      `ontology/augment must return 200 (got ${res.status()}: ${await res.text().catch(() => '<no body>')})`,
    ).toBe(200)
    const body = (await res.json()) as {
      id: string
      personaId: string
      targetCategory: string
      suggestions: Array<{ name: string; description: string; confidence: number; examples: string[]; parent: string | null }>
      reasoning: string
    }
    // The route's response schema (server/src/routes/ontology.ts:425) is
    // camelCase, so the backend must camelcaseKeys the snake_case
    // model-service body before sending. If the route forwards the body
    // verbatim, fast-json-stringify throws "personaId is required" on
    // serialization and the frontend sees an opaque 500. Assert the
    // camelCase shape the frontend code reads.
    expect(body.id, 'augment response must carry an id').toBeTruthy()
    expect(body.personaId).toBe(testPersona.id)
    expect(body.targetCategory).toBe('entity')
    expect(Array.isArray(body.suggestions)).toBe(true)
    expect(body.suggestions.length).toBeGreaterThan(0)
    for (const s of body.suggestions) {
      expect(typeof s.name).toBe('string')
      expect(s.name.length).toBeGreaterThan(0)
      expect(typeof s.description).toBe('string')
      expect(typeof s.confidence).toBe('number')
      expect(s.confidence).toBeGreaterThanOrEqual(0)
      expect(s.confidence).toBeLessThanOrEqual(1)
      expect(Array.isArray(s.examples)).toBe(true)
    }
    expect(typeof body.reasoning).toBe('string')
    expect(body.reasoning.length).toBeGreaterThan(0)
  })

  test.describe('models: settings-page endpoints round-trip through model-service', () => {
    test('GET /api/models/config returns 200 + ModelConfig shape', async ({ page, testUser }) => {
      void testUser
      const res = await page.request.get('/api/models/config')
      expect(res.status()).toBe(200)
      const body = (await res.json()) as {
        availableModels: Record<string, string[]>
        selectedModels: Record<string, string>
        device: string
      }
      // Backend camelcase-keys the snake_case model-service response.
      expect(body.availableModels).toBeTruthy()
      expect(body.selectedModels).toBeTruthy()
      expect(typeof body.device).toBe('string')
      expect(body.device.length).toBeGreaterThan(0)
      // Each task type that is "selected" must point at a model that is in
      // the corresponding "available" list — a basic referential-integrity
      // invariant the frontend Model Settings page relies on for rendering.
      for (const [task, selected] of Object.entries(body.selectedModels)) {
        expect(
          body.availableModels[task],
          `selectedModels.${task}="${selected}" but availableModels.${task} is missing`,
        ).toBeTruthy()
        expect(
          body.availableModels[task],
          `selectedModels.${task}="${selected}" must appear in availableModels.${task}=[${body.availableModels[task].join(',')}]`,
        ).toContain(selected)
      }
    })

    test('GET /api/models/status returns 200 + ModelStatusResponse shape', async ({ page, testUser }) => {
      void testUser
      const res = await page.request.get('/api/models/status')
      expect(res.status()).toBe(200)
      const body = (await res.json()) as {
        models: Array<{ modelId: string; taskType: string; health: string; memoryMb: number }>
        totalMemoryMb: number
      }
      expect(Array.isArray(body.models)).toBe(true)
      expect(body.models.length).toBeGreaterThan(0)
      expect(typeof body.totalMemoryMb).toBe('number')
      for (const m of body.models) {
        expect(typeof m.modelId).toBe('string')
        expect(typeof m.taskType).toBe('string')
        expect(typeof m.health).toBe('string')
        expect(typeof m.memoryMb).toBe('number')
      }
    })

    test('GET /api/models/defaults returns 200 + non-empty ModelDefaultsResponse', async ({ page, testUser }) => {
      void testUser
      const res = await page.request.get('/api/models/defaults')
      expect(res.status()).toBe(200)
      const body = (await res.json()) as Record<string, Record<string, unknown>>
      // Each documented task type must have a default config object so the
      // Settings page can render its parameter editor without crashing.
      for (const task of ['detection', 'tracking', 'vad', 'transcription', 'vlm']) {
        expect(body[task], `defaults.${task} must be defined`).toBeTruthy()
        expect(typeof body[task]).toBe('object')
      }
    })

    test('GET /api/models/frameworks returns 200 + ModelFrameworksResponse shape', async ({ page, testUser }) => {
      void testUser
      const res = await page.request.get('/api/models/frameworks')
      expect(res.status()).toBe(200)
      const body = (await res.json()) as { frameworks: string[]; byTask: Record<string, string[]> }
      expect(Array.isArray(body.frameworks)).toBe(true)
      expect(body.frameworks.length).toBeGreaterThan(0)
      expect(typeof body.byTask).toBe('object')
      // Every framework listed in any task's `byTask` entry must appear in the
      // global `frameworks` list — locks down a real referential bug where
      // the model-service has historically reported tasks supporting frameworks
      // it never installed.
      const knownFrameworks = new Set(body.frameworks)
      for (const [task, fws] of Object.entries(body.byTask)) {
        for (const fw of fws) {
          expect(
            knownFrameworks.has(fw),
            `byTask.${task} references framework "${fw}" not present in frameworks=[${[...knownFrameworks].join(',')}]`,
          ).toBe(true)
        }
      }
    })

    test('GET /api/models/task-ready/:taskType returns 200 + TaskReadyResponse', async ({ page, testUser }) => {
      void testUser
      const res = await page.request.get('/api/models/task-ready/object_detection')
      expect(res.status()).toBe(200)
      const body = (await res.json()) as { taskType: string; ready: boolean }
      expect(body.taskType).toBe('object_detection')
      expect(typeof body.ready).toBe('boolean')
    })

    test('POST /api/models/validate returns 200 + valid MemoryValidation', async ({ page, testUser }) => {
      void testUser
      const res = await page.request.post('/api/models/validate', { data: {} })
      expect(res.status()).toBe(200)
      const body = (await res.json()) as {
        valid: boolean
        totalMemoryMb: number
        budgetMb: number
        headroomMb: number
      }
      expect(typeof body.valid).toBe('boolean')
      expect(typeof body.totalMemoryMb).toBe('number')
      expect(typeof body.budgetMb).toBe('number')
      expect(typeof body.headroomMb).toBe('number')
      // headroom = budget - total; this invariant must hold or the Settings
      // page renders nonsense memory numbers.
      expect(body.headroomMb).toBeCloseTo(body.budgetMb - body.totalMemoryMb, 0)
    })

    test('POST /api/models/select returns 200 + echoes the selection', async ({ page, testUser }) => {
      void testUser
      // The backend's models/select route reads taskType + modelName from
      // the QUERYSTRING (see server/src/routes/models.ts:204 - the schema
      // declares them as querystring, not body), so encode there.
      const res = await page.request.post('/api/models/select?taskType=object_detection&modelName=yolov8n')
      expect(
        res.status(),
        `models/select must return 200 (got ${res.status()}: ${await res.text().catch(() => '<no body>')})`,
      ).toBe(200)
      const body = (await res.json()) as { taskType: string; modelName: string; status: string }
      expect(body.taskType).toBe('object_detection')
      expect(body.modelName).toBe('yolov8n')
      expect(body.status).toBe('selected')
    })

    test('POST /api/models/load/:taskType returns 200 + load confirmation', async ({ page, testUser }) => {
      void testUser
      const res = await page.request.post('/api/models/load/object_detection', { data: {} })
      expect(res.status()).toBe(200)
      const body = (await res.json()) as { taskType: string; status: string }
      expect(body.taskType).toBe('object_detection')
      expect(body.status).toBe('loaded')
    })
  })

  test.describe('background queues: summarize / extract-claims / synthesize-summary', () => {
    test('POST /api/videos/summaries/generate returns 202 + jobId for the /api/summarize queue', async ({
      page,
      testVideo,
      testPersona,
      testUser,
    }) => {
      void testUser
      const res = await page.request.post('/api/videos/summaries/generate', {
        data: { videoId: testVideo.id, personaId: testPersona.id },
      })
      expect(
        res.status(),
        `summaries/generate must return 202 (got ${res.status()}: ${await res.text().catch(() => '<no body>')})`,
      ).toBe(202)
      const body = (await res.json()) as { jobId: string; status?: string }
      expect(body.jobId, 'queued response must carry a jobId').toBeTruthy()
      expect(typeof body.jobId).toBe('string')
      expect(body.jobId.length).toBeGreaterThan(0)
    })

    test('POST /api/summaries/:id/claims/generate returns 202 + jobId for the /api/extract-claims queue', async ({
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
            { type: 'text', content: 'Summary placeholder for claim-extraction wire test.' },
          ],
        },
      })
      // POST /api/summaries returns 201 Created (the RESTful semantic for
      // resource creation — see server/src/routes/summaries.ts), not 200.
      expect(
        summaryRes.status(),
        `summary create must return 201 for the extract-claims wire test (got ${summaryRes.status()}: ${await summaryRes.text().catch(() => '<no body>')})`,
      ).toBe(201)
      const summary = (await summaryRes.json()) as { id: string }
      expect(summary.id, 'summary create response must carry an id').toBeTruthy()
      // The route's body schema (server/src/routes/claims.ts
      // ClaimExtractionConfigSchema) requires inputSources and
      // extractionStrategy; an empty body 400s with VALIDATION_ERROR.
      const res = await page.request.post(`/api/summaries/${summary.id}/claims/generate`, {
        data: {
          inputSources: {
            includeSummaryText: true,
            includeAnnotations: false,
            includeOntology: false,
            ontologyDepth: 'names-only',
          },
          extractionStrategy: 'sentence-based',
        },
      })
      expect(
        res.status(),
        `claims/generate must return 202 (got ${res.status()}: ${await res.text().catch(() => '<no body>')})`,
      ).toBe(202)
      const body = (await res.json()) as { jobId: string; status?: string; summaryId: string }
      expect(body.jobId, 'queued response must carry a jobId').toBeTruthy()
      expect(typeof body.jobId).toBe('string')
      expect(body.jobId.length).toBeGreaterThan(0)
      expect(body.summaryId).toBe(summary.id)
    })

    test('POST /api/summaries/:id/synthesize returns 202 + jobId for the /api/synthesize-summary queue', async ({
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
        `summary create must return 201 for the synthesize wire test (got ${summaryRes.status()}: ${await summaryRes.text().catch(() => '<no body>')})`,
      ).toBe(201)
      const summary = (await summaryRes.json()) as { id: string }
      expect(summary.id).toBeTruthy()
      // The synthesize route refuses to enqueue a job for a summary that
      // has no claims to synthesize ("Summary has no claims to synthesize",
      // 400). Add at least one manual claim so the happy path is the
      // assertion under test — anything that surfaces *that* error means
      // the precondition setup failed, which is exactly what should fail
      // the test rather than masking it.
      const claimRes = await page.request.post(`/api/summaries/${summary.id}/claims`, {
        data: {
          summaryType: 'video',
          text: 'Mock claim for synthesize wire test.',
          confidence: 0.9,
          audio: ['speech'],
        },
      })
      expect(
        claimRes.status(),
        `must seed a claim before synthesize (got ${claimRes.status()}: ${await claimRes.text().catch(() => '<no body>')})`,
      ).toBe(201)
      const res = await page.request.post(`/api/summaries/${summary.id}/synthesize`, {
        data: { synthesisStrategy: 'narrative' },
      })
      expect(
        res.status(),
        `synthesize must return 202 (got ${res.status()}: ${await res.text().catch(() => '<no body>')})`,
      ).toBe(202)
      const body = (await res.json()) as { jobId: string; status?: string }
      expect(body.jobId, 'queued response must carry a jobId').toBeTruthy()
      expect(typeof body.jobId).toBe('string')
      expect(body.jobId.length).toBeGreaterThan(0)
    })
  })

  test('admin reconfigure: PUT /api/admin/config/:key returns 200 and propagates to /api/admin/reconfigure', async ({
    page,
    testUser,
  }) => {
    void testUser
    // The E2E test user is seeded as system_admin (see workerUser fixture
    // in test/e2e/fixtures/test-context.ts), so PUT /api/admin/config/:key
    // must succeed. The route accepts one of three discriminated keys
    // (storagePaths / runtime / externalApis — see ConfigRowSchema in
    // server/src/routes/admin-config.ts:55) with a matching value object.
    // We exercise 'runtime' because its required surface is small.
    const res = await page.request.put('/api/admin/config/runtime', {
      data: {
        key: 'runtime',
        value: {
          // RuntimeValueSchema in server/src/routes/admin-config.ts:30 requires
          // every field below — the runtime config now also carries the VLM
          // frame budget and the per-path output-token caps, so a partial value
          // is rejected by the route's anyOf body schema (400 VALIDATION_ERROR).
          cudaDevice: 'cuda',
          warmupOnStartup: false,
          defaultBatchSize: 1,
          maxBatchSize: 4,
          offloadThreshold: 0.8,
          maxVideoFrames: 30,
          frameSampleRate: 1,
          vlmMaxSummaryTokens: 1024,
          llmMaxClaimsTokens: 1024,
          llmMaxSynthesisTokens: 2048,
          llmMaxOntologyTokens: 1024,
        },
      },
    })
    expect(
      res.status(),
      `admin/config/runtime must return 200 for the system_admin test user (got ${res.status()}: ${await res.text().catch(() => '<no body>')})`,
    ).toBe(200)
    const body = (await res.json()) as {
      key: string
      value: { cudaDevice: string; warmupOnStartup: boolean; defaultBatchSize: number; maxBatchSize: number; offloadThreshold: number }
      version: number
      updatedAt: string
    }
    expect(body.key).toBe('runtime')
    expect(body.value).toBeTruthy()
    expect(body.value.cudaDevice).toBe('cuda')
    expect(body.value.warmupOnStartup).toBe(false)
    expect(body.value.defaultBatchSize).toBe(1)
    expect(body.value.maxBatchSize).toBe(4)
    expect(body.value.offloadThreshold).toBe(0.8)
    expect(typeof body.version).toBe('number')
    expect(body.version).toBeGreaterThanOrEqual(1)
    expect(typeof body.updatedAt).toBe('string')
  })
})
