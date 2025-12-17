import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getWikidataUrl,
  getWikidataMode,
  getWikidataConfig,
  getWikidataBaseUrl,
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
            },
          }),
      })

      const config = await getWikidataConfig()
      expect(config).toEqual({
        mode: 'offline',
        url: 'http://wikibase:8181/w/api.php',
      })
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
})
