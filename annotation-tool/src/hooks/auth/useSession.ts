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

    const fetchConfigWithRetry = async (): Promise<void> => {
      // Retry /api/config with bounded exponential backoff so a
      // transient failure (heavy load, network blip) does not leave
      // the auth store with `appConfig: null` indefinitely — the
      // ProtectedRoute holds the loading screen until appConfig
      // resolves, so this retry loop is what guarantees the user
      // eventually reaches either the login page (multi-user) or the
      // protected content (single-user) instead of getting stuck or,
      // worse, falling through to the mode='single-user' default and
      // seeing a Video Browser shell (issue #92).
      const delays = [500, 1000, 2000, 4000, 8000]
      for (let i = 0; i <= delays.length; i++) {
        if (cancelled) return
        try {
          const configResponse = await fetch('/api/config', { credentials: 'include' })
          if (configResponse.ok) {
            const apiConfig = await configResponse.json()
            if (!cancelled) setConfig(parseConfig(apiConfig))
            return
          }
          // Non-2xx is treated as a transient failure for retry purposes;
          // a truly broken server will exhaust the budget below.
        } catch (error) {
          console.warn(`[useSession] /api/config attempt ${i + 1} failed:`, error)
        }
        if (i < delays.length) {
          await new Promise((resolve) => setTimeout(resolve, delays[i]))
        }
      }
      console.error('[useSession] /api/config failed after all retries; user remains on loading screen')
    }

    const checkSession = async () => {
      setLoading(true)
      try {
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
        if (!cancelled) setLoading(false)
      }
    }

    checkSession()
    return () => {
      cancelled = true
    }
  }, [setLoading, setConfig, loginSuccess, logoutSuccess])
}
