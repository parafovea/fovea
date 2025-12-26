import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { loginSuccess, logoutSuccess, setLoading, setConfig, AppConfig } from '../../store/userSlice.js'
import { AppDispatch } from '../../store/store.js'

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
  const dispatch = useDispatch<AppDispatch>()

  useEffect(() => {
    const checkSession = async () => {
      dispatch(setLoading(true))
      try {
        // Fetch config first to determine mode
        const configResponse = await fetch('/api/config', { credentials: 'include' })
        if (configResponse.ok) {
          const apiConfig = await configResponse.json()
          dispatch(setConfig(parseConfig(apiConfig)))
        }

        // Then check session
        const response = await fetch('/api/auth/me', { credentials: 'include' })
        if (response.ok) {
          const { user } = await response.json()
          dispatch(loginSuccess(user))
        } else {
          dispatch(logoutSuccess())
        }
      } catch (error) {
        console.error('Session check error:', error)
        dispatch(logoutSuccess())
      }
    }

    checkSession()
  }, [dispatch])
}
