/**
 * Wikidata/Wikibase configuration service.
 *
 * Provides endpoint URL configuration with the following priority:
 * 1. VITE_WIKIDATA_URL build-time environment variable
 * 2. Runtime config from /api/config endpoint
 * 3. Default public Wikidata API
 */

/** Default public Wikidata API endpoint */
const DEFAULT_WIKIDATA_URL = 'https://www.wikidata.org/w/api.php'

/** Module-level cache for runtime config */
let runtimeConfig: WikidataConfig | null = null
let configPromise: Promise<WikidataConfig> | null = null

/**
 * Configuration for Wikidata/Wikibase connection.
 */
export interface WikidataConfig {
  /** API endpoint URL */
  url: string
  /** Mode indicating online (public Wikidata) or offline (local Wikibase) */
  mode: 'online' | 'offline'
  /**
   * ID mapping from Wikidata IDs to local Wikibase IDs.
   * Only present in offline mode.
   */
  idMapping?: Record<string, string> | null
  /**
   * Whether external links to public Wikidata are allowed.
   * True in online mode, false in offline mode.
   */
  allowExternalLinks: boolean
}

/**
 * Fetches Wikidata configuration from backend /api/config endpoint.
 * Results are cached after first fetch.
 */
async function fetchRuntimeConfig(): Promise<WikidataConfig> {
  if (runtimeConfig) {
    return runtimeConfig
  }

  if (configPromise) {
    return configPromise
  }

  configPromise = (async () => {
    try {
      const response = await fetch('/api/config', { credentials: 'include' })
      if (response.ok) {
        const config = await response.json()
        const mode = config.wikidata?.mode || 'online'
        runtimeConfig = {
          url: config.wikidata?.url || DEFAULT_WIKIDATA_URL,
          mode,
          idMapping: config.wikidata?.idMapping || null,
          allowExternalLinks: config.wikidata?.allowExternalLinks ?? mode === 'online',
        }
        return runtimeConfig
      }
    } catch (error) {
      console.warn('Failed to fetch Wikidata config from backend, using defaults:', error)
    }

    // Fallback to defaults (online mode always allows external links)
    runtimeConfig = { url: DEFAULT_WIKIDATA_URL, mode: 'online', idMapping: null, allowExternalLinks: true }
    return runtimeConfig
  })()

  return configPromise
}

/**
 * Gets the Wikidata API endpoint URL.
 *
 * Priority:
 * 1. VITE_WIKIDATA_URL environment variable (build-time)
 * 2. Runtime config from /api/config endpoint
 * 3. Default public Wikidata API
 *
 * @returns Promise resolving to the Wikidata API URL
 */
export async function getWikidataUrl(): Promise<string> {
  // Build-time env var takes precedence
  const envUrl = import.meta.env.VITE_WIKIDATA_URL
  if (envUrl) {
    return envUrl
  }

  // Fall back to runtime config
  const config = await fetchRuntimeConfig()
  return config.url
}

/**
 * Gets the Wikidata mode (online/offline).
 *
 * Priority:
 * 1. VITE_WIKIDATA_MODE environment variable (build-time)
 * 2. Runtime config from /api/config endpoint
 * 3. Default 'online'
 *
 * @returns Promise resolving to the Wikidata mode
 */
export async function getWikidataMode(): Promise<'online' | 'offline'> {
  // Build-time env var takes precedence
  const envMode = import.meta.env.VITE_WIKIDATA_MODE
  if (envMode === 'online' || envMode === 'offline') {
    return envMode
  }

  // Fall back to runtime config
  const config = await fetchRuntimeConfig()
  return config.mode
}

/**
 * Gets the full Wikidata configuration.
 * Useful for components that need both URL and mode.
 *
 * @returns Promise resolving to WikidataConfig
 */
