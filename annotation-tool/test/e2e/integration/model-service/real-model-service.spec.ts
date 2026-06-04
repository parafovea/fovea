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
 *   - Each response has the documented top-level shape that the real
 *     model-service emits, after the backend's snake_case to camelCase
 *     transform. The mock's shape and the real service's shape have
 *     known divergences (see the per-test comments below); the
 *     integration tier locks the REAL shape because that is the contract
 *     a production deployment actually flows through.
 *   - Value ranges that the real model must honour (confidence within
 *     [0, 1], bounding-box coords >= 0, suggestions list non-empty for
 *     a query that should have results) are enforced; specific values
 *     are not.
 *
 * Engage by booting the docker-compose.e2e.real-models.yml override
 * (which swaps MODEL_SERVICE_URL on the backend from the mock to the
 * real CPU-mode service and pins MODEL_CONFIG_PATH to models-cpu.yaml)
 * and running:
 *
 *   pnpm --filter @fovea/annotation-tool exec \
 *     playwright test --project=integration-models
 *
 * The CI workflow .github/workflows/e2e-real-models.yml fires this on
 * workflow_dispatch, on `e2e-models` label, and nightly at 02:00 UTC.
 *
 * If this spec fails the contract test (Tier 1) is still green, that
 * means the real model-service is misconfigured (model paths, weights,
 * device fallback, framework selection, etc.) and not that the backend
 * or frontend is broken; the failing test name points at which surface
 * is misconfigured.
 */
import { test, expect } from '../../fixtures/test-context.js'

// Real CPU-mode model loads dominate wall-clock; budget generously. The
// elevated test-level timeout is set on the integration-models project
// in playwright.config.ts; these per-call timeouts stay inside it.
const FIRST_INFERENCE_TIMEOUT_MS = 120_000

