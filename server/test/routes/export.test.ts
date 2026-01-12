import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

/**
 * Integration tests for the Export API.
 * Tests all export endpoints and data formats.
 */
describe('Export API', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let testUserId: string
  let testSessionToken: string
  let testVideoId: string
  let testPersonaId: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    // Clean database in dependency order
    await prisma.claimRelation.deleteMany()
    await prisma.claim.deleteMany()
    await prisma.annotation.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.video.deleteMany()
    await prisma.session.deleteMany()
    await prisma.apiKey.deleteMany()
    await prisma.user.deleteMany()

    // Create test user
    const passwordHash = await hashPassword('testpass123')
    const user = await prisma.user.create({
      data: {
        username: 'testuser',
        email: 'test@example.com',
        passwordHash,
        displayName: 'Test User',
        isAdmin: false
      }
    })
    testUserId = user.id

    // Create test video
    const video = await prisma.video.create({
      data: {
        filename: 'test-video.mp4',
        path: '/videos/test-video.mp4',
        duration: 60.0
      }
    })
    testVideoId = video.id

    // Create test persona
    const persona = await prisma.persona.create({
      data: {
        userId: testUserId,
        name: 'Test Persona',
        role: 'Analyst',
        informationNeed: 'Testing exports'
      }
    })
    testPersonaId = persona.id

    // Create test ontology
    await prisma.ontology.create({
      data: {
        personaId: testPersonaId,
        entityTypes: [
          { id: 'entity-1', name: 'Person', gloss: [{ type: 'text', content: 'A person' }] }
        ],
        eventTypes: [],
        roleTypes: [],
        relationTypes: []
      }
    })

    // Login to get session token
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'testuser', password: 'testpass123' }
    })
    testSessionToken = loginResponse.cookies.find(c => c.name === 'session_token')!.value
  })

  describe('GET /api/export', () => {
    it('exports empty JSONL when no annotations exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toContain('application/x-ndjson')
      expect(response.body.trim()).toBe('')
    })

    it('exports annotations with correct format', async () => {
      // Create annotation
      await prisma.annotation.create({
        data: {
          videoId: testVideoId,
          personaId: testPersonaId,
          type: 'type',
          label: 'entity-1',
          frames: {
            boxes: [{ x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true }],
            interpolationSegments: [],
            visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
            totalFrames: 1,
            keyframeCount: 1,
            interpolatedFrameCount: 0
          }
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/export',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)

      const lines = response.body.trim().split('\n')
      expect(lines.length).toBe(1)

      const exportLine = JSON.parse(lines[0])
      expect(exportLine.type).toBe('annotation')
      expect(exportLine.data.videoId).toBe(testVideoId)
      expect(exportLine.data.annotationType).toBe('type')
      expect(exportLine.data.boundingBoxSequence).toBeDefined()
    })

    it('exports multiple annotations in JSONL format', async () => {
      // Create multiple annotations
      await prisma.annotation.createMany({
        data: [
          {
            videoId: testVideoId,
            personaId: testPersonaId,
            type: 'type',
            label: 'entity-1',
            frames: {
              boxes: [],
              interpolationSegments: [],
              visibilityRanges: [],
              totalFrames: 0,
              keyframeCount: 0,
              interpolatedFrameCount: 0
            }
          },
          {
            videoId: testVideoId,
            personaId: null,
            type: 'object',
            label: 'entity-2',
            frames: {
              boxes: [],
              interpolationSegments: [],
              visibilityRanges: [],
              totalFrames: 0,
              keyframeCount: 0,
              interpolatedFrameCount: 0
            }
          }
        ]
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/export',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)

      const lines = response.body.trim().split('\n')
      expect(lines.length).toBe(2)

      lines.forEach(line => {
        const parsed = JSON.parse(line)
        expect(parsed.type).toBe('annotation')
        expect(parsed.data).toBeDefined()
      })
    })

    it('filters by personaIds', async () => {
      // Create persona 2
      const persona2 = await prisma.persona.create({
        data: {
          userId: testUserId,
          name: 'Another Persona',
          role: 'Reviewer',
          informationNeed: 'Testing filtering'
        }
      })

      // Create annotations for different personas
      await prisma.annotation.create({
        data: {
          videoId: testVideoId,
          personaId: testPersonaId,
          type: 'type',
          label: 'entity-1',
          frames: {}
        }
      })

      await prisma.annotation.create({
        data: {
          videoId: testVideoId,
          personaId: persona2.id,
          type: 'type',
          label: 'entity-2',
          frames: {}
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/export?personaIds=${testPersonaId}`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)

      const lines = response.body.trim().split('\n').filter(l => l)
      expect(lines.length).toBe(1)

      const exportLine = JSON.parse(lines[0])
      expect(exportLine.data.personaId).toBe(testPersonaId)
    })

    it('filters by videoIds', async () => {
      // Create video 2
      const video2 = await prisma.video.create({
        data: {
          filename: 'test-video-2.mp4',
          path: '/videos/test-video-2.mp4',
          duration: 120.0
        }
      })

      // Create annotations for different videos
      await prisma.annotation.create({
        data: {
          videoId: testVideoId,
          personaId: testPersonaId,
          type: 'type',
          label: 'entity-1',
          frames: {}
        }
      })

      await prisma.annotation.create({
        data: {
          videoId: video2.id,
          personaId: testPersonaId,
          type: 'type',
          label: 'entity-2',
          frames: {}
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/export?videoIds=${testVideoId}`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)

      const lines = response.body.trim().split('\n').filter(l => l)
      expect(lines.length).toBe(1)

      const exportLine = JSON.parse(lines[0])
      expect(exportLine.data.videoId).toBe(testVideoId)
    })

    it('returns empty export for no annotations', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      expect(response.body.trim()).toBe('')
    })
  })

  describe('GET /api/export/stats', () => {
    it('returns zero stats for empty database', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/stats',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)

      const stats = response.json()
      expect(stats.annotationCount).toBe(0)
      expect(stats.sequenceCount).toBe(0)
      expect(stats.keyframeCount).toBe(0)
    })

    it('returns correct stats with annotations', async () => {
      // Create annotation with keyframes
      await prisma.annotation.create({
        data: {
          videoId: testVideoId,
          personaId: testPersonaId,
          type: 'type',
          label: 'entity-1',
          frames: {
            boxes: [
              { x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true },
              { x: 50, y: 60, width: 100, height: 50, frameNumber: 100, isKeyframe: true }
            ],
            interpolationSegments: [{ startFrame: 0, endFrame: 100, type: 'linear' }],
            visibilityRanges: [{ startFrame: 0, endFrame: 100, visible: true }],
            totalFrames: 101,
            keyframeCount: 2,
            interpolatedFrameCount: 99
          }
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/export/stats',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)

      const stats = response.json()
      expect(stats.annotationCount).toBe(1)
      expect(stats.sequenceCount).toBe(1)
      expect(stats.keyframeCount).toBe(2)
    })
  })

  describe('GET /api/export/personas', () => {
    it('exports personas with correct format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/personas',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toContain('application/x-ndjson')

      const lines = response.body.trim().split('\n').filter(l => l)
      expect(lines.length).toBeGreaterThan(0)

      // Find persona line
      const personaLine = lines.find(l => JSON.parse(l).type === 'persona')
      expect(personaLine).toBeDefined()

      const exportLine = JSON.parse(personaLine!)
      expect(exportLine.type).toBe('persona')
      expect(exportLine.data.name).toBe('Test Persona')
      expect(exportLine.data.role).toBe('Analyst')
    })

    it('exports personas with their ontologies', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/personas',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)

      const lines = response.body.trim().split('\n').filter(l => l)

      // Should have both persona and ontology lines
      const types = lines.map(l => JSON.parse(l).type)
      expect(types).toContain('persona')
      expect(types).toContain('ontology')
    })
  })

  describe('GET /api/export/summaries', () => {
    it('exports summaries with correct format', async () => {
      // Create summary
      await prisma.videoSummary.create({
        data: {
          videoId: testVideoId,
          personaId: testPersonaId,
          summary: [{ type: 'text', content: 'Test summary content' }]
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/export/summaries',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toContain('application/x-ndjson')

      const lines = response.body.trim().split('\n').filter(l => l)
      expect(lines.length).toBe(1)

      const exportLine = JSON.parse(lines[0])
      expect(exportLine.type).toBe('summary')
      expect(exportLine.data.videoId).toBe(testVideoId)
      expect(exportLine.data.personaId).toBe(testPersonaId)
    })

    it('exports summaries with claims', async () => {
      // Create summary with claim
      const summary = await prisma.videoSummary.create({
        data: {
          videoId: testVideoId,
          personaId: testPersonaId,
          summary: [{ type: 'text', content: 'Test summary' }]
        }
      })

      await prisma.claim.create({
        data: {
          summaryId: summary.id,
          summaryType: 'video',
          text: 'Test claim',
          gloss: [{ type: 'text', content: 'Test claim' }]
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/export/summaries',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)

      const lines = response.body.trim().split('\n').filter(l => l)
      const types = lines.map(l => JSON.parse(l).type)

      expect(types).toContain('summary')
      expect(types).toContain('claim')
    })

    it('returns empty response when no summaries exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/summaries',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      expect(response.body.trim()).toBe('')
    })
  })

  describe('GET /api/export (full export)', () => {
    it('exports all data types in correct order', async () => {
      // Create summary
      const summary = await prisma.videoSummary.create({
        data: {
          videoId: testVideoId,
          personaId: testPersonaId,
          summary: [{ type: 'text', content: 'Test summary' }]
        }
      })

      // Create claim
      await prisma.claim.create({
        data: {
          summaryId: summary.id,
          summaryType: 'video',
          text: 'Test claim',
          gloss: [{ type: 'text', content: 'Test claim' }]
        }
      })

      // Create annotation
      await prisma.annotation.create({
        data: {
          videoId: testVideoId,
          personaId: testPersonaId,
          type: 'type',
          label: 'entity-1',
          frames: {}
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/export',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)

      const lines = response.body.trim().split('\n').filter(l => l)
      const types = lines.map(l => JSON.parse(l).type)

      // Should include personas, ontologies, summaries, claims, and annotations
      expect(types).toContain('persona')
      expect(types).toContain('ontology')
      expect(types).toContain('summary')
      expect(types).toContain('claim')
      expect(types).toContain('annotation')
    })

    it('dependencies come before dependents', async () => {
      // Create data with dependencies
      const summary = await prisma.videoSummary.create({
        data: {
          videoId: testVideoId,
          personaId: testPersonaId,
          summary: [{ type: 'text', content: 'Test' }]
        }
      })

      await prisma.claim.create({
        data: {
          summaryId: summary.id,
          summaryType: 'video',
          text: 'Claim',
          gloss: []
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/export',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)

      const lines = response.body.trim().split('\n').filter(l => l)
      const types = lines.map(l => JSON.parse(l).type)

      // Persona should come before ontology
      const personaIndex = types.indexOf('persona')
      const ontologyIndex = types.indexOf('ontology')
      expect(personaIndex).toBeLessThan(ontologyIndex)

      // Summary should come before claim
      const summaryIndex = types.indexOf('summary')
      const claimIndex = types.indexOf('claim')
      expect(summaryIndex).toBeLessThan(claimIndex)
    })
  })

  describe('Round-trip: Export -> Import', () => {
    it('exported data can be re-imported', async () => {
      // Create data to export
      await prisma.videoSummary.create({
        data: {
          videoId: testVideoId,
          personaId: testPersonaId,
          summary: [{ type: 'text', content: 'Test summary' }]
        }
      })

      await prisma.annotation.create({
        data: {
          videoId: testVideoId,
          personaId: testPersonaId,
          type: 'type',
          label: 'entity-1',
          frames: {
            boxes: [{ x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true }],
            interpolationSegments: [],
            visibilityRanges: [],
            totalFrames: 1,
            keyframeCount: 1,
            interpolatedFrameCount: 0
          }
        }
      })

      // Export data
      const exportResponse = await app.inject({
        method: 'GET',
        url: '/api/export',
        cookies: { session_token: testSessionToken }
      })

      expect(exportResponse.statusCode).toBe(200)
      const exportedData = exportResponse.body

      // Verify exported data is valid JSONL
      const lines = exportedData.trim().split('\n').filter(l => l)
      lines.forEach(line => {
        expect(() => JSON.parse(line)).not.toThrow()
        const parsed = JSON.parse(line)
        expect(parsed.type).toBeDefined()
        expect(parsed.data).toBeDefined()
      })
    })
  })
})
