import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getWikidataUrl,
  getWikidataMode,
  getWikidataConfig,
  getWikidataBaseUrl,
  getIdMapping,
  getLocalWikibaseId,
  getReverseIdMapping,
  getWikidataIdFromLocal,
  getAllowExternalWikidataLinks,
  resetWikidataConfigCache,
} from './wikidataConfig'

describe('wikidataConfig', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    resetWikidataConfigCache()
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Reset environment
    Object.keys(import.meta.env).forEach((key) => {
      if (!(key in originalEnv)) {
        delete (import.meta.env as Record<string, unknown>)[key]
      }
    })
    Object.assign(import.meta.env, originalEnv)
  })

  describe('getWikidataUrl', () => {
    it('returns default URL when no config is set', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ wikidata: undefined }),
      })

      const url = await getWikidataUrl()
      expect(url).toBe('https://www.wikidata.org/w/api.php')
    })

    it('returns URL from runtime config', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: {
              mode: 'offline',
              url: 'http://localhost:8181/w/api.php',
            },
          }),
      })

      const url = await getWikidataUrl()
      expect(url).toBe('http://localhost:8181/w/api.php')
    })

    it('caches config after first fetch', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: { mode: 'online', url: 'https://www.wikidata.org/w/api.php' },
          }),
      })

      await getWikidataUrl()
      await getWikidataUrl()

      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('falls back to default on fetch error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const url = await getWikidataUrl()
      expect(url).toBe('https://www.wikidata.org/w/api.php')
    })
  })

  describe('getWikidataMode', () => {
    it('returns online by default', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const mode = await getWikidataMode()
      expect(mode).toBe('online')
    })

    it('returns offline when configured', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: { mode: 'offline', url: 'http://localhost:8181/w/api.php' },
          }),
      })

      const mode = await getWikidataMode()
      expect(mode).toBe('offline')
    })
  })

  describe('getWikidataConfig', () => {
    it('returns full config object', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: {
              mode: 'offline',
              url: 'http://wikibase:8181/w/api.php',
              idMapping: { Q42: 'Q2' },
              allowExternalLinks: false,
            },
          }),
      })

      const config = await getWikidataConfig()
      expect(config).toEqual({
        mode: 'offline',
        url: 'http://wikibase:8181/w/api.php',
        idMapping: { Q42: 'Q2' },
        allowExternalLinks: false,
      })
    })

    it('returns online config with allowExternalLinks true', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: {
              mode: 'online',
              url: 'https://www.wikidata.org/w/api.php',
            },
          }),
      })

      const config = await getWikidataConfig()
      expect(config.allowExternalLinks).toBe(true)
    })

    it('defaults allowExternalLinks based on mode', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: {
              mode: 'offline',
              url: 'http://localhost:8181/w/api.php',
              // allowExternalLinks not specified
            },
          }),
      })

      const config = await getWikidataConfig()
      // Offline mode without explicit allowExternalLinks defaults to false
      expect(config.allowExternalLinks).toBe(false)
    })
  })

  describe('getWikidataBaseUrl', () => {
    it('derives base URL from API URL', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: {
              mode: 'offline',
              url: 'http://wikibase:8181/w/api.php',
            },
          }),
      })

      const baseUrl = await getWikidataBaseUrl()
      expect(baseUrl).toBe('http://wikibase:8181')
    })

    it('handles default Wikidata URL', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const baseUrl = await getWikidataBaseUrl()
      expect(baseUrl).toBe('https://www.wikidata.org')
    })
  })

  describe('resetWikidataConfigCache', () => {
    it('clears cached config', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: { mode: 'online', url: 'https://www.wikidata.org/w/api.php' },
          }),
      })

      await getWikidataUrl()
      expect(global.fetch).toHaveBeenCalledTimes(1)

      resetWikidataConfigCache()
      await getWikidataUrl()
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('getIdMapping', () => {
    it('returns null in online mode', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: {
              mode: 'online',
              url: 'https://www.wikidata.org/w/api.php',
            },
          }),
      })

      const mapping = await getIdMapping()
      expect(mapping).toBeNull()
    })

    it('returns mapping object in offline mode', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: {
              mode: 'offline',
              url: 'http://localhost:8181/w/api.php',
              idMapping: { Q42: 'Q2', Q515: 'Q3' },
            },
          }),
      })

      const mapping = await getIdMapping()
      expect(mapping).toEqual({ Q42: 'Q2', Q515: 'Q3' })
    })

    it('returns null when mapping not configured', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: {
              mode: 'offline',
              url: 'http://localhost:8181/w/api.php',
              // idMapping not specified
            },
          }),
      })

      const mapping = await getIdMapping()
      expect(mapping).toBeNull()
    })
  })

  describe('getLocalWikibaseId', () => {
    it('returns mapped local ID for known Wikidata ID', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: {
              mode: 'offline',
              url: 'http://localhost:8181/w/api.php',
              idMapping: { Q42: 'Q2' },
            },
          }),
      })

      const localId = await getLocalWikibaseId('Q42')
      expect(localId).toBe('Q2')
    })

    it('returns original ID when no mapping exists', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: {
              mode: 'offline',
              url: 'http://localhost:8181/w/api.php',
              idMapping: { Q42: 'Q2' },
            },
          }),
      })

      const localId = await getLocalWikibaseId('Q999')
      expect(localId).toBe('Q999')
    })

    it('returns original ID in online mode', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: {
              mode: 'online',
              url: 'https://www.wikidata.org/w/api.php',
            },
          }),
      })

      const localId = await getLocalWikibaseId('Q42')
      expect(localId).toBe('Q42')
    })
  })

  describe('getReverseIdMapping', () => {
    it('creates reverse mapping object', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: {
              mode: 'offline',
              url: 'http://localhost:8181/w/api.php',
              idMapping: { Q42: 'Q2', Q515: 'Q3' },
            },
          }),
      })

      const reverse = await getReverseIdMapping()
      expect(reverse).toEqual({ Q2: 'Q42', Q3: 'Q515' })
    })

    it('returns null when no mapping exists', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: {
              mode: 'online',
              url: 'https://www.wikidata.org/w/api.php',
            },
          }),
      })

      const reverse = await getReverseIdMapping()
      expect(reverse).toBeNull()
    })

    it('handles empty mapping', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: {
              mode: 'offline',
              url: 'http://localhost:8181/w/api.php',
              idMapping: {},
            },
          }),
      })

      const reverse = await getReverseIdMapping()
      expect(reverse).toEqual({})
    })
  })

  describe('getWikidataIdFromLocal', () => {
    it('returns Wikidata ID for local ID', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: {
              mode: 'offline',
              url: 'http://localhost:8181/w/api.php',
              idMapping: { Q42: 'Q2' },
            },
          }),
      })

      const wikidataId = await getWikidataIdFromLocal('Q2')
      expect(wikidataId).toBe('Q42')
    })

    it('returns original ID when not in mapping', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: {
              mode: 'offline',
              url: 'http://localhost:8181/w/api.php',
              idMapping: { Q42: 'Q2' },
            },
          }),
      })

      const wikidataId = await getWikidataIdFromLocal('Q999')
      expect(wikidataId).toBe('Q999')
    })

    it('returns original ID in online mode', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: {
              mode: 'online',
              url: 'https://www.wikidata.org/w/api.php',
            },
          }),
      })

      const wikidataId = await getWikidataIdFromLocal('Q42')
      expect(wikidataId).toBe('Q42')
    })
  })

  describe('getAllowExternalWikidataLinks', () => {
    it('returns true in online mode', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: {
              mode: 'online',
              url: 'https://www.wikidata.org/w/api.php',
            },
          }),
      })

      const allowed = await getAllowExternalWikidataLinks()
      expect(allowed).toBe(true)
    })

    it('returns config value in offline mode when true', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: {
              mode: 'offline',
              url: 'http://localhost:8181/w/api.php',
              allowExternalLinks: true,
            },
          }),
      })

      const allowed = await getAllowExternalWikidataLinks()
      expect(allowed).toBe(true)
    })

    it('returns config value in offline mode when false', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: {
              mode: 'offline',
              url: 'http://localhost:8181/w/api.php',
              allowExternalLinks: false,
            },
          }),
      })

      const allowed = await getAllowExternalWikidataLinks()
      expect(allowed).toBe(false)
    })

    it('defaults to false in offline mode when not specified', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            wikidata: {
              mode: 'offline',
              url: 'http://localhost:8181/w/api.php',
              // allowExternalLinks not specified
            },
          }),
      })

      const allowed = await getAllowExternalWikidataLinks()
      expect(allowed).toBe(false)
    })
  })
})