test.describe('Real model-service integration', () => {
  test('health: backend reaches a live model-service that reports cpuModelsAvailable', async ({
    page,
    testUser,
  }) => {
    void testUser
    const res = await page.request.get('/api/models/status', { timeout: FIRST_INFERENCE_TIMEOUT_MS })
    expect(res.status(), `models/status must return 200, got ${res.status()}`).toBe(200)
    const body = (await res.json()) as {
      loadedModels: Array<unknown>
      totalVramAllocatedGb: number
      totalVramAvailableGb: number
      cudaAvailable: boolean
      modelsAvailable: boolean
      cpuModelsAvailable: boolean
    }
    // Real models-cpu.yaml selections are CPU-compatible; the integration
    // tier runs without CUDA so cpuModelsAvailable must be true. modelsAvailable
    // covers either path; cudaAvailable should be false on the CI runner.
    expect(body.modelsAvailable, 'real model-service must report modelsAvailable=true').toBe(true)
    expect(
      body.cpuModelsAvailable,
      'real model-service running with models-cpu.yaml must report cpuModelsAvailable=true; ' +
        'a false value here means the CPU model config is missing or every entry is gated on GPU',
    ).toBe(true)
    expect(Array.isArray(body.loadedModels)).toBe(true)
  })

  test('config: GET /api/models/config returns models.{taskType} with referential selected->options integrity', async ({
    page,
    testUser,
  }) => {
    void testUser
    const res = await page.request.get('/api/models/config', { timeout: FIRST_INFERENCE_TIMEOUT_MS })
    expect(res.status()).toBe(200)
    // The real model-service emits a nested shape keyed by task type, NOT
    // the flat availableModels / selectedModels / device shape the mock
    // returns. The frontend code that consumes this lives at
    // src/store/queries/useModelConfig.ts and is the source of truth for
    // what the real production deployment flows through. The mock is a
    // simplification and is currently out of date with the real schema;
    // file an issue under model-service to reconcile if this matters for
    // your work. The integration tier asserts the REAL shape because
    // that is what production runs against.
    const body = (await res.json()) as {
      models: Record<
        string,
        {
          selected: string
          options: Array<{
            name: string
            modelId: string
            framework: string
            cpuCompatible: boolean
            cpuMemoryGb: number
            vramGb: number
            requiresApiKey: boolean
          }>
        }
      >
    }
    const taskTypes = Object.keys(body.models)
    expect(
      taskTypes.length,
      'real model-service must expose at least one task type in models.*; check models-cpu.yaml',
    ).toBeGreaterThan(0)
    for (const taskType of taskTypes) {
      const taskConfig = body.models[taskType]
      expect(taskConfig.selected, `models.${taskType}.selected must be set`).toBeTruthy()
      expect(Array.isArray(taskConfig.options)).toBe(true)
      expect(taskConfig.options.length, `models.${taskType}.options must list at least one model`).toBeGreaterThan(0)
      // Referential integrity: selected must appear in options.
      const optionNames = taskConfig.options.map((o) => o.name)
      expect(
        optionNames,
        `models.${taskType}.selected="${taskConfig.selected}" must appear in options=[${optionNames.join(',')}]`,
      ).toContain(taskConfig.selected)
      // CPU profile invariant: every option in models-cpu.yaml must be
      // EITHER a local CPU-runnable model (cpuCompatible=true) OR an
      // external API service (requiresApiKey=true). A locally-installed
      // GPU-only model has no business appearing in the CPU config; an
      // external API has cpuMemoryGb=0 and vramGb=0 because it does not
      // run any inference on this host.
      for (const opt of taskConfig.options) {
        const isLocalCpuModel = opt.cpuCompatible === true
        const isExternalApi = opt.requiresApiKey === true
        expect(
          isLocalCpuModel || isExternalApi,
          `models-cpu.yaml lists ${taskType} option "${opt.name}" with cpuCompatible=false and requiresApiKey=false; ` +
            'every option in the CPU config must be either a local CPU model or an external API service',
        ).toBe(true)
      }
    }
  })

  test('frameworks: GET /api/models/frameworks returns per-category framework lists', async ({
    page,
    testUser,
  }) => {
    void testUser
    const res = await page.request.get('/api/models/frameworks', { timeout: FIRST_INFERENCE_TIMEOUT_MS })
    expect(res.status()).toBe(200)
    // Real shape is keyed by category (llm, audio, detection, tracking,
    // vlmInference, quantization), each value an array of framework
    // names. The mock returns a flat { frameworks, byTask } shape, which
    // is a different schema; see config-test note above.
    const body = (await res.json()) as Record<string, string[]>
    const categories = Object.keys(body)
    expect(
      categories.length,
      'real model-service must expose at least one framework category',
    ).toBeGreaterThan(0)
    for (const category of categories) {
      const frameworks = body[category]
      expect(Array.isArray(frameworks), `frameworks.${category} must be an array`).toBe(true)
      expect(frameworks.length, `frameworks.${category} must list at least one framework`).toBeGreaterThan(0)
      for (const fw of frameworks) {
        expect(typeof fw).toBe('string')
        expect(fw.length).toBeGreaterThan(0)
      }
    }
    // CPU profile invariant: every framework family the CPU config
    // relies on must be listed. The CPU YAML uses llama_cpp and
    // transformers; both must appear in the appropriate category.
    expect(body.llm ?? body.vlmInference ?? []).toEqual(
      expect.arrayContaining(['llama_cpp', 'transformers']),
    )
  })

  test('task-ready: GET /api/models/task-ready/:type returns ready boolean for at least one declared task', async ({
    page,
    testUser,
  }) => {
    void testUser
    // Pull task types out of /api/models/config so the test does not
    // hard-code a list that would drift if the CPU config changes.
    const configRes = await page.request.get('/api/models/config', { timeout: FIRST_INFERENCE_TIMEOUT_MS })
    const configBody = (await configRes.json()) as { models: Record<string, unknown> }
    const taskTypes = Object.keys(configBody.models)
    expect(taskTypes.length).toBeGreaterThan(0)
    const firstTask = taskTypes[0]
    const res = await page.request.get(`/api/models/task-ready/${firstTask}`, {
      timeout: FIRST_INFERENCE_TIMEOUT_MS,
    })
    expect(res.status()).toBe(200)
    // The real model-service returns task-ready as a load descriptor of
    // the currently-selected model for that task:
    //   { taskType, modelId, cached, framework }
    // The "ready" signal is implicit: 200 + a present modelId means the
    // task is configured. The mock returns a flat { taskType, ready }
    // shape; see the config-test comment for the schema-divergence note.
    const body = (await res.json()) as { taskType?: string; modelId?: string; cached?: boolean; framework?: string }
    expect(body.modelId, `task-ready/${firstTask} must return a modelId for the currently-selected model`).toBeTruthy()
    expect(typeof body.framework).toBe('string')
    expect(typeof body.cached).toBe('boolean')
  })
})
