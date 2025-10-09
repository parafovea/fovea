/**
 * Database connection and Prisma integration tests.
 *
 * These tests verify:
 * - Prisma client is properly configured and available
 * - Database connection is successful
 * - Basic CRUD operations work
 * - Graceful shutdown disconnects properly
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

describe('Database Connection', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterEach(async () => {
    // Clean up database between tests to avoid unique constraint violations
    await app.prisma.annotation.deleteMany()
    await app.prisma.videoSummary.deleteMany()
    await app.prisma.ontology.deleteMany()
    await app.prisma.video.deleteMany()
    await app.prisma.persona.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  it('should have Prisma client decorated on Fastify instance', () => {
    expect(app.prisma).toBeDefined()
    expect(app.prisma.$connect).toBeDefined()
    expect(app.prisma.$disconnect).toBeDefined()
  })

  it('should successfully connect to the database', async () => {
    // Execute a simple query to verify connection
    await expect(app.prisma.$queryRaw`SELECT 1 as result`).resolves.toBeDefined()
  })

  it('should have pgvector extension enabled', async () => {
    const result = await app.prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `
    expect(result).toHaveLength(1)
    expect(result[0].extname).toBe('vector')
  })

  it('should have all required tables created', async () => {
    const tables = await app.prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `

    const tableNames = tables.map(t => t.tablename)
    expect(tableNames).toContain('personas')
    expect(tableNames).toContain('ontologies')
    expect(tableNames).toContain('videos')
    expect(tableNames).toContain('video_summaries')
    expect(tableNames).toContain('annotations')
  })

  describe('Persona Model', () => {
    it('should create a new persona', async () => {
      const persona = await app.prisma.persona.create({
        data: {
          name: 'Test Analyst',
          role: 'Intelligence Officer',
          informationNeed: 'Track suspicious activities'
        }
      })

      expect(persona.id).toBeDefined()
      expect(persona.name).toBe('Test Analyst')
      expect(persona.role).toBe('Intelligence Officer')
      expect(persona.createdAt).toBeInstanceOf(Date)
      expect(persona.updatedAt).toBeInstanceOf(Date)
    })

    it('should retrieve personas', async () => {
      // Create a persona first
      await app.prisma.persona.create({
        data: {
          name: 'Retrieve Test',
          role: 'Analyst',
          informationNeed: 'Test'
        }
      })

      const personas = await app.prisma.persona.findMany()
      expect(Array.isArray(personas)).toBe(true)
      expect(personas.length).toBeGreaterThan(0)
    })

    it('should update a persona', async () => {
      const persona = await app.prisma.persona.create({
        data: {
          name: 'Original Name',
          role: 'Analyst',
          informationNeed: 'Test'
        }
      })

      // Wait 1ms to ensure updatedAt timestamp changes
      await new Promise(resolve => setTimeout(resolve, 1))

      const updated = await app.prisma.persona.update({
        where: { id: persona.id },
        data: { name: 'Updated Analyst' }
      })

      expect(updated.name).toBe('Updated Analyst')
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(persona.updatedAt.getTime())
    })

    it('should delete a persona', async () => {
      const persona = await app.prisma.persona.create({
        data: {
          name: 'To Delete',
          role: 'Test',
          informationNeed: 'Test'
        }
      })

      await app.prisma.persona.delete({
        where: { id: persona.id }
      })

      const found = await app.prisma.persona.findUnique({
        where: { id: persona.id }
      })

      expect(found).toBeNull()
    })
  })

  describe('Video Model', () => {
    it('should create a new video', async () => {
      const video = await app.prisma.video.create({
        data: {
          filename: 'db-test-video.mp4',
          path: '/data/videos/db-test-video.mp4',
          duration: 120.5,
          frameRate: 30,
          resolution: '1920x1080'
        }
      })

      expect(video.id).toBeDefined()
      expect(video.filename).toBe('db-test-video.mp4')
      expect(video.duration).toBe(120.5)
    })

    it('should enforce unique filename constraint', async () => {
      await app.prisma.video.create({
        data: {
          filename: 'db-unique-test.mp4',
          path: '/data/videos/db-unique-test.mp4'
        }
      })

      await expect(
        app.prisma.video.create({
          data: {
            filename: 'db-unique-test.mp4',
            path: '/data/videos/another-path.mp4'
          }
        })
      ).rejects.toThrow()
    })
  })

  describe('Ontology Model', () => {
    it('should create an ontology for a persona', async () => {
      const persona = await app.prisma.persona.create({
        data: {
          name: 'Ontology Test',
          role: 'Analyst',
          informationNeed: 'Test'
        }
      })

      const ontology = await app.prisma.ontology.create({
        data: {
          personaId: persona.id,
          entityTypes: [
            { id: '1', name: 'Person', description: 'Human entity' }
          ],
          eventTypes: [
            { id: '1', name: 'Meeting', description: 'Gathering of people' }
          ],
          roleTypes: [],
          relationTypes: []
        }
      })

      expect(ontology.id).toBeDefined()
      expect(ontology.personaId).toBe(persona.id)
      expect(Array.isArray(ontology.entityTypes)).toBe(true)
    })

    it('should cascade delete ontology when persona is deleted', async () => {
      const persona = await app.prisma.persona.create({
        data: {
          name: 'Cascade Test',
          role: 'Test',
          informationNeed: 'Test',
          ontology: {
            create: {
              entityTypes: [],
              eventTypes: [],
              roleTypes: [],
              relationTypes: []
            }
          }
        },
        include: { ontology: true }
      })

      const ontologyId = persona.ontology!.id

      await app.prisma.persona.delete({
        where: { id: persona.id }
      })

      const ontology = await app.prisma.ontology.findUnique({
        where: { id: ontologyId }
      })

      expect(ontology).toBeNull()
    })
  })

  describe('VideoSummary Model', () => {
    it('should create a video summary with persona relation', async () => {
      const persona = await app.prisma.persona.create({
        data: {
          name: 'Summary Test',
          role: 'Analyst',
          informationNeed: 'Test'
        }
      })

      const video = await app.prisma.video.create({
        data: {
          filename: 'db-summary-test.mp4',
          path: '/data/videos/db-summary-test.mp4'
        }
      })

      const summary = await app.prisma.videoSummary.create({
        data: {
          videoId: video.id,
          personaId: persona.id,
          summary: 'This is a test summary of the video',
          confidence: 0.95
        }
      })

      expect(summary.id).toBeDefined()
      expect(summary.summary).toBe('This is a test summary of the video')
      expect(summary.confidence).toBe(0.95)
    })

    it('should enforce unique constraint on videoId-personaId pair', async () => {
      const persona = await app.prisma.persona.create({
        data: {
          name: 'Unique Summary Test',
          role: 'Analyst',
          informationNeed: 'Test'
        }
      })

      const video = await app.prisma.video.create({
        data: {
          filename: 'db-unique-summary.mp4',
          path: '/data/videos/db-unique-summary.mp4'
        }
      })

      await app.prisma.videoSummary.create({
        data: {
          videoId: video.id,
          personaId: persona.id,
          summary: 'First summary'
        }
      })

      await expect(
        app.prisma.videoSummary.create({
          data: {
            videoId: video.id,
            personaId: persona.id,
            summary: 'Duplicate summary'
          }
        })
      ).rejects.toThrow()
    })
  })

  describe('Annotation Model', () => {
    it('should create an annotation', async () => {
      const persona = await app.prisma.persona.create({
        data: {
          name: 'Annotation Test',
          role: 'Analyst',
          informationNeed: 'Test'
        }
      })

      const video = await app.prisma.video.create({
        data: {
          filename: 'db-annotation-test.mp4',
          path: '/data/videos/db-annotation-test.mp4'
        }
      })

      const annotation = await app.prisma.annotation.create({
        data: {
          videoId: video.id,
          personaId: persona.id,
          type: 'entity',
          label: 'Person',
          frames: {
            start: 0,
            end: 100,
            boxes: [
              { x: 100, y: 100, width: 50, height: 50 }
            ]
          },
          confidence: 0.89,
          source: 'ai-assisted'
        }
      })

      expect(annotation.id).toBeDefined()
      expect(annotation.type).toBe('entity')
      expect(annotation.label).toBe('Person')
      expect(annotation.source).toBe('ai-assisted')
      expect(typeof annotation.frames).toBe('object')
    })
  })

  describe('Graceful Shutdown', () => {
    it('should disconnect Prisma on app close', async () => {
      const testApp = await buildApp()
      await testApp.ready()

      // Spy on the $disconnect method
      let disconnectCalled = false
      const originalDisconnect = testApp.prisma.$disconnect.bind(testApp.prisma)
      testApp.prisma.$disconnect = async () => {
        disconnectCalled = true
        return originalDisconnect()
      }

      await testApp.close()

      expect(disconnectCalled).toBe(true)
    })
  })
})
