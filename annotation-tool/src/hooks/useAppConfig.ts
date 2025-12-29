import { useSelector } from 'react-redux'
import { RootState } from '../store/store'
import {
  AppConfig,
  WikidataConfig,
  ExternalLinksConfig,
} from '../store/userSlice'

/** Default Wikidata API URL */
const DEFAULT_WIKIDATA_URL = 'https://www.wikidata.org/w/api.php'

/** Default config used before API response is received */
const DEFAULT_CONFIG: AppConfig = {
  mode: 'single-user',
  allowRegistration: false,
  wikidata: {
    mode: 'online',
    url: DEFAULT_WIKIDATA_URL,
    idMapping: null,
    allowExternalLinks: true,
  },
  externalLinks: {
    wikidata: true,
    videoSources: true,
  },
}

/**
 * Hook to access the full application configuration.
 * Returns the config from Redux store, or defaults if not yet loaded.
 *
 * @returns Full AppConfig object
 */
export function useAppConfig(): AppConfig {
  const appConfig = useSelector((state: RootState) => state.user.appConfig)
  return appConfig ?? DEFAULT_CONFIG
}

/**
 * Hook to access Wikidata/Wikibase configuration.
 *
 * @returns WikidataConfig object
 */
export function useWikidataConfig(): WikidataConfig {
  const config = useAppConfig()
  return config.wikidata
}

/**
 * Hook to access external links configuration.
 *
 * @returns ExternalLinksConfig object
 */
export function useExternalLinksConfig(): ExternalLinksConfig {
  const config = useAppConfig()
  return config.externalLinks
}

/**
 * Hook to check if config has been loaded from the server.
 *
 * @returns true if config is loaded, false if using defaults
 */
export function useIsConfigLoaded(): boolean {
  const appConfig = useSelector((state: RootState) => state.user.appConfig)
  return appConfig !== null
}

/**
 * Hook to get the Wikidata base URL (for entity page links).
 * Derives from the API URL by removing '/w/api.php' suffix.
 *
 * @returns Base URL for Wikidata/Wikibase wiki links
 */
export function useWikidataBaseUrl(): string {
  const { url } = useWikidataConfig()
  return url.replace(/\/w\/api\.php$/, '')
}

/**
 * Hook to get the reverse ID mapping (local Wikibase ID -> Wikidata ID).
 * Only available in offline mode with ID mapping configured.
 *
 * @returns Reverse mapping object or null
 */
export function useReverseIdMapping(): Record<string, string> | null {
  const { idMapping } = useWikidataConfig()
  if (!idMapping) return null

  const reverse: Record<string, string> = {}
  for (const [wikidataId, localId] of Object.entries(idMapping)) {
    reverse[localId] = wikidataId
  }
  return reverse
}
