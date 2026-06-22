/**
 * Single source of truth for every frontend environment-derived setting.
 *
 * This is the ONLY module in `annotation-tool/src` permitted to read
 * `import.meta.env`. An ESLint `no-restricted-syntax` rule bans
 * `import.meta.env` everywhere else and points offenders here, so a reader
 * can answer "what does this build do when `VITE_X` is unset?" by looking in
 * exactly one place.
 *
 * Why module-eval constants (not lazy getters): Vite inlines every `VITE_*`
 * reference and the Vite built-ins (`PROD`, `DEV`, `MODE`, `BASE_URL`) at
 * BUILD time, replacing each `import.meta.env.X` with a literal. There is no
 * runtime env to re-read, so the values are computed once here as plain
 * constants. This also means `config` is fully populated at import, before
 * any side effect runs, so it is safe to import first in `main.tsx` and to
 * read at module scope (e.g. `App.tsx` reads `config.deploymentMode.publicBooth`
 * as a module-level const).
 *
 * No side effects on import: importing this module only reads inlined
 * literals; it starts no workers, opens no sockets, and mutates no globals.
 *
 * One read deliberately stays OUT of this module: the MSW tour-demo
 * dynamic-import guard `import.meta.env.VITE_TOUR_DEMO === '1'` in
 * `main.tsx` and `mocks/tourDemo/browser.ts` is kept inline so Rollup can
 * statically fold it and tree-shake the entire `src/mocks/tourDemo` subtree
 * out of normal production builds. Routing that specific comparison through a
 * cross-module property access would defeat the static analysis and ship the
 * mocks (and their tour content) in every bundle. The same boolean is also
 * exposed here as `config.deploymentMode.tourDemoMocksBuilt` for any
 * non-tree-shaking-critical reference.
 *
 * @module
 */

/**
 * Deployment-mode taxonomy.
 *
 * - `legacy-demo-shell`: the older cvpr-demo path; mounts `<DemoShell/>` and
 *   short-circuits the normal app tree. Gated by `VITE_FOVEA_DEMO_MODE`.
 * - `public-demo`: the public catalogue deployment (demo.fovea.video) that
 *   mounts `TourCataloguePage` at `/` and talks to a real backend. Gated by
 *   `VITE_DEMO_PUBLIC=1`.
 * - `tour-demo`: a build that compiled in the MSW mock-model-service subtree
 *   (`VITE_TOUR_DEMO=1`) without `VITE_DEMO_PUBLIC` (E2E / local preview).
 * - `normal`: a stock self-hosted build with none of the above set.
 */
export type DeploymentModeKind =
  | 'normal'
  | 'public-demo'
  | 'tour-demo'
  | 'legacy-demo-shell'

/**
 * Vite's built-in environment flags, mirrored as a typed namespace.
 *
 * `isProd`/`isDev` come from Vite's `PROD`/`DEV`; `mode` is the Vite mode
 * string (`'production'`, `'development'`, `'test'`, ...); `baseUrl` is the
 * app's public base path used to resolve the MSW service-worker URL.
 */
export interface EnvConfig {
  /** True in a production build (`import.meta.env.PROD`). */
  readonly isProd: boolean
  /** True in a development build (`import.meta.env.DEV`). */
  readonly isDev: boolean
  /** The Vite mode string (`import.meta.env.MODE`). */
  readonly mode: string
  /** The app's public base path (`import.meta.env.BASE_URL`). */
  readonly baseUrl: string
}

/** Backend API client configuration. */
export interface ApiConfig {
  /**
   * Base URL for the API client. Empty string means relative URLs, which
   * work with the Vite dev proxy and same-origin production serving.
   */
  readonly url: string
  /**
   * Per-call axios timeout (ms) for model-service-bound requests. Defaults
   * to 60000 when `VITE_INFERENCE_TIMEOUT_MS` is unset or non-positive.
   */
  readonly inferenceTimeoutMs: number
}

/** Build-time Wikidata/Wikibase overrides. */
export interface WikidataConfig {
  /**
   * `VITE_WIKIDATA_URL`, or undefined when unset. When set, takes precedence
   * over the runtime `/api/config` value in `services/wikidataConfig.ts`.
   */
  readonly url: string | undefined
  /**
   * `VITE_WIKIDATA_MODE` narrowed to `'online'`/`'offline'`, or undefined
   * when unset or not one of those two literals.
   */
  readonly mode: 'online' | 'offline' | undefined
}

/**
 * Resolved deployment mode plus the raw flags it derives from.
 *
 * Precedence (documented because the flags interact):
 *   - `legacyDemoShell` short-circuits the whole app tree (`main.tsx` mounts
 *     `<DemoShell/>` and nothing else), so it wins when set.
 *   - Otherwise `publicBooth` (`VITE_DEMO_PUBLIC=1`) selects `public-demo`.
 *     A public-demo build talks to a REAL backend, so it SUPPRESSES the
 *     runtime MSW worker start even when `tourDemoMocksBuilt` is also true
 *     (the override at `main.tsx`'s `maybeStartTourDemoMocking`).
 *   - Otherwise `tourDemoMocksBuilt` (`VITE_TOUR_DEMO=1`) selects `tour-demo`.
 *   - Otherwise `normal`.
 */
