/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API URL */
  readonly VITE_API_URL?: string
  /** Model service URL */
  readonly VITE_MODEL_SERVICE_URL?: string
  /** Enable test data mode */
  readonly VITE_ENABLE_TEST_DATA?: string
  /** Wikidata/Wikibase API endpoint URL */
  readonly VITE_WIKIDATA_URL?: string
  /** Wikidata mode: 'online' for public Wikidata, 'offline' for local Wikibase */
  readonly VITE_WIKIDATA_MODE?: 'online' | 'offline'
  /** Expose window.__foveaTour handle for E2E tour engine specs. */
  readonly VITE_E2E?: string
  /** Axios per-call timeout (ms) for model-service-bound requests. */
  readonly VITE_INFERENCE_TIMEOUT_MS?: string
  /** Enable MSW tour-demo mocking of the six model-service routes. */
  readonly VITE_TOUR_DEMO?: string
  /** Mount the public TourCataloguePage at `/` (demo.fovea.video). */
  readonly VITE_DEMO_PUBLIC?: string
  /** Mount the legacy DemoShell wrapper (older cvpr-demo path). */
  readonly VITE_FOVEA_DEMO_MODE?: string
  /** Seed token required by the backend's fixture-seed endpoint. */
  readonly VITE_FOVEA_DEMO_SEED_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Raw text imports — Vite's ?raw query suffix yields the file contents
// as a string. Used by the demo attribution page to embed
// docs/demo-attribution.md at build time so the doc stays in one place.
declare module '*.md?raw' {
  const content: string
  export default content
}
