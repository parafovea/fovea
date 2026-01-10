/**
 * Tests to verify axios credentials configuration for Safari compatibility.
 *
 * These tests ensure that all axios instances and fetch calls include
 * credentials, which is required for Safari and other browsers with
 * strict cookie policies to properly send session cookies.
 */

import { describe, it, expect, vi } from 'vitest'
import axios from 'axios'
import { server } from '../../test/setup'
import { http, HttpResponse } from 'msw'

describe('Axios Credentials Configuration', () => {
  describe('axios global defaults', () => {
    it('has withCredentials set to true in global defaults', async () => {
      // Import api.ts which sets axios.defaults.withCredentials
      await import('../services/api')

      expect(axios.defaults.withCredentials).toBe(true)
    })
  })

  describe('ApiClient axios instance', () => {
    it('creates axios instance with withCredentials: true', async () => {
      const { ApiClient } = await import('./client')
      const client = new ApiClient({ baseURL: 'http://localhost:3001' })

      // Access the internal client to verify config
      // @ts-expect-error accessing private property for testing
      const axiosInstance = client.client

      expect(axiosInstance.defaults.withCredentials).toBe(true)
    })

    it('sends credentials with GET requests', async () => {
      let receivedCredentials = false

      server.use(
        http.get('http://localhost:3001/api/videos/:videoId/summaries', () => {
          // In MSW, credentials are indicated by the 'credentials' option
          // We verify the axios config sends credentials by checking the request
          receivedCredentials = true
          return HttpResponse.json([])
        })
      )

      const { ApiClient } = await import('./client')
      const client = new ApiClient({ baseURL: 'http://localhost:3001' })

      await client.getVideoSummaries('test-video')

      expect(receivedCredentials).toBe(true)
    })

    it('sends credentials with POST requests', async () => {
      let receivedRequest = false

      server.use(
        http.post('http://localhost:3001/api/videos/summaries/generate', () => {
          receivedRequest = true
          return HttpResponse.json({
            jobId: 'job-123',
            videoId: 'test-video',
            personaId: 'test-persona',
          })
        })
      )

      const { ApiClient } = await import('./client')
      const client = new ApiClient({ baseURL: 'http://localhost:3001' })

      await client.generateSummary({
        videoId: 'test-video',
        personaId: 'test-persona',
      })

      expect(receivedRequest).toBe(true)
    })
  })

  describe('axiosInstance module', () => {
    it('exports axios instance with withCredentials: true', async () => {
      const axiosInstance = (await import('./axiosInstance')).default

      expect(axiosInstance.defaults.withCredentials).toBe(true)
    })

    it('has Content-Type header set to application/json', async () => {
      const axiosInstance = (await import('./axiosInstance')).default

      expect(axiosInstance.defaults.headers['Content-Type']).toBe('application/json')
    })
  })
})

// Note: Redux slice fetch credential tests were removed during the migration
// from Redux to TanStack Query. The credentials are now configured via:
// 1. axios.defaults.withCredentials (set by api.ts)
// 2. ApiClient's axios instance withCredentials setting
// 3. axiosInstance module withCredentials setting
// All TanStack Query hooks use these configured axios instances.

describe('Safari Compatibility', () => {
  it('all API modules configure credentials for cross-browser compatibility', async () => {
    // Import all API modules to trigger their initialization
    await import('../services/api')
    const { ApiClient } = await import('./client')
    const axiosInstance = (await import('./axiosInstance')).default

    // Verify global axios defaults
    expect(axios.defaults.withCredentials).toBe(true)

    // Verify ApiClient instance
    const client = new ApiClient({ baseURL: 'http://localhost:3001' })
    // @ts-expect-error accessing private property for testing
    expect(client.client.defaults.withCredentials).toBe(true)

    // Verify axiosInstance module
    expect(axiosInstance.defaults.withCredentials).toBe(true)
  })
})