export interface DeploymentModeConfig {
  /** Resolved mode label per the precedence above. */
  readonly kind: DeploymentModeKind
  /** `VITE_DEMO_PUBLIC === '1'`: the public catalogue booth build. */
  readonly publicBooth: boolean
  /**
   * `VITE_TOUR_DEMO === '1'`: the MSW mock-model-service subtree was compiled
   * in. Exposed for reference only; the tree-shaking-critical guard stays
   * inline at the two MSW dynamic-import sites.
   */
  readonly tourDemoMocksBuilt: boolean
  /** `VITE_FOVEA_DEMO_MODE` is `'true'` or `'1'`: mount the legacy DemoShell. */
  readonly legacyDemoShell: boolean
  /** `VITE_E2E === '1'`: running under the Playwright E2E harness. */
  readonly e2e: boolean
}

/** Test-data seeding toggle. */
export interface TestDataConfig {
  /** `VITE_ENABLE_TEST_DATA === 'true'`: allow seeding demo/test rows. */
  readonly enabled: boolean
}

/** Legacy demo-shell secrets and toggles. */
export interface LegacyDemoConfig {
  /**
   * `VITE_FOVEA_DEMO_SEED_TOKEN`, or undefined when unset. Local-run seed
   * token forwarded as `X-Demo-Seed-Token`; production injects this header
   * at the edge instead, so it is normally unset in the browser bundle.
   */
  readonly seedToken: string | undefined
}

// ---------------------------------------------------------------------------
// Raw build-time reads. The ONLY `import.meta.env` accesses in src outside the
// two inline MSW tree-shaking guards. Each is inlined to a literal by Vite.
// ---------------------------------------------------------------------------

const rawDemoPublic = import.meta.env.VITE_DEMO_PUBLIC
const rawTourDemo = import.meta.env.VITE_TOUR_DEMO
const rawLegacyDemoMode = import.meta.env.VITE_FOVEA_DEMO_MODE
const rawE2e = import.meta.env.VITE_E2E
const rawApiUrl = import.meta.env.VITE_API_URL
const rawInferenceTimeoutMs = import.meta.env.VITE_INFERENCE_TIMEOUT_MS
const rawWikidataUrl = import.meta.env.VITE_WIKIDATA_URL
const rawWikidataMode = import.meta.env.VITE_WIKIDATA_MODE
const rawEnableTestData = import.meta.env.VITE_ENABLE_TEST_DATA
const rawSeedToken = import.meta.env.VITE_FOVEA_DEMO_SEED_TOKEN

// ---------------------------------------------------------------------------
// Coercions. Centralized so every consumer shares one interpretation.
// ---------------------------------------------------------------------------

/** Default inference timeout (ms); mirrors the backend's prod ceiling. */
const DEFAULT_INFERENCE_TIMEOUT_MS = 60_000

function resolveInferenceTimeoutMs(raw: string | undefined): number {
  if (typeof raw === 'string' && raw.length > 0) {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return DEFAULT_INFERENCE_TIMEOUT_MS
}

function resolveWikidataMode(
  raw: string | undefined,
): 'online' | 'offline' | undefined {
  return raw === 'online' || raw === 'offline' ? raw : undefined
}

const publicBooth = rawDemoPublic === '1'
const tourDemoMocksBuilt = rawTourDemo === '1'
const legacyDemoShell = rawLegacyDemoMode === 'true' || rawLegacyDemoMode === '1'
// `VITE_E2E` is normalized to the `=== '1'` form. The harness always sets
// `VITE_E2E=1`, so this agrees with the prior truthy checks while being the
// safe canonical comparison.
const e2e = rawE2e === '1'

function resolveDeploymentModeKind(): DeploymentModeKind {
  if (legacyDemoShell) return 'legacy-demo-shell'
  if (publicBooth) return 'public-demo'
  if (tourDemoMocksBuilt) return 'tour-demo'
  return 'normal'
}

/**
 * The frozen, build-time-resolved frontend configuration.
 *
 * Grouped by concern: `env` (Vite built-ins), `api`, `wikidata`,
 * `deploymentMode`, `testData`, and `demo` (legacy demo-shell secrets).
 *
 * @example
 * ```typescript
 * import { config } from '@/config'
 *
 * if (config.deploymentMode.publicBooth) {
 *   // booth-only behavior
 * }
 * const timeout = config.api.inferenceTimeoutMs
 * ```
 */
export const config = Object.freeze({
  env: Object.freeze<EnvConfig>({
    isProd: import.meta.env.PROD,
    isDev: import.meta.env.DEV,
    mode: import.meta.env.MODE,
    baseUrl: import.meta.env.BASE_URL,
  }),

  api: Object.freeze<ApiConfig>({
    url: rawApiUrl ?? '',
    inferenceTimeoutMs: resolveInferenceTimeoutMs(rawInferenceTimeoutMs),
  }),

  wikidata: Object.freeze<WikidataConfig>({
    url: rawWikidataUrl,
    mode: resolveWikidataMode(rawWikidataMode),
  }),

  deploymentMode: Object.freeze<DeploymentModeConfig>({
    kind: resolveDeploymentModeKind(),
    publicBooth,
    tourDemoMocksBuilt,
    legacyDemoShell,
    e2e,
  }),

  testData: Object.freeze<TestDataConfig>({
    enabled: rawEnableTestData === 'true',
  }),

  demo: Object.freeze<LegacyDemoConfig>({
    seedToken: rawSeedToken,
  }),
})
