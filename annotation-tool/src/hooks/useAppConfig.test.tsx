/**
 * Tests for useAppConfig hooks.
 */

import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import React from 'react'
import userSlice, { AppConfig } from '../store/userSlice'
import {
  useAppConfig,
  useWikidataConfig,
  useExternalLinksConfig,
  useIsConfigLoaded,
  useWikidataBaseUrl,
  useReverseIdMapping,
} from './useAppConfig'

/**
 * Creates a test Redux store with optional initial user state.
 */
function createTestStore(userState: Partial<{
  appConfig: AppConfig | null
}> = {}) {
  return configureStore({
    reducer: {
      user: userSlice,
    },
    preloadedState: {
      user: {
        currentUser: null,
        isAuthenticated: false,
        isLoading: false,
        mode: 'single-user' as const,
        allowRegistration: false,
        appConfig: userState.appConfig ?? null,
      },
    },
  })
}

/**
 * Creates a wrapper component for testing hooks with Redux.
 */
function createWrapper(store: ReturnType<typeof createTestStore>) {
  return ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
}

/** Sample online mode config */
const onlineConfig: AppConfig = {
  mode: 'multi-user',
  allowRegistration: true,
  wikidata: {
    mode: 'online',
    url: 'https://www.wikidata.org/w/api.php',
    idMapping: null,
    allowExternalLinks: true,
  },
  externalLinks: {
    wikidata: true,
    videoSources: true,
  },
}

/** Sample offline mode config with ID mapping */
const offlineConfig: AppConfig = {
  mode: 'single-user',
  allowRegistration: false,
  wikidata: {
    mode: 'offline',
    url: 'http://localhost:8181/w/api.php',
    idMapping: {
      Q5: 'Q1',
      Q42: 'Q2',
      Q515: 'Q3',
    },
    allowExternalLinks: false,
  },
  externalLinks: {
    wikidata: false,
    videoSources: true,
  },
}

describe('useAppConfig', () => {
  it('returns default config when appConfig is null', () => {
    const store = createTestStore({ appConfig: null })
    const { result } = renderHook(() => useAppConfig(), {
      wrapper: createWrapper(store),
    })

    expect(result.current.mode).toBe('single-user')
    expect(result.current.allowRegistration).toBe(false)
    expect(result.current.wikidata.mode).toBe('online')
    expect(result.current.wikidata.url).toBe('https://www.wikidata.org/w/api.php')
    expect(result.current.wikidata.idMapping).toBeNull()
    expect(result.current.wikidata.allowExternalLinks).toBe(true)
    expect(result.current.externalLinks.wikidata).toBe(true)
    expect(result.current.externalLinks.videoSources).toBe(true)
  })

  it('returns stored appConfig from Redux state', () => {
    const store = createTestStore({ appConfig: onlineConfig })
    const { result } = renderHook(() => useAppConfig(), {
      wrapper: createWrapper(store),
    })

    expect(result.current).toEqual(onlineConfig)
  })

  it('returns offline config when stored', () => {
    const store = createTestStore({ appConfig: offlineConfig })
    const { result } = renderHook(() => useAppConfig(), {
      wrapper: createWrapper(store),
    })

    expect(result.current.wikidata.mode).toBe('offline')
    expect(result.current.wikidata.idMapping).toEqual({
      Q5: 'Q1',
      Q42: 'Q2',
      Q515: 'Q3',
    })
  })
})

describe('useWikidataConfig', () => {
  it('returns wikidata config from appConfig', () => {
    const store = createTestStore({ appConfig: onlineConfig })
    const { result } = renderHook(() => useWikidataConfig(), {
      wrapper: createWrapper(store),
    })

    expect(result.current.mode).toBe('online')
    expect(result.current.url).toBe('https://www.wikidata.org/w/api.php')
    expect(result.current.allowExternalLinks).toBe(true)
  })

  it('returns default wikidata config when appConfig is null', () => {
    const store = createTestStore({ appConfig: null })
    const { result } = renderHook(() => useWikidataConfig(), {
      wrapper: createWrapper(store),
    })

    expect(result.current.mode).toBe('online')
    expect(result.current.url).toBe('https://www.wikidata.org/w/api.php')
    expect(result.current.idMapping).toBeNull()
  })

  it('returns offline config with ID mapping', () => {
    const store = createTestStore({ appConfig: offlineConfig })
    const { result } = renderHook(() => useWikidataConfig(), {
      wrapper: createWrapper(store),
    })

    expect(result.current.mode).toBe('offline')
    expect(result.current.url).toBe('http://localhost:8181/w/api.php')
    expect(result.current.idMapping).toEqual({
      Q5: 'Q1',
      Q42: 'Q2',
      Q515: 'Q3',
    })
    expect(result.current.allowExternalLinks).toBe(false)
  })
})