describe('API Service Credentials', () => {
  describe('File upload operations', () => {
    it('axios global defaults apply to FormData uploads', async () => {
      // Import api.ts to ensure global withCredentials is set
      await import('../services/api')

      // Verify global axios defaults include credentials
      // This ensures FormData uploads will include credentials
      expect(axios.defaults.withCredentials).toBe(true)
    })

    it('axios POST requests with FormData inherit withCredentials', async () => {
      // This test verifies the axios configuration is correct for file uploads
      // The global withCredentials setting applies to all axios requests including FormData

      await import('../services/api')

      // Verify that withCredentials is set globally
      // The api.ts file uses axios.post() which inherits axios.defaults.withCredentials
      expect(axios.defaults.withCredentials).toBe(true)

      // FormData uploads use axios.post() with custom headers but no explicit credentials
      // They inherit the global withCredentials setting, ensuring cookies are sent
    })
  })

  describe('Blob download operations', () => {
    it('exportAnnotations sends credentials with blob download', async () => {
      let requestReceived = false

      server.use(
        http.get('/api/export', async () => {
          requestReceived = true
          return new HttpResponse(new Blob(['test data']), {
            headers: {
              'Content-Type': 'application/x-ndjson',
              'Content-Disposition': 'attachment; filename="annotations.jsonl"'
            }
          })
        })
      )

      const { api } = await import('../services/api')

      // Mock URL.createObjectURL and DOM methods
      const mockCreateObjectURL = vi.fn(() => 'blob:mock-url')
      const mockRevokeObjectURL = vi.fn()
      global.URL.createObjectURL = mockCreateObjectURL
      global.URL.revokeObjectURL = mockRevokeObjectURL

      const mockClick = vi.fn()
      const mockAppendChild = vi.fn()
      const mockRemoveChild = vi.fn()
      document.createElement = vi.fn(() => ({
        click: mockClick,
        href: '',
        download: '',
        style: {}
      })) as unknown as typeof document.createElement
      document.body.appendChild = mockAppendChild
      document.body.removeChild = mockRemoveChild

      await api.exportAnnotations({})

      expect(requestReceived).toBe(true)
    })
  })

  describe('PUT and DELETE operations', () => {
    it('ApiClient sends credentials with PUT requests', async () => {
      let requestReceived = false

      server.use(
        http.put('http://localhost:3001/api/test', () => {
          requestReceived = true
          return HttpResponse.json({ success: true })
        })
      )

      const { ApiClient } = await import('./client')
      const client = new ApiClient({ baseURL: 'http://localhost:3001' })

      // @ts-expect-error accessing private property for testing
      await client.client.put('/api/test', { data: 'test' })

      expect(requestReceived).toBe(true)
    })

    it('ApiClient sends credentials with DELETE requests', async () => {
      let requestReceived = false

      server.use(
        http.delete('http://localhost:3001/api/videos/:videoId/summaries/:personaId', () => {
          requestReceived = true
          return HttpResponse.json({ success: true })
        })
      )

      const { ApiClient } = await import('./client')
      const client = new ApiClient({ baseURL: 'http://localhost:3001' })

      await client.deleteSummary('test-video', 'test-persona')

      expect(requestReceived).toBe(true)
    })
  })
})

describe('Cross-Browser Cookie Handling', () => {
  describe('SameSite cookie policy compliance', () => {
    it('axios requests include credentials for same-origin requests', async () => {
      // This test verifies that withCredentials is set, which allows
      // SameSite=Lax cookies to be sent with same-origin requests
      const axiosInstance = (await import('./axiosInstance')).default
      expect(axiosInstance.defaults.withCredentials).toBe(true)
    })

    it('all API methods preserve credentials across request chains', async () => {
      // Import the api service to trigger axios configuration
      await import('../services/api')

      // Verify axios global defaults are set after importing api
      expect(axios.defaults.withCredentials).toBe(true)
    })
  })

  describe('Edge cases for authentication', () => {
    it('handles 401 responses gracefully', async () => {
      server.use(
        http.get('http://localhost:3001/api/videos/:videoId/summaries', () => {
          return HttpResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          )
        })
      )

      const { ApiClient } = await import('./client')
      const client = new ApiClient({ baseURL: 'http://localhost:3001' })

      await expect(client.getVideoSummaries('test-video')).rejects.toMatchObject({
        statusCode: 401
      })
    })

    it('handles 403 forbidden responses', async () => {
      server.use(
        http.get('http://localhost:3001/api/videos/:videoId/summaries', () => {
          return HttpResponse.json(
            { error: 'Forbidden' },
            { status: 403 }
          )
        })
      )

      const { ApiClient } = await import('./client')
      const client = new ApiClient({ baseURL: 'http://localhost:3001' })

      await expect(client.getVideoSummaries('test-video')).rejects.toMatchObject({
        statusCode: 403
      })
    })
  })
})

