import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

/**
 * Integration tests for video detection endpoint.
 * Tests persona-based and manual query detection.
 */
describe('Videos API - Detection', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let testUserId: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    // Clean database in dependency order
    await prisma.apiKey.deleteMany()
    await prisma.session.deleteMany()
    await prisma.annotation.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.user.deleteMany()

    // Create test user
    const user = await prisma.user.create({
      data: {
        username: 'test-user',
        email: 'test@example.com',
        passwordHash: await hashPassword('testpass123'),
        displayName: 'Test User',
        isAdmin: false
      }
    })
    testUserId = user.id
  })

  describe('POST /api/videos/:videoId/detect', () => {
    it('requires either personaId or manualQuery', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/videos/test-video-id/detect',
        payload: {},
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({
        error: 'Either personaId or manualQuery must be provided',
      })
    })

    it('builds structured query from persona ontology', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Test Persona',
          role: 'Analyst',
          informationNeed: 'Testing',
          userId: testUserId,
          ontology: {
            create: {
              entityTypes: [
                { id: '1', name: 'Person', description: 'Human' },
                { id: '2', name: 'Car', description: 'Vehicle' },
              ],
              eventTypes: [],
              roleTypes: [],
              relationTypes: [],
            },
          },
        },
      })

      // Mock fetch to model service
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          frame_results: [
            {
              frame_number: 0,
              detections: [
                {
                  x: 10,
                  y: 20,
                  width: 100,
                  height: 200,
                  confidence: 0.9,
                  label: 'person',
                },
              ],
            },
          ],
        }),
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/videos/test-video-id/detect',
        payload: {
          personaId: persona.id,
          confidenceThreshold: 0.5,
        },
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      expect(result.videoId).toBe('test-video-id')
      expect(result.query).toContain('Analyst: Test Persona')
      expect(result.query).toContain('Entity Types: person, car')
      expect(result.frameResults).toHaveLength(1)
    })

    it('includes query options in persona-based query', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Baseball Scout',
          role: 'Player Development Analyst',
          informationNeed: 'Tracking pitcher mechanics',
          userId: testUserId,
          ontology: {
            create: {
              entityTypes: [
                { id: '1', name: 'Pitcher', description: 'Throws the ball' },
              ],
              eventTypes: [
                { id: '1', name: 'Pitch', description: 'Throwing action' },
              ],
              roleTypes: [],
              relationTypes: [],
            },
          },
        },
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ frame_results: [] }),
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/videos/test-video-id/detect',
        payload: {
          personaId: persona.id,
          queryOptions: {
            includeEntityTypes: true,
            includeEntityGlosses: true,
            includeEventTypes: true,
            includeEventGlosses: true,
          },
        },
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      expect(result.query).toContain('Entity Types: pitcher (Throws the ball)')
      expect(result.query).toContain('Event Types: pitch (Throwing action)')
    })

    it('uses manual query when provided', async () => {
      // Mock fetch to model service
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          frame_results: [],
        }),
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/videos/test-video-id/detect',
        payload: {
          manualQuery: 'person wearing red shirt',
        },
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      expect(result.query).toBe('person wearing red shirt')
    })

    it('handles persona not found error', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/videos/test-video-id/detect',
        payload: {
          personaId: '00000000-0000-0000-0000-000000000000',
        },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toContain('Persona not found')
    })

    it('handles persona with no ontology', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'No Ontology',
          role: 'Analyst',
          informationNeed: 'Testing',
          userId: testUserId,
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/videos/test-video-id/detect',
        payload: {
          personaId: persona.id,
        },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toContain('has no ontology')
    })

    it('generates query with persona context even when no types included', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Empty Ontology',
          role: 'Analyst',
          informationNeed: 'Testing',
          userId: testUserId,
          ontology: {
            create: {
              entityTypes: [],
              eventTypes: [],
              roleTypes: [],
              relationTypes: [],
            },
          },
        },
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ frame_results: [] }),
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/videos/test-video-id/detect',
        payload: {
          personaId: persona.id,
        },
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      expect(result.query).toContain('Analyst: Empty Ontology')
      expect(result.query).toContain('Focus: Testing')
    })

    it('passes frame numbers and tracking options to model service', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Test Persona',
          role: 'Analyst',
          informationNeed: 'Testing',
          userId: testUserId,
          ontology: {
            create: {
              entityTypes: [{ id: '1', name: 'Person', description: 'Human' }],
              eventTypes: [],
              roleTypes: [],
              relationTypes: [],
            },
          },
        },
      })

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ frame_results: [] }),
      })
      global.fetch = mockFetch

      await app.inject({
        method: 'POST',
        url: '/api/videos/test-video-id/detect',
        payload: {
          personaId: persona.id,
          frameNumbers: [0, 10, 20],
          enableTracking: true,
        },
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/detection/detect'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"frame_numbers":[0,10,20]'),
        })
      )
    })

    it('handles model service error', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Test Persona',
          role: 'Analyst',
          informationNeed: 'Testing',
          userId: testUserId,
          ontology: {
            create: {
              entityTypes: [{ id: '1', name: 'Person', description: 'Human' }],
              eventTypes: [],
              roleTypes: [],
              relationTypes: [],
            },
          },
        },
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/videos/test-video-id/detect',
        payload: {
          personaId: persona.id,
        },
      })

      expect(response.statusCode).toBe(500)
      expect(response.json().error).toContain('Model service error')
    })
  })
})
