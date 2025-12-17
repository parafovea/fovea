import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestServer } from '../utils/test-server.js'
import { FastifyInstance } from 'fastify'

describe('Config Routes', () => {
  let server: FastifyInstance
  const originalEnv = { ...process.env }

  beforeEach(async () => {
    server = await createTestServer()
  })

  afterEach(async () => {
    await server.close()
    process.env = { ...originalEnv }
  })

  describe('GET /api/config', () => {
    it('returns default wikidata configuration', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/config',
      })

      expect(response.statusCode).toBe(200)
      const json = response.json()
      expect(json).toHaveProperty('wikidata')
      expect(json.wikidata.mode).toBe('online')
      expect(json.wikidata.url).toBe('https://www.wikidata.org/w/api.php')
    })

    it('returns offline mode when configured', async () => {
      process.env.WIKIDATA_MODE = 'offline'
      process.env.WIKIDATA_URL = 'http://localhost:8181/w/api.php'

      // Need to recreate server to pick up env changes
      await server.close()
      server = await createTestServer()

      const response = await server.inject({
        method: 'GET',
        url: '/api/config',
      })

      expect(response.statusCode).toBe(200)
      const json = response.json()
      expect(json.wikidata.mode).toBe('offline')
      expect(json.wikidata.url).toBe('http://localhost:8181/w/api.php')
    })

    it('includes mode and allowRegistration', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/config',
      })

      expect(response.statusCode).toBe(200)
      const json = response.json()
      expect(json).toHaveProperty('mode')
      expect(json).toHaveProperty('allowRegistration')
    })
  })
})