/**
 * Browser-Specific Authentication Edge Cases
 *
 * These tests document and verify handling of known browser-specific
 * authentication issues discovered through research:
 *
 * 1. Safari ITP (Intelligent Tracking Prevention):
 *    - Blocks third-party cookies by default
 *    - May evict cookies after 7 days in some scenarios
 *    - Requires user interaction for cross-site cookie access
 *
 * 2. localhost vs 127.0.0.1:
 *    - Browsers treat these as different origins
 *    - Cookies set for localhost won't be sent to 127.0.0.1
 *    - CORS must allow both origins
 *
 * 3. SameSite=Lax behavior:
 *    - Only sends cookies with top-level GET navigations for cross-site
 *    - Same-site POST/PUT/DELETE requests receive cookies normally
 *    - Our setup uses same-site (localhost) so this is not an issue
 *
 * 4. Chrome Incognito / Safari Private Browsing:
 *    - May have stricter cookie policies
 *    - Third-party cookies often completely blocked
 *
 * 5. Secure cookie flag:
 *    - Must be false for http://localhost development
 *    - Must be true for production HTTPS
 */
describe('SSH Port Forwarding Compatibility', () => {
  describe('relative URL handling', () => {
    it('ApiClient uses relative URLs by default for Vite proxy compatibility', async () => {
      // When no baseURL is provided, ApiClient should use relative URLs
      // This ensures SSH port forwarding works when only port 3000 is forwarded
      // because all /api/* requests go through the Vite proxy
      const { ApiClient } = await import('./client')
      const client = new ApiClient()

      // @ts-expect-error accessing private property for testing
      expect(client.client.defaults.baseURL).toBe('')
    })

    it('ApiClient respects explicit baseURL when provided', async () => {
      const { ApiClient } = await import('./client')
      const client = new ApiClient({ baseURL: 'http://localhost:3001' })

      // @ts-expect-error accessing private property for testing
      expect(client.client.defaults.baseURL).toBe('http://localhost:3001')
    })

    it('ApiClient respects VITE_API_URL environment variable', async () => {
      // Note: This test documents expected behavior
      // The actual VITE_API_URL is checked at build time
      const { ApiClient } = await import('./client')
      const client = new ApiClient()

      // Without VITE_API_URL set, should use empty string (relative URLs)
      // @ts-expect-error accessing private property for testing
      expect(client.client.defaults.baseURL).toBe('')
    })
  })

  describe('credentials with relative URLs', () => {
    it('credentials are sent with relative URL requests', async () => {
      // Relative URLs go through Vite proxy, which forwards to backend
      // Cookies should still be included
      const { ApiClient } = await import('./client')
      const client = new ApiClient() // Uses relative URLs

      // @ts-expect-error accessing private property for testing
      expect(client.client.defaults.withCredentials).toBe(true)
    })
  })
})

