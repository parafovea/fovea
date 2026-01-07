import { useEffect } from 'react'
import { useAuthStore, AppConfig } from '../../store/zustand/authStore.js'

/** Default Wikidata API URL */
const DEFAULT_WIKIDATA_URL = 'https://www.wikidata.org/w/api.php'

/**
 * Parses API config response into AppConfig with defaults.
 */
function parseConfig(apiConfig: Record<string, unknown>): AppConfig {
  const mode = (apiConfig.mode as 'single-user' | 'multi-user') || 'single-user'
  const wikidataMode = (apiConfig.wikidata as Record<string, unknown>)?.mode as 'online' | 'offline' || 'online'

  return {
    mode,
    allowRegistration: Boolean(apiConfig.allowRegistration),
    wikidata: {
      mode: wikidataMode,
      url: ((apiConfig.wikidata as Record<string, unknown>)?.url as string) || DEFAULT_WIKIDATA_URL,
      idMapping: ((apiConfig.wikidata as Record<string, unknown>)?.idMapping as Record<string, string>) || null,
      allowExternalLinks: ((apiConfig.wikidata as Record<string, unknown>)?.allowExternalLinks as boolean) ?? wikidataMode === 'online',
    },
    externalLinks: {
      wikidata: ((apiConfig.externalLinks as Record<string, unknown>)?.wikidata as boolean) ?? true,
      videoSources: ((apiConfig.externalLinks as Record<string, unknown>)?.videoSources as boolean) ?? true,
    },
  }
}

/**
 * Session restoration hook.
 * Checks for existing session on mount and restores authentication state.
 * Also fetches application config to determine mode.
 * Call this hook in the root App component.
 */
export function useSession(): void {
  const setLoading = useAuthStore(state => state.setLoading)
  const setConfig = useAuthStore(state => state.setConfig)
  const loginSuccess = useAuthStore(state => state.loginSuccess)
  const logoutSuccess = useAuthStore(state => state.logoutSuccess)

  useEffect(() => {
    const checkSession = async () => {
      setLoading(true)
      try {
        // Fetch config first to determine mode
        const configResponse = await fetch('/api/config', { credentials: 'include' })
        if (configResponse.ok) {
          const apiConfig = await configResponse.json()
          setConfig(parseConfig(apiConfig))
        }

        // Then check session
        const response = await fetch('/api/auth/me', { credentials: 'include' })
        if (response.ok) {
          const { user } = await response.json()
          loginSuccess(user)
        } else {
          logoutSuccess()
        }
      } catch (error) {
        console.error('Session check error:', error)
        logoutSuccess()
      }
    }

    checkSession()
  }, [setLoading, setConfig, loginSuccess, logoutSuccess])
}
