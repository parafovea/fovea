import { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'

/**
 * Creates a test server instance with all routes and plugins configured.
 * Useful for integration testing API endpoints.
 *
 * @returns Promise resolving to a configured Fastify server instance
 *
 * @example
 * ```ts
 * import { createTestServer } from '@test/utils/test-server'
 *
 * test('GET /api/personas', async () => {
 *   const server = await createTestServer()
 *   const response = await server.inject({
 *     method: 'GET',
 *     url: '/api/personas'
 *   })
 *   expect(response.statusCode).toBe(200)
 *   await server.close()
 * })
 * ```
 */
export async function createTestServer(): Promise<FastifyInstance> {
  const server = await buildApp({
    logger: false,
  })

  return server
}

/**
 * Helper to inject a request to the test server and parse JSON response.
 * Simplifies common test patterns.
 *
 * @param server - Fastify server instance
 * @param method - HTTP method
 * @param url - Request URL
 * @param payload - Optional request payload
 * @returns Parsed JSON response and status code
 *
 * @example
 * ```ts
 * const { json, statusCode } = await injectJSON(server, 'POST', '/api/personas', {
 *   name: 'Test Persona'
 * })
 * expect(statusCode).toBe(201)
 * expect(json.id).toBeDefined()
 * ```
 */
export async function injectJSON<T = unknown>(
  server: FastifyInstance,
  method: string,
  url: string,
  payload?: unknown
): Promise<{ json: T; statusCode: number; headers: Record<string, string | string[] | undefined> }> {
  const response = await server.inject({
    method,
    url,
    payload,
  })

  return {
    json: JSON.parse(response.body) as T,
    statusCode: response.statusCode,
    headers: response.headers,
  }
}