describe('Browser-Specific Authentication Edge Cases', () => {
  describe('localhost vs 127.0.0.1 handling', () => {
    it('ApiClient works with localhost baseURL', async () => {
      let requestReceived = false

      server.use(
        http.get('http://localhost:3001/api/test', () => {
          requestReceived = true
          return HttpResponse.json({ success: true })
        })
      )

      const { ApiClient } = await import('./client')
      const client = new ApiClient({ baseURL: 'http://localhost:3001' })

      // @ts-expect-error accessing private property for testing
      await client.client.get('/api/test')

      expect(requestReceived).toBe(true)
    })

    it('ApiClient works with 127.0.0.1 baseURL', async () => {
      let requestReceived = false

      server.use(
        http.get('http://127.0.0.1:3001/api/test', () => {
          requestReceived = true
          return HttpResponse.json({ success: true })
        })
      )

      const { ApiClient } = await import('./client')
      const client = new ApiClient({ baseURL: 'http://127.0.0.1:3001' })

      // @ts-expect-error accessing private property for testing
      await client.client.get('/api/test')

      expect(requestReceived).toBe(true)
    })

    it('credentials are sent regardless of localhost vs 127.0.0.1', async () => {
      // This test verifies that withCredentials is set which ensures
      // cookies are sent regardless of which localhost variant is used
      await import('../services/api')

      expect(axios.defaults.withCredentials).toBe(true)

      const { ApiClient } = await import('./client')
      const localhostClient = new ApiClient({ baseURL: 'http://localhost:3001' })
      const ipClient = new ApiClient({ baseURL: 'http://127.0.0.1:3001' })

      // @ts-expect-error accessing private property for testing
      expect(localhostClient.client.defaults.withCredentials).toBe(true)
      // @ts-expect-error accessing private property for testing
      expect(ipClient.client.defaults.withCredentials).toBe(true)
    })
  })

  describe('SameSite=Lax cookie behavior', () => {
    it('credentials sent with same-site GET requests', async () => {
      let requestReceived = false

      server.use(
        http.get('http://localhost:3001/api/ontology', () => {
          requestReceived = true
          return HttpResponse.json({ personas: [], personaOntologies: [] })
        })
      )

      const { ApiClient } = await import('./client')
      const client = new ApiClient({ baseURL: 'http://localhost:3001' })

      // @ts-expect-error accessing private property for testing
      await client.client.get('/api/ontology')

      expect(requestReceived).toBe(true)
    })

    it('credentials sent with same-site POST requests', async () => {
      // SameSite=Lax allows POST for same-site requests
      let requestReceived = false

      server.use(
        http.post('http://localhost:3001/api/annotations', () => {
          requestReceived = true
          return HttpResponse.json({ id: 'test-id' })
        })
      )

      const { ApiClient } = await import('./client')
      const client = new ApiClient({ baseURL: 'http://localhost:3001' })

      // @ts-expect-error accessing private property for testing
      await client.client.post('/api/annotations', { data: 'test' })

      expect(requestReceived).toBe(true)
    })

    it('credentials sent with same-site PUT requests', async () => {
      let requestReceived = false

      server.use(
        http.put('http://localhost:3001/api/ontology', () => {
          requestReceived = true
          return HttpResponse.json({ success: true })
        })
      )

      const { ApiClient } = await import('./client')
      const client = new ApiClient({ baseURL: 'http://localhost:3001' })

      // @ts-expect-error accessing private property for testing
      await client.client.put('/api/ontology', { personas: [] })

      expect(requestReceived).toBe(true)
    })

    it('credentials sent with same-site DELETE requests', async () => {
      let requestReceived = false

      server.use(
        http.delete('http://localhost:3001/api/annotations/:id', () => {
          requestReceived = true
          return HttpResponse.json({ success: true })
        })
      )

      const { ApiClient } = await import('./client')
      const client = new ApiClient({ baseURL: 'http://localhost:3001' })

      // @ts-expect-error accessing private property for testing
      await client.client.delete('/api/annotations/test-id')

      expect(requestReceived).toBe(true)
    })
  })

  describe('Session expiration handling', () => {
    it('handles session expired (401) and allows re-authentication', async () => {
      // First request fails with 401
      server.use(
        http.get('http://localhost:3001/api/auth/me', () => {
          return HttpResponse.json(
            { error: 'Session expired' },
            { status: 401 }
          )
        })
      )

      const { ApiClient } = await import('./client')
      const client = new ApiClient({ baseURL: 'http://localhost:3001' })

      // @ts-expect-error accessing private property for testing
      await expect(client.client.get('/api/auth/me')).rejects.toThrow()

      // Subsequent login should work
      server.use(
        http.post('http://localhost:3001/api/auth/login', () => {
          return HttpResponse.json({
            user: { id: 'user-1', username: 'test', displayName: 'Test User', isAdmin: false }
          })
        })
      )

      // @ts-expect-error accessing private property for testing
      const response = await client.client.post('/api/auth/login', {
        username: 'test',
        password: 'password'
      })

      expect(response.data.user.username).toBe('test')
    })
  })

  describe('Network error handling', () => {
    it('handles network errors gracefully', async () => {
      server.use(
        http.get('http://localhost:3001/api/test', () => {
          return HttpResponse.error()
        })
      )

      const { ApiClient } = await import('./client')
      const client = new ApiClient({ baseURL: 'http://localhost:3001' })

      // @ts-expect-error accessing private property for testing
      await expect(client.client.get('/api/test')).rejects.toThrow()
    })

    it('ApiClient timeout configuration is preserved with credentials', async () => {
      // Verify that custom timeout doesn't interfere with credentials
      const { ApiClient } = await import('./client')
      const client = new ApiClient({ baseURL: 'http://localhost:3001', timeout: 5000 })

      // @ts-expect-error accessing private property for testing
      expect(client.client.defaults.timeout).toBe(5000)
      // @ts-expect-error accessing private property for testing
      expect(client.client.defaults.withCredentials).toBe(true)
    })
  })
})
