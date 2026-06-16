import { useEffect } from 'react'
import { useAuthStore, AppConfig } from '@store/zustand/authStore'

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
    let cancelled = false

    // Bounded exponential backoff for /api/config. Six attempts total (one
    // immediate + five retries ≈ 15.5s of waiting). A transient 5xx on
    // /api/config must NOT silently leave appConfig null: ProtectedRoute
    // treats a null config as "deployment mode unknown" and holds the loading
    // screen, so without a retry a logged-out visitor could briefly see the
    // protected Layout under load.
    const CONFIG_RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000]

    const fetchConfigWithRetry = async (): Promise<void> => {
      for (let attempt = 0; attempt <= CONFIG_RETRY_DELAYS_MS.length; attempt++) {
        if (cancelled) return
        try {
          const configResponse = await fetch('/api/config', { credentials: 'include' })
          if (configResponse.ok) {
            const apiConfig = await configResponse.json()
            if (!cancelled) setConfig(parseConfig(apiConfig))
            return
          }
          console.warn(`/api/config returned ${configResponse.status} (attempt ${attempt + 1})`)
        } catch (error) {
          console.warn(`/api/config fetch failed (attempt ${attempt + 1})`, error)
        }

        const delay = CONFIG_RETRY_DELAYS_MS[attempt]
        if (delay === undefined) return // retries exhausted; leave appConfig null
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    const checkSession = async () => {
      setLoading(true)
      try {
        // Fetch config first to determine mode (with retry so a transient 5xx
        // does not leave the deployment mode unknown).
        await fetchConfigWithRetry()
        if (cancelled) return

        // Then check session
        const response = await fetch('/api/auth/me', { credentials: 'include' })
        if (cancelled) return
        if (response.ok) {
          const { user } = await response.json()
          loginSuccess(user)
        } else {
          logoutSuccess()
        }
      } catch (error) {
        console.error('Session check error:', error)
        if (!cancelled) logoutSuccess()
      } finally {
        // Ensure loading is set to false even if something goes wrong
        if (!cancelled) setLoading(false)
      }
    }

    checkSession()

    return () => {
      cancelled = true
    }
  }, [setLoading, setConfig, loginSuccess, logoutSuccess])
}
