import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestServer } from '../utils/test-server.js'
import { FastifyInstance } from 'fastify'
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'fs'
import { join } from 'path'

describe('Config Routes', () => {
  let server: FastifyInstance
  const originalEnv = { ...process.env }
  const testDir = join(process.cwd(), 'test', 'tmp')

  beforeEach(async () => {
    // Clean environment variables
    delete process.env.WIKIDATA_MODE
    delete process.env.WIKIDATA_URL
    delete process.env.WIKIBASE_ID_MAPPING_PATH
    delete process.env.ALLOW_EXTERNAL_LINKS
    delete process.env.ALLOW_EXTERNAL_WIKIDATA_LINKS
    delete process.env.ALLOW_EXTERNAL_VIDEO_SOURCE_LINKS
    delete process.env.FOVEA_MODE
    delete process.env.ALLOW_REGISTRATION

    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true })
    }

    server = await createTestServer()
  })

  afterEach(async () => {
    await server.close()
    process.env = { ...originalEnv }

    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  })

  describe('GET /api/config', () => {
    describe('basic configuration', () => {
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

      it('returns multi-user mode when FOVEA_MODE is set', async () => {
        process.env.FOVEA_MODE = 'multi-user'

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.mode).toBe('multi-user')
      })

      it('returns allowRegistration true when ALLOW_REGISTRATION is true', async () => {
        process.env.ALLOW_REGISTRATION = 'true'

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.allowRegistration).toBe(true)
      })

      it('returns allowRegistration false by default', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.allowRegistration).toBe(false)
      })
    })

    describe('ID mapping', () => {
      it('loads ID mapping from WIKIBASE_ID_MAPPING_PATH in offline mode', async () => {
        const mappingPath = join(testDir, 'id-mapping.json')
        const testMapping = { Q42: 'Q2', Q515: 'Q3' }
        writeFileSync(mappingPath, JSON.stringify(testMapping))

        process.env.WIKIDATA_MODE = 'offline'
        process.env.WIKIDATA_URL = 'http://localhost:8181/w/api.php'
        process.env.WIKIBASE_ID_MAPPING_PATH = mappingPath

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.wikidata.idMapping).toEqual(testMapping)
      })

      it('returns null mapping when file does not exist', async () => {
        process.env.WIKIDATA_MODE = 'offline'
        process.env.WIKIDATA_URL = 'http://localhost:8181/w/api.php'
        process.env.WIKIBASE_ID_MAPPING_PATH = '/nonexistent/path/mapping.json'

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.wikidata.idMapping).toBeNull()
      })

      it('returns null mapping when file is invalid JSON', async () => {
        const mappingPath = join(testDir, 'invalid-mapping.json')
        writeFileSync(mappingPath, 'not valid json {')

        process.env.WIKIDATA_MODE = 'offline'
        process.env.WIKIDATA_URL = 'http://localhost:8181/w/api.php'
        process.env.WIKIBASE_ID_MAPPING_PATH = mappingPath

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.wikidata.idMapping).toBeNull()
      })

      it('returns null mapping in online mode even if path is set', async () => {
        const mappingPath = join(testDir, 'mapping.json')
        writeFileSync(mappingPath, JSON.stringify({ Q42: 'Q2' }))

        process.env.WIKIDATA_MODE = 'online'
        process.env.WIKIBASE_ID_MAPPING_PATH = mappingPath

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.wikidata.idMapping).toBeNull()
      })

      it('returns null mapping when path is empty string', async () => {
        process.env.WIKIDATA_MODE = 'offline'
        process.env.WIKIBASE_ID_MAPPING_PATH = ''

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.wikidata.idMapping).toBeNull()
      })
    })

    describe('external links - wikidata', () => {
      it('online mode always allows Wikidata links', async () => {
        process.env.WIKIDATA_MODE = 'online'

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.wikidata.allowExternalLinks).toBe(true)
        expect(json.externalLinks.wikidata).toBe(true)
      })

      it('online mode allows Wikidata links even if ALLOW_EXTERNAL_WIKIDATA_LINKS is false', async () => {
        process.env.WIKIDATA_MODE = 'online'
        process.env.ALLOW_EXTERNAL_WIKIDATA_LINKS = 'false'

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.wikidata.allowExternalLinks).toBe(true)
      })

      it('offline mode respects ALLOW_EXTERNAL_WIKIDATA_LINKS=true', async () => {
        process.env.WIKIDATA_MODE = 'offline'
        process.env.WIKIDATA_URL = 'http://localhost:8181/w/api.php'
        process.env.ALLOW_EXTERNAL_WIKIDATA_LINKS = 'true'

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.wikidata.allowExternalLinks).toBe(true)
        expect(json.externalLinks.wikidata).toBe(true)
      })

      it('offline mode respects ALLOW_EXTERNAL_WIKIDATA_LINKS=false', async () => {
        process.env.WIKIDATA_MODE = 'offline'
        process.env.WIKIDATA_URL = 'http://localhost:8181/w/api.php'
        process.env.ALLOW_EXTERNAL_WIKIDATA_LINKS = 'false'

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.wikidata.allowExternalLinks).toBe(false)
        expect(json.externalLinks.wikidata).toBe(false)
      })

      it('offline mode defaults to master switch when ALLOW_EXTERNAL_WIKIDATA_LINKS not set', async () => {
        process.env.WIKIDATA_MODE = 'offline'
        process.env.WIKIDATA_URL = 'http://localhost:8181/w/api.php'
        process.env.ALLOW_EXTERNAL_LINKS = 'true'

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.wikidata.allowExternalLinks).toBe(true)
      })

      it('offline mode defaults to true when no switches are set', async () => {
        process.env.WIKIDATA_MODE = 'offline'
        process.env.WIKIDATA_URL = 'http://localhost:8181/w/api.php'

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        // Master switch defaults to true, so Wikidata links allowed
        expect(json.wikidata.allowExternalLinks).toBe(true)
      })

      it('master switch false disables Wikidata links in offline mode', async () => {
        process.env.WIKIDATA_MODE = 'offline'
        process.env.WIKIDATA_URL = 'http://localhost:8181/w/api.php'
        process.env.ALLOW_EXTERNAL_LINKS = 'false'

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.wikidata.allowExternalLinks).toBe(false)
      })

      it('specific override takes precedence over master switch', async () => {
        process.env.WIKIDATA_MODE = 'offline'
        process.env.WIKIDATA_URL = 'http://localhost:8181/w/api.php'
        process.env.ALLOW_EXTERNAL_LINKS = 'false'
        process.env.ALLOW_EXTERNAL_WIKIDATA_LINKS = 'true'

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.wikidata.allowExternalLinks).toBe(true)
      })
    })

    describe('external links - video sources', () => {
      it('defaults video source links to true', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.externalLinks.videoSources).toBe(true)
      })

      it('respects ALLOW_EXTERNAL_VIDEO_SOURCE_LINKS=true', async () => {
        process.env.ALLOW_EXTERNAL_VIDEO_SOURCE_LINKS = 'true'

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.externalLinks.videoSources).toBe(true)
      })

      it('respects ALLOW_EXTERNAL_VIDEO_SOURCE_LINKS=false', async () => {
        process.env.ALLOW_EXTERNAL_VIDEO_SOURCE_LINKS = 'false'

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.externalLinks.videoSources).toBe(false)
      })

      it('follows master switch when not explicitly set', async () => {
        process.env.ALLOW_EXTERNAL_LINKS = 'false'

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.externalLinks.videoSources).toBe(false)
      })

      it('specific override takes precedence over master switch', async () => {
        process.env.ALLOW_EXTERNAL_LINKS = 'false'
        process.env.ALLOW_EXTERNAL_VIDEO_SOURCE_LINKS = 'true'

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.externalLinks.videoSources).toBe(true)
      })

      it('video sources work independently from wikidata links', async () => {
        process.env.WIKIDATA_MODE = 'offline'
        process.env.WIKIDATA_URL = 'http://localhost:8181/w/api.php'
        process.env.ALLOW_EXTERNAL_WIKIDATA_LINKS = 'false'
        process.env.ALLOW_EXTERNAL_VIDEO_SOURCE_LINKS = 'true'

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.externalLinks.wikidata).toBe(false)
        expect(json.externalLinks.videoSources).toBe(true)
      })
    })

    describe('response structure', () => {
      it('includes all required fields', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json).toHaveProperty('mode')
        expect(json).toHaveProperty('allowRegistration')
        expect(json).toHaveProperty('wikidata')
        expect(json).toHaveProperty('externalLinks')
      })

      it('wikidata object has correct shape', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.wikidata).toHaveProperty('mode')
        expect(json.wikidata).toHaveProperty('url')
        expect(json.wikidata).toHaveProperty('idMapping')
        expect(json.wikidata).toHaveProperty('allowExternalLinks')
      })

      it('externalLinks object has correct shape', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.externalLinks).toHaveProperty('wikidata')
        expect(json.externalLinks).toHaveProperty('videoSources')
      })

      it('mode is correct type', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(['single-user', 'multi-user']).toContain(json.mode)
      })

      it('allowRegistration is boolean', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(typeof json.allowRegistration).toBe('boolean')
      })
    })

    describe('edge cases', () => {
      it('handles empty string environment variables', async () => {
        process.env.WIKIDATA_MODE = ''
        process.env.WIKIDATA_URL = ''

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        expect(response.statusCode).toBe(200)
        const json = response.json()
        // Empty strings are falsy, so defaults should be used
        expect(json.wikidata.mode).toBe('online')
        expect(json.wikidata.url).toBe('https://www.wikidata.org/w/api.php')
      })

      it('handles custom Wikibase URL format', async () => {
        process.env.WIKIDATA_MODE = 'offline'
        process.env.WIKIDATA_URL = 'https://wikibase.example.com:9999/w/api.php'

        await server.close()
        server = await createTestServer()

        const response = await server.inject({
          method: 'GET',
          url: '/api/config',
        })

        const json = response.json()
        expect(json.wikidata.url).toBe('https://wikibase.example.com:9999/w/api.php')
      })
    })
  })
})
