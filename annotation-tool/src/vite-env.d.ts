/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API URL */
  readonly VITE_API_URL?: string
  /** Model service URL */
  readonly VITE_MODEL_SERVICE_URL?: string
  /** Data URL for video assets */
  readonly VITE_DATA_URL?: string
  /** Enable test data mode */
  readonly VITE_ENABLE_TEST_DATA?: string
  /** Wikidata/Wikibase API endpoint URL */
  readonly VITE_WIKIDATA_URL?: string
  /** Wikidata mode: 'online' for public Wikidata, 'offline' for local Wikibase */
  readonly VITE_WIKIDATA_MODE?: 'online' | 'offline'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
