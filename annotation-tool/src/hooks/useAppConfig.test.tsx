/**
 * Tests for useAppConfig hooks.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAuthStore, AppConfig } from '../store/zustand/authStore'
import {
  useAppConfig,
  useWikidataConfig,
  useExternalLinksConfig,
  useIsConfigLoaded,
  useWikidataBaseUrl,
  useReverseIdMapping,
} from './useAppConfig'

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
  beforeEach(() => {
    // Reset Zustand store before each test
    useAuthStore.getState().reset()
  })

  it('returns default config when appConfig is null', () => {
    // Store starts with null appConfig
    const { result } = renderHook(() => useAppConfig())

    expect(result.current.mode).toBe('single-user')
    expect(result.current.allowRegistration).toBe(false)
    expect(result.current.wikidata.mode).toBe('online')
    expect(result.current.wikidata.url).toBe('https://www.wikidata.org/w/api.php')
    expect(result.current.wikidata.idMapping).toBeNull()
    expect(result.current.wikidata.allowExternalLinks).toBe(true)
    expect(result.current.externalLinks.wikidata).toBe(true)
    expect(result.current.externalLinks.videoSources).toBe(true)
  })

  it('returns stored appConfig from Zustand state', () => {
    useAuthStore.getState().setConfig(onlineConfig)
    const { result } = renderHook(() => useAppConfig())

    expect(result.current).toEqual(onlineConfig)
  })

  it('returns offline config when stored', () => {
    useAuthStore.getState().setConfig(offlineConfig)
    const { result } = renderHook(() => useAppConfig())

    expect(result.current.wikidata.mode).toBe('offline')
    expect(result.current.wikidata.idMapping).toEqual({
      Q5: 'Q1',
      Q42: 'Q2',
      Q515: 'Q3',
    })
  })
})

describe('useWikidataConfig', () => {
  beforeEach(() => {
    useAuthStore.getState().reset()
  })

  it('returns wikidata config from appConfig', () => {
    useAuthStore.getState().setConfig(onlineConfig)
    const { result } = renderHook(() => useWikidataConfig())

    expect(result.current.mode).toBe('online')
    expect(result.current.url).toBe('https://www.wikidata.org/w/api.php')
    expect(result.current.allowExternalLinks).toBe(true)
  })

  it('returns default wikidata config when appConfig is null', () => {
    const { result } = renderHook(() => useWikidataConfig())

    expect(result.current.mode).toBe('online')
    expect(result.current.url).toBe('https://www.wikidata.org/w/api.php')
    expect(result.current.idMapping).toBeNull()
  })

  it('returns offline config with ID mapping', () => {
    useAuthStore.getState().setConfig(offlineConfig)
    const { result } = renderHook(() => useWikidataConfig())

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
  beforeEach(() => {
    useAuthStore.getState().reset()
  })

  it('returns external links config', () => {
    useAuthStore.getState().setConfig(onlineConfig)
    const { result } = renderHook(() => useExternalLinksConfig())

    expect(result.current.wikidata).toBe(true)
    expect(result.current.videoSources).toBe(true)
  })

  it('returns defaults when appConfig is null', () => {
    const { result } = renderHook(() => useExternalLinksConfig())

    expect(result.current.wikidata).toBe(true)
    expect(result.current.videoSources).toBe(true)
  })

  it('returns disabled links in offline mode', () => {
    useAuthStore.getState().setConfig(offlineConfig)
    const { result } = renderHook(() => useExternalLinksConfig())

    expect(result.current.wikidata).toBe(false)
    expect(result.current.videoSources).toBe(true)
  })
})

describe('useIsConfigLoaded', () => {
  beforeEach(() => {
    useAuthStore.getState().reset()
  })

  it('returns false when appConfig is null', () => {
    const { result } = renderHook(() => useIsConfigLoaded())

    expect(result.current).toBe(false)
  })

  it('returns true when appConfig is loaded', () => {
    useAuthStore.getState().setConfig(onlineConfig)
    const { result } = renderHook(() => useIsConfigLoaded())

    expect(result.current).toBe(true)
  })
})

describe('useWikidataBaseUrl', () => {
  beforeEach(() => {
    useAuthStore.getState().reset()
  })

  it('derives base URL from API URL (removes /w/api.php)', () => {
    useAuthStore.getState().setConfig(onlineConfig)
    const { result } = renderHook(() => useWikidataBaseUrl())

    expect(result.current).toBe('https://www.wikidata.org')
  })

  it('handles default Wikidata URL', () => {
    const { result } = renderHook(() => useWikidataBaseUrl())

    expect(result.current).toBe('https://www.wikidata.org')
  })

  it('handles custom Wikibase URL', () => {
    useAuthStore.getState().setConfig(offlineConfig)
    const { result } = renderHook(() => useWikidataBaseUrl())

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
    useAuthStore.getState().setConfig(configWithCustomUrl)
    const { result } = renderHook(() => useWikidataBaseUrl())

    // Should return URL as-is if it doesn't match the pattern
    expect(result.current).toBe('https://custom.wikibase.org/api')
  })
})

describe('useReverseIdMapping', () => {
  beforeEach(() => {
    useAuthStore.getState().reset()
  })

  it('returns null when no ID mapping', () => {
    useAuthStore.getState().setConfig(onlineConfig)
    const { result } = renderHook(() => useReverseIdMapping())

    expect(result.current).toBeNull()
  })

  it('returns null when appConfig is null', () => {
    const { result } = renderHook(() => useReverseIdMapping())

    expect(result.current).toBeNull()
  })

  it('creates reverse mapping from wikidata -> local IDs', () => {
    useAuthStore.getState().setConfig(offlineConfig)
    const { result } = renderHook(() => useReverseIdMapping())

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
    useAuthStore.getState().setConfig(configWithEmptyMapping)
    const { result } = renderHook(() => useReverseIdMapping())

    expect(result.current).toEqual({})
  })
})