describe('useExternalLinksConfig', () => {
  it('returns external links config', () => {
    const store = createTestStore({ appConfig: onlineConfig })
    const { result } = renderHook(() => useExternalLinksConfig(), {
      wrapper: createWrapper(store),
    })

    expect(result.current.wikidata).toBe(true)
    expect(result.current.videoSources).toBe(true)
  })

  it('returns defaults when appConfig is null', () => {
    const store = createTestStore({ appConfig: null })
    const { result } = renderHook(() => useExternalLinksConfig(), {
      wrapper: createWrapper(store),
    })

    expect(result.current.wikidata).toBe(true)
    expect(result.current.videoSources).toBe(true)
  })

  it('returns disabled links in offline mode', () => {
    const store = createTestStore({ appConfig: offlineConfig })
    const { result } = renderHook(() => useExternalLinksConfig(), {
      wrapper: createWrapper(store),
    })

    expect(result.current.wikidata).toBe(false)
    expect(result.current.videoSources).toBe(true)
  })
})

describe('useIsConfigLoaded', () => {
  it('returns false when appConfig is null', () => {
    const store = createTestStore({ appConfig: null })
    const { result } = renderHook(() => useIsConfigLoaded(), {
      wrapper: createWrapper(store),
    })

    expect(result.current).toBe(false)
  })

  it('returns true when appConfig is loaded', () => {
    const store = createTestStore({ appConfig: onlineConfig })
    const { result } = renderHook(() => useIsConfigLoaded(), {
      wrapper: createWrapper(store),
    })

    expect(result.current).toBe(true)
  })
})

describe('useWikidataBaseUrl', () => {
  it('derives base URL from API URL (removes /w/api.php)', () => {
    const store = createTestStore({ appConfig: onlineConfig })
    const { result } = renderHook(() => useWikidataBaseUrl(), {
      wrapper: createWrapper(store),
    })

    expect(result.current).toBe('https://www.wikidata.org')
  })

  it('handles default Wikidata URL', () => {
    const store = createTestStore({ appConfig: null })
    const { result } = renderHook(() => useWikidataBaseUrl(), {
      wrapper: createWrapper(store),
    })

    expect(result.current).toBe('https://www.wikidata.org')
  })

  it('handles custom Wikibase URL', () => {
    const store = createTestStore({ appConfig: offlineConfig })
    const { result } = renderHook(() => useWikidataBaseUrl(), {
      wrapper: createWrapper(store),
    })

    expect(result.current).toBe('http://localhost:8181')
  })

  it('handles URL without /w/api.php suffix', () => {
    const configWithCustomUrl: AppConfig = {
      ...onlineConfig,
      wikidata: {
        ...onlineConfig.wikidata,
        url: 'https://custom.wikibase.org/api',
      },
    }
    const store = createTestStore({ appConfig: configWithCustomUrl })
    const { result } = renderHook(() => useWikidataBaseUrl(), {
      wrapper: createWrapper(store),
    })

    // Should return URL as-is if it doesn't match the pattern
    expect(result.current).toBe('https://custom.wikibase.org/api')
  })
})

describe('useReverseIdMapping', () => {
  it('returns null when no ID mapping', () => {
    const store = createTestStore({ appConfig: onlineConfig })
    const { result } = renderHook(() => useReverseIdMapping(), {
      wrapper: createWrapper(store),
    })

    expect(result.current).toBeNull()
  })

  it('returns null when appConfig is null', () => {
    const store = createTestStore({ appConfig: null })
    const { result } = renderHook(() => useReverseIdMapping(), {
      wrapper: createWrapper(store),
    })

    expect(result.current).toBeNull()
  })

  it('creates reverse mapping from wikidata -> local IDs', () => {
    const store = createTestStore({ appConfig: offlineConfig })
    const { result } = renderHook(() => useReverseIdMapping(), {
      wrapper: createWrapper(store),
    })

    // Original mapping: { Q5: 'Q1', Q42: 'Q2', Q515: 'Q3' }
    // Reverse should be: { Q1: 'Q5', Q2: 'Q42', Q3: 'Q515' }
    expect(result.current).toEqual({
      Q1: 'Q5',
      Q2: 'Q42',
      Q3: 'Q515',
    })
  })

  it('handles empty mapping', () => {
    const configWithEmptyMapping: AppConfig = {
      ...offlineConfig,
      wikidata: {
        ...offlineConfig.wikidata,
        idMapping: {},
      },
    }
    const store = createTestStore({ appConfig: configWithEmptyMapping })
    const { result } = renderHook(() => useReverseIdMapping(), {
      wrapper: createWrapper(store),
    })

    expect(result.current).toEqual({})
  })
})
