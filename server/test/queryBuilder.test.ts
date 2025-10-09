import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { buildDetectionQueryFromPersona, buildPersonaPrompts } from '../src/utils/queryBuilder.js'

/**
 * Unit tests for query builder utilities.
 * Tests persona-based query construction for detection and summarization.
 */
describe('Query Builder', () => {
  let app: FastifyInstance
  let prisma: PrismaClient

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await prisma.annotation.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.video.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.persona.deleteMany()
  })

  describe('buildDetectionQueryFromPersona', () => {
    it('builds structured query with persona context and entity types', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Baseball Scout',
          role: 'Player Development Analyst',
          informationNeed: 'Tracking pitcher mechanics',
          ontology: {
            create: {
              entityTypes: [
                { id: '1', name: 'Pitcher', description: 'Player who throws the ball' },
                { id: '2', name: 'Batter', description: 'Player at bat' },
                { id: '3', name: 'Baseball', description: 'The ball' },
              ],
              eventTypes: [],
              roleTypes: [],
              relationTypes: [],
            },
          },
        },
      })

      const query = await buildDetectionQueryFromPersona(persona.id, prisma)

      expect(query).toContain('Analyst: Baseball Scout')
      expect(query).toContain('Focus: Tracking pitcher mechanics')
      expect(query).toContain('Entity Types: pitcher, batter, baseball')
    })

    it('includes entity glosses when requested', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Baseball Scout',
          role: 'Player Development Analyst',
          informationNeed: 'Tracking pitcher mechanics',
          ontology: {
            create: {
              entityTypes: [
                { id: '1', name: 'Pitcher', description: 'Player who throws the ball' },
                { id: '2', name: 'Batter', description: 'Player at bat' },
              ],
              eventTypes: [],
              roleTypes: [],
              relationTypes: [],
            },
          },
        },
      })

      const query = await buildDetectionQueryFromPersona(persona.id, prisma, {
        includeEntityTypes: true,
        includeEntityGlosses: true,
      })

      expect(query).toContain('pitcher (Player who throws the ball)')
      expect(query).toContain('batter (Player at bat)')
    })

    it('includes all ontology types when requested', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Baseball Scout',
          role: 'Player Development Analyst',
          informationNeed: 'Tracking pitcher mechanics',
          ontology: {
            create: {
              entityTypes: [
                { id: '1', name: 'Pitcher', description: 'Throws the ball' },
              ],
              eventTypes: [
                { id: '1', name: 'Pitch', description: 'Throwing action' },
              ],
              roleTypes: [
                { id: '1', name: 'Pitcher', description: 'Throwing role' },
              ],
              relationTypes: [
                { id: '1', name: 'Throws', description: 'Throwing relation' },
              ],
            },
          },
        },
      })

      const query = await buildDetectionQueryFromPersona(persona.id, prisma, {
        includeEntityTypes: true,
        includeEventTypes: true,
        includeRoleTypes: true,
        includeRelationTypes: true,
      })

      expect(query).toContain('Entity Types: pitcher')
      expect(query).toContain('Event Types: pitch')
      expect(query).toContain('Roles: pitcher')
      expect(query).toContain('Relations: throws')
    })

    it('includes glosses for all types when requested', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Baseball Scout',
          role: 'Player Development Analyst',
          informationNeed: 'Tracking pitcher mechanics',
          ontology: {
            create: {
              entityTypes: [
                { id: '1', name: 'Pitcher', description: 'Throws the ball' },
              ],
              eventTypes: [
                { id: '1', name: 'Pitch', description: 'Throwing action' },
              ],
              roleTypes: [
                { id: '1', name: 'Pitcher', description: 'Throwing role' },
              ],
              relationTypes: [
                { id: '1', name: 'Throws', description: 'Throwing relation' },
              ],
            },
          },
        },
      })

      const query = await buildDetectionQueryFromPersona(persona.id, prisma, {
        includeEntityTypes: true,
        includeEntityGlosses: true,
        includeEventTypes: true,
        includeEventGlosses: true,
        includeRoleTypes: true,
        includeRoleGlosses: true,
        includeRelationTypes: true,
        includeRelationGlosses: true,
      })

      expect(query).toContain('Entity Types: pitcher (Throws the ball)')
      expect(query).toContain('Event Types: pitch (Throwing action)')
      expect(query).toContain('Roles: pitcher (Throwing role)')
      expect(query).toContain('Relations: throws (Throwing relation)')
    })

    it('includes entity instances from annotations', async () => {
      // Create videos first to satisfy foreign key constraint
      await prisma.video.createMany({
        data: [
          { id: 'qb-entity-video-1', filename: 'qb-entity-test1.mp4', path: '/data/qb-entity-test1.mp4' },
          { id: 'qb-entity-video-2', filename: 'qb-entity-test2.mp4', path: '/data/qb-entity-test2.mp4' },
        ],
      })

      const persona = await prisma.persona.create({
        data: {
          name: 'Baseball Scout',
          role: 'Player Development Analyst',
          informationNeed: 'Tracking pitcher mechanics',
          ontology: {
            create: {
              entityTypes: [
                { id: '1', name: 'Pitcher', description: 'Throws the ball' },
              ],
              eventTypes: [],
              roleTypes: [],
              relationTypes: [],
            },
          },
        },
      })

      // Create some annotations for this persona
      await prisma.annotation.createMany({
        data: [
          {
            videoId: 'qb-entity-video-1',
            personaId: persona.id,
            type: 'entity',
            label: 'John Smith',
            frames: {},
            source: 'manual',
          },
          {
            videoId: 'qb-entity-video-2',
            personaId: persona.id,
            type: 'entity',
            label: 'Derek Jeter',
            frames: {},
            source: 'manual',
          },
        ],
      })

      const query = await buildDetectionQueryFromPersona(persona.id, prisma, {
        includeEntityTypes: true,
        includeEntityInstances: true,
      })

      expect(query).toContain('Entity Types: pitcher')
      expect(query).toContain('Entity Instances: John Smith, Derek Jeter')
    })

    it('includes location instances from annotations', async () => {
      // Create videos first to satisfy foreign key constraint
      await prisma.video.createMany({
        data: [
          { id: 'qb-loc-video-1', filename: 'qb-loc-test-1.mp4', path: '/data/qb-loc-test-1.mp4' },
          { id: 'qb-loc-video-2', filename: 'qb-loc-test-2.mp4', path: '/data/qb-loc-test-2.mp4' },
        ],
      })

      const persona = await prisma.persona.create({
        data: {
          name: 'Baseball Scout',
          role: 'Player Development Analyst',
          informationNeed: 'Tracking games',
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

      // Create location annotations
      await prisma.annotation.createMany({
        data: [
          {
            videoId: 'qb-loc-video-1',
            personaId: persona.id,
            type: 'location',
            label: 'Yankee Stadium',
            frames: {},
            source: 'manual',
          },
          {
            videoId: 'qb-loc-video-2',
            personaId: persona.id,
            type: 'location',
            label: 'Fenway Park',
            frames: {},
            source: 'manual',
          },
        ],
      })

      const query = await buildDetectionQueryFromPersona(persona.id, prisma, {
        includeLocationInstances: true,
      })

      expect(query).toContain('Locations: Yankee Stadium, Fenway Park')
    })

    it('includes event and time instances from annotations', async () => {
      // Create videos first to satisfy foreign key constraint
      await prisma.video.createMany({
        data: [
          { id: 'qb-evt-video-1', filename: 'qb-evt-test-1.mp4', path: '/data/qb-evt-test-1.mp4' },
          { id: 'qb-evt-video-2', filename: 'qb-evt-test-2.mp4', path: '/data/qb-evt-test-2.mp4' },
        ],
      })

      const persona = await prisma.persona.create({
        data: {
          name: 'Baseball Scout',
          role: 'Player Development Analyst',
          informationNeed: 'Tracking events',
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

      // Create event and time annotations
      await prisma.annotation.createMany({
        data: [
          {
            videoId: 'qb-evt-video-1',
            personaId: persona.id,
            type: 'event',
            label: 'First Pitch',
            frames: {},
            source: 'manual',
          },
          {
            videoId: 'qb-evt-video-1',
            personaId: persona.id,
            type: 'time',
            label: '2:30 PM',
            frames: {},
            source: 'manual',
          },
        ],
      })

      const query = await buildDetectionQueryFromPersona(persona.id, prisma, {
        includeEventInstances: true,
        includeTimeInstances: true,
      })

      expect(query).toContain('Event Instances: First Pitch')
      expect(query).toContain('Times: 2:30 PM')
    })

    it('deduplicates instance labels across videos', async () => {
      // Create videos first to satisfy foreign key constraint
      await prisma.video.createMany({
        data: [
          { id: 'qb-dup-video-1', filename: 'qb-dup-test-1.mp4', path: '/data/qb-dup-test-1.mp4' },
          { id: 'qb-dup-video-2', filename: 'qb-dup-test-2.mp4', path: '/data/qb-dup-test-2.mp4' },
        ],
      })

      const persona = await prisma.persona.create({
        data: {
          name: 'Test Persona',
          role: 'Analyst',
          informationNeed: 'Testing',
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

      // Create duplicate annotations across different videos
      await prisma.annotation.createMany({
        data: [
          {
            videoId: 'qb-dup-video-1',
            personaId: persona.id,
            type: 'entity',
            label: 'John Smith',
            frames: {},
            source: 'manual',
          },
          {
            videoId: 'qb-dup-video-2',
            personaId: persona.id,
            type: 'entity',
            label: 'John Smith',
            frames: {},
            source: 'manual',
          },
        ],
      })

      const query = await buildDetectionQueryFromPersona(persona.id, prisma, {
        includeEntityInstances: true,
      })

      // Should only appear once
      const matches = query.match(/John Smith/g)
      expect(matches).toHaveLength(1)
    })

    it('includes only persona context when no types included', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Empty Persona',
          role: 'Analyst',
          informationNeed: 'Testing',
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

      const query = await buildDetectionQueryFromPersona(persona.id, prisma)

      expect(query).toContain('Analyst: Empty Persona')
      expect(query).toContain('Focus: Testing')
      expect(query).not.toContain('Entity Types:')
    })

    it('converts entity type names to lowercase', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Wildlife Researcher',
          role: 'Biologist',
          informationNeed: 'Animal behavior',
          ontology: {
            create: {
              entityTypes: [
                { id: '1', name: 'Lion', description: 'Large cat' },
                { id: '2', name: 'Zebra', description: 'Striped horse' },
              ],
              eventTypes: [],
              roleTypes: [],
              relationTypes: [],
            },
          },
        },
      })

      const query = await buildDetectionQueryFromPersona(persona.id, prisma)

      expect(query).toContain('Entity Types: lion, zebra')
    })

    it('throws error for non-existent persona', async () => {
      await expect(
        buildDetectionQueryFromPersona('00000000-0000-0000-0000-000000000000', prisma)
      ).rejects.toThrow('Persona not found')
    })

    it('throws error for persona without ontology', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'No Ontology',
          role: 'Analyst',
          informationNeed: 'Testing',
        },
      })

      await expect(buildDetectionQueryFromPersona(persona.id, prisma)).rejects.toThrow(
        'Persona has no ontology'
      )
    })

    it('does not exclude entity types without descriptions', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Test Persona',
          role: 'Analyst',
          informationNeed: 'Testing',
          ontology: {
            create: {
              entityTypes: [
                { id: '1', name: 'Person' },
                { id: '2', name: 'Car', description: 'Vehicle' },
              ],
              eventTypes: [],
              roleTypes: [],
              relationTypes: [],
            },
          },
        },
      })

      const query = await buildDetectionQueryFromPersona(persona.id, prisma)

      expect(query).toContain('Entity Types: person, car')
    })
  })

  describe('buildPersonaPrompts', () => {
    it('builds persona prompts from role and information need', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Baseball Scout',
          role: 'Player Development Analyst',
          informationNeed: 'Evaluating pitcher mechanics and pitch selection',
        },
      })

      const prompts = await buildPersonaPrompts(persona.id, prisma)

      expect(prompts.persona_role).toBe('Player Development Analyst')
      expect(prompts.information_need).toBe('Evaluating pitcher mechanics and pitch selection')
    })

    it('throws error for non-existent persona', async () => {
      await expect(
        buildPersonaPrompts('00000000-0000-0000-0000-000000000000', prisma)
      ).rejects.toThrow('Persona not found')
    })

    it('returns prompts for Automated persona', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Automated',
          role: 'Analyst',
          informationNeed: 'Understanding the content and events in this video',
        },
      })

      const prompts = await buildPersonaPrompts(persona.id, prisma)

      expect(prompts.persona_role).toBe('Analyst')
      expect(prompts.information_need).toBe('Understanding the content and events in this video')
    })
  })
})