export async function getWikidataConfig(): Promise<WikidataConfig> {
  const envUrl = import.meta.env.VITE_WIKIDATA_URL
  const envMode = import.meta.env.VITE_WIKIDATA_MODE

  // If both env vars are set, use them directly (but still fetch for idMapping and allowExternalLinks)
  if (envUrl && (envMode === 'online' || envMode === 'offline')) {
    // For offline mode, we still need the ID mapping and allowExternalLinks from runtime config
    if (envMode === 'offline') {
      const runtimeCfg = await fetchRuntimeConfig()
      return {
        url: envUrl,
        mode: envMode,
        idMapping: runtimeCfg.idMapping,
        allowExternalLinks: runtimeCfg.allowExternalLinks,
      }
    }
    // Online mode always allows external links
    return { url: envUrl, mode: envMode, idMapping: null, allowExternalLinks: true }
  }

  // Otherwise fetch runtime config and merge with any env vars
  const runtimeCfg = await fetchRuntimeConfig()
  return {
    url: envUrl || runtimeCfg.url,
    mode: (envMode as 'online' | 'offline') || runtimeCfg.mode,
    idMapping: runtimeCfg.idMapping,
    allowExternalLinks: runtimeCfg.allowExternalLinks,
  }
}

/**
 * Gets the base URL for Wikidata/Wikibase wiki links.
 * Derives from the API URL by removing '/w/api.php' suffix.
 *
 * @returns Promise resolving to the base wiki URL
 */
export async function getWikidataBaseUrl(): Promise<string> {
  const apiUrl = await getWikidataUrl()
  // Remove /w/api.php suffix to get base URL
  return apiUrl.replace(/\/w\/api\.php$/, '')
}

/**
 * Gets the ID mapping from Wikidata IDs to local Wikibase IDs.
 * Returns null if not in offline mode or mapping not available.
 *
 * @returns Promise resolving to the ID mapping or null
 */
export async function getIdMapping(): Promise<Record<string, string> | null> {
  const config = await getWikidataConfig()
  return config.idMapping || null
}

/**
 * Gets the local Wikibase ID for a given Wikidata ID.
 * Returns the original ID if not in offline mode or no mapping exists.
 *
 * @param wikidataId The original Wikidata entity ID (e.g., "Q42")
 * @returns Promise resolving to the local Wikibase ID or the original ID
 */
export async function getLocalWikibaseId(wikidataId: string): Promise<string> {
  const mapping = await getIdMapping()
  return mapping?.[wikidataId] || wikidataId
}

/**
 * Gets the reverse ID mapping from local Wikibase IDs to Wikidata IDs.
 * Returns null if not in offline mode or mapping not available.
 *
 * @returns Promise resolving to the reverse ID mapping or null
 */
export async function getReverseIdMapping(): Promise<Record<string, string> | null> {
  const mapping = await getIdMapping()
  if (!mapping) return null

  const reverse: Record<string, string> = {}
  for (const [wikidataId, localId] of Object.entries(mapping)) {
    reverse[localId] = wikidataId
  }
  return reverse
}

/**
 * Gets the Wikidata ID for a given local Wikibase ID.
 * Returns the original ID if not in offline mode or no mapping exists.
 *
 * @param localId The local Wikibase entity ID
 * @returns Promise resolving to the Wikidata ID or the original ID
 */
export async function getWikidataIdFromLocal(localId: string): Promise<string> {
  const reverseMapping = await getReverseIdMapping()
  return reverseMapping?.[localId] || localId
}

/**
 * Gets whether external Wikidata links are allowed.
 * In online mode, always true. In offline mode, controlled by admin.
 *
 * @returns Promise resolving to whether external Wikidata links are allowed
 */
export async function getAllowExternalWikidataLinks(): Promise<boolean> {
  const config = await getWikidataConfig()
  return config.allowExternalLinks
}

/**
 * Resets the cached configuration.
 * Useful for testing.
 */
export function resetWikidataConfigCache(): void {
  runtimeConfig = null
  configPromise = null
}
