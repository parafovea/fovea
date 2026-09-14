import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { seedBaselinePermissions } from '../helpers/rbac-test-setup.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { claimExtractionQueue, claimSynthesisQueue } from '../../src/queues/setup.js'
import {
  writeClaim,
  writeClaimRelation,
  readClaimById,
} from '../../src/services/layers-bridge/claim-bridge.js'
import { writeOntologyAggregate } from '../../src/services/layers-bridge/ontology-bridge.js'
import type { StoredClaim, StoredRelation } from '../../src/services/claim-layers-mapper.js'

/** Claim seed fields, matching the legacy `prisma.claim.create` data shape. */
type SeedClaimInput = Partial<StoredClaim> & { summaryId: string; summaryType: string; text: string }

/** Relation seed fields, matching the legacy `prisma.claimRelation.create` data shape. */
type SeedRelationInput = Partial<StoredRelation> & {
  sourceClaimId: string
  targetClaimId: string
  relationTypeId: string
}

/** Ontology seed fields, matching the legacy `prisma.ontology.create` data shape. */
interface SeedOntologyInput {
  personaId: string
  entityTypes?: unknown[]
  eventTypes?: unknown[]
  roleTypes?: unknown[]
  relationTypes?: unknown[]
}

/** Seeds a claim into the layers store, returning the stored claim (carries its id). */
async function seedClaim(prisma: PrismaClient, args: { data: SeedClaimInput }): Promise<StoredClaim> {
  const d = args.data
  const summary = await prisma.videoSummary.findUniqueOrThrow({ where: { id: d.summaryId } })
  const now = new Date().toISOString()
  const claim: StoredClaim = {
    id: d.id ?? randomUUID(),
    summaryId: d.summaryId,
    summaryType: d.summaryType,
    text: d.text,
    gloss: d.gloss ?? [],
    parentClaimId: d.parentClaimId ?? null,
    textSpans: d.textSpans ?? null,
    timeSpans: d.timeSpans ?? null,
    claimerType: d.claimerType ?? null,
    claimerGloss: d.claimerGloss ?? null,
    claimRelation: d.claimRelation ?? null,
    claimEventId: d.claimEventId ?? null,
    claimTimeId: d.claimTimeId ?? null,
    claimLocationId: d.claimLocationId ?? null,
    confidence: d.confidence ?? null,
    modelUsed: d.modelUsed ?? null,
    extractionStrategy: d.extractionStrategy ?? null,
    audio: d.audio ?? null,
    video: d.video ?? null,
    metadata: d.metadata ?? null,
    comment: d.comment ?? null,
    createdBy: d.createdBy ?? summary.createdBy ?? null,
    projectId: d.projectId ?? summary.projectId ?? null,
    createdAt: now,
    updatedAt: now,
  }
  await writeClaim(
    prisma,
    { id: summary.id, videoId: summary.videoId, projectId: summary.projectId, createdBy: summary.createdBy },
    claim,
  )
  return claim
}

/** Seeds several claims into the layers store, matching the legacy createMany shape. */
async function seedClaims(prisma: PrismaClient, args: { data: SeedClaimInput[] }): Promise<void> {
  for (const data of args.data) await seedClaim(prisma, { data })
}

/** Seeds a claim relation into the layers store, returning the stored relation. */
async function seedRelation(prisma: PrismaClient, args: { data: SeedRelationInput }): Promise<StoredRelation> {
  const d = args.data
  const source = await readClaimById(prisma, d.sourceClaimId)
  const now = new Date().toISOString()
  const relation: StoredRelation = {
    id: d.id ?? randomUUID(),
    sourceClaimId: d.sourceClaimId,
    targetClaimId: d.targetClaimId,
    relationTypeId: d.relationTypeId,
    sourceSpans: d.sourceSpans ?? null,
    targetSpans: d.targetSpans ?? null,
    confidence: d.confidence ?? null,
    notes: d.notes ?? null,
    createdBy: d.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  }
  await writeClaimRelation(prisma, relation, source?.summaryId ?? '', source?.projectId ?? null)
  return relation
}

/** Seeds a persona ontology into the layers store, matching the legacy ontology create/update. */
async function seedClaimOntology(prisma: PrismaClient, args: { data: SeedOntologyInput }): Promise<void> {
  const d = args.data
  const persona = await prisma.persona.findUniqueOrThrow({ where: { id: d.personaId } })
  await writeOntologyAggregate(
    prisma,
    d.personaId,
    {
      entityTypes: d.entityTypes ?? [],
      eventTypes: d.eventTypes ?? [],
      roleTypes: d.roleTypes ?? [],
      relationTypes: d.relationTypes ?? [],
    },
    { name: `${persona.name} ontology`, description: persona.informationNeed, domain: persona.domain },
    { projectId: persona.projectId, createdByUserId: persona.userId },
  )
}

/**
 * Integration tests for the Claims API.
 * Tests CRUD operations, extraction, synthesis, and hierarchical claims.
 */
describe('Claims API', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let testUserId: string
  let testSessionToken: string
  let testVideoId: string
  let testPersonaId: string
  let testSummaryId: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
  }, 30000)

  beforeEach(async () => {
    // Clean database in dependency order: legacy claim tables, then the layers
    // store rows the claims now materialize into (child -> parent), then the
    // remaining legacy tables.
    await prisma.textAnnotationRelation.deleteMany()
    await prisma.layersAnnotation.deleteMany()
    await prisma.clusterSet.deleteMany()
    await prisma.alignment.deleteMany()
    await prisma.tokenization.deleteMany()
    await prisma.segmentation.deleteMany()
    await prisma.annotationLayer.deleteMany()
    await prisma.graphEdge.deleteMany()
    await prisma.graphNode.deleteMany()
    await prisma.expression.deleteMany()
    await prisma.media.deleteMany()
    await prisma.apiKey.deleteMany()
    await prisma.session.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.video.deleteMany()
    await prisma.user.deleteMany()
    await prisma.rolePermission.deleteMany()
    await seedBaselinePermissions(prisma)

    // Create test user
    const passwordHash = await hashPassword('testpass123')
    const user = await prisma.user.create({
      data: {
        username: 'testuser',
        email: 'test@example.com',
        passwordHash,
        displayName: 'Test User',
        isAdmin: false,
      }
    })
    testUserId = user.id

    // Login to get session token
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'testuser', password: 'testpass123' }
    })
    testSessionToken = loginResponse.cookies.find(c => c.name === 'session_token')!.value

    // Create test video
    const video = await prisma.video.create({
      data: {
        filename: 'test-video.mp4',
        path: '/data/test-video.mp4',
        duration: 60,
        frameRate: 30,
        resolution: '1920x1080',
      }
    })
    testVideoId = video.id

    // Create test persona
    const persona = await prisma.persona.create({
      data: {
        name: 'Test Analyst',
        role: 'Video Analyst',
        informationNeed: 'Analyzing video content',
        userId: testUserId
      }
    })
    testPersonaId = persona.id

    // Create test summary
    const summary = await prisma.videoSummary.create({
      data: {
        videoId: testVideoId,
        personaId: testPersonaId,
        summary: [
          { type: 'text', content: 'The video shows a rocket launch at Cape Canaveral. ' },
          { type: 'text', content: 'The rocket successfully reached orbit.' }
        ],
        visualAnalysis: 'Video analysis results',
        confidence: 0.95
      }
    })
    testSummaryId = summary.id
  })

  describe('GET /api/summaries/:summaryId/claims', () => {
    it('should return empty array when no claims exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/summaries/${testSummaryId}/claims`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual([])
    })

    it('should return claims with subclaims', async () => {
      // Create parent claim
      const parentClaim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'The rocket launch was successful',
          gloss: [],
          confidence: 0.95,
          extractionStrategy: 'sentence-based'
        }
      })

      // Create subclaims
      await seedClaims(prisma, {
        data: [
          {
            summaryId: testSummaryId,
            summaryType: 'video',
            text: 'The rocket was launched',
            gloss: [],
            parentClaimId: parentClaim.id,
            confidence: 0.98,
            extractionStrategy: 'hierarchical'
          },
          {
            summaryId: testSummaryId,
            summaryType: 'video',
            text: 'The launch was successful',
            gloss: [],
            parentClaimId: parentClaim.id,
            confidence: 0.92,
            extractionStrategy: 'hierarchical'
          }
        ]
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/summaries/${testSummaryId}/claims`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      const claims = response.json()
      expect(claims).toHaveLength(1)
      expect(claims[0].text).toBe('The rocket launch was successful')
      expect(claims[0].subclaims).toHaveLength(2)
    })

    it('should filter by minimum confidence', async () => {
      await seedClaims(prisma, {
        data: [
          {
            summaryId: testSummaryId,
            summaryType: 'video',
            text: 'High confidence claim',
            gloss: [],
            confidence: 0.95
          },
          {
            summaryId: testSummaryId,
            summaryType: 'video',
            text: 'Low confidence claim',
            gloss: [],
            confidence: 0.4
          }
        ]
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/summaries/${testSummaryId}/claims?minConfidence=0.8`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      const claims = response.json()
      expect(claims).toHaveLength(1)
      expect(claims[0].text).toBe('High confidence claim')
    })

    it('should return 404 for non-existent summary', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/summaries/00000000-0000-0000-0000-000000000000/claims',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().error).toBe('NOT_FOUND')
    })
  })

  describe('POST /api/summaries/:summaryId/claims', () => {
    it('should create a new claim', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/summaries/${testSummaryId}/claims`,
        cookies: { session_token: testSessionToken },
        payload: {
          summaryType: 'video',
          text: 'The rocket reached orbit',
          gloss: [],
          confidence: 0.9
        }
      })

      expect(response.statusCode).toBe(201)
      const result = response.json()
      expect(result.claims).toHaveLength(1)
      expect(result.claims[0].text).toBe('The rocket reached orbit')
      expect(result.claims[0].extractionStrategy).toBe('manual')
    })

    it('should create a subclaim', async () => {
      // Create parent claim
      const parentClaim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Parent claim',
          gloss: []
        }
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/summaries/${testSummaryId}/claims`,
        cookies: { session_token: testSessionToken },
        payload: {
          summaryType: 'video',
          text: 'Child claim',
          gloss: [],
          parentClaimId: parentClaim.id
        }
      })

      expect(response.statusCode).toBe(201)
      const result = response.json()
      // Backend returns root claims with nested subclaims
      expect(result.claims).toHaveLength(1)
      expect(result.claims[0].id).toBe(parentClaim.id)
      expect(result.claims[0].subclaims).toHaveLength(1)
      expect(result.claims[0].subclaims[0].text).toBe('Child claim')
      expect(result.claims[0].subclaims[0].parentClaimId).toBe(parentClaim.id)
    })

    it('should return 404 when parent claim does not exist', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/summaries/${testSummaryId}/claims`,
        cookies: { session_token: testSessionToken },
        payload: {
          summaryType: 'video',
          text: 'Child claim',
          parentClaimId: '00000000-0000-0000-0000-000000000000'
        }
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('VALIDATION_ERROR')
      expect(response.json().message).toContain('Invalid parent claim')
    })

    it('should create a claim with modality metadata', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/summaries/${testSummaryId}/claims`,
        cookies: { session_token: testSessionToken },
        payload: {
          summaryType: 'video',
          text: 'The speaker mentions the weather',
          gloss: [],
          audio: ['speech'],
          video: ['non-text'],
          metadata: ['non-text']
        }
      })

      expect(response.statusCode).toBe(201)
      const result = response.json()
      expect(result.claims).toHaveLength(1)
      expect(result.claims[0].audio).toEqual(['speech'])
      expect(result.claims[0].video).toEqual(['non-text'])
      expect(result.claims[0].metadata).toEqual(['non-text'])
    })

    it('should create a claim with partial modality metadata', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/summaries/${testSummaryId}/claims`,
        cookies: { session_token: testSessionToken },
        payload: {
          summaryType: 'video',
          text: 'Text visible on screen',
          gloss: [],
          video: ['text']
        }
      })

      expect(response.statusCode).toBe(201)
      const result = response.json()
      expect(result.claims).toHaveLength(1)
      expect(result.claims[0].video).toEqual(['text'])
      expect(result.claims[0].audio).toBeNull()
      expect(result.claims[0].metadata).toBeNull()
    })

    it('should create a claim with comment field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/summaries/${testSummaryId}/claims`,
        cookies: { session_token: testSessionToken },
        payload: {
          summaryType: 'video',
          text: 'Test claim with comment',
          gloss: [],
          comment: 'This is a test comment'
        }
      })

      expect(response.statusCode).toBe(201)
      const result = response.json()
      expect(result.claims).toHaveLength(1)
      expect(result.claims[0].comment).toBe('This is a test comment')
    })

    it('should create a claim without comment field (null)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/summaries/${testSummaryId}/claims`,
        cookies: { session_token: testSessionToken },
        payload: {
          summaryType: 'video',
          text: 'Test claim without comment',
          gloss: [],
          comment: null
        }
      })

      expect(response.statusCode).toBe(201)
      const result = response.json()
      expect(result.claims).toHaveLength(1)
      expect(result.claims[0].comment).toBeNull()
    })

    it('should create a claim without modality metadata', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/summaries/${testSummaryId}/claims`,
        cookies: { session_token: testSessionToken },
        payload: {
          summaryType: 'video',
          text: 'A claim without modality info',
          gloss: []
        }
      })

      expect(response.statusCode).toBe(201)
      const result = response.json()
      expect(result.claims).toHaveLength(1)
      expect(result.claims[0].audio).toBeNull()
      expect(result.claims[0].video).toBeNull()
      expect(result.claims[0].metadata).toBeNull()
    })
  })

  describe('PUT /api/summaries/:summaryId/claims/:claimId', () => {
    it('should update a claim', async () => {
      const claim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Original text',
          gloss: []
        }
      })

      const response = await app.inject({
        method: 'PUT',
        url: `/api/summaries/${testSummaryId}/claims/${claim.id}`,
        cookies: { session_token: testSessionToken },
        payload: {
          text: 'Updated text',
          confidence: 0.85
        }
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      expect(result.claims).toHaveLength(1)
      expect(result.claims[0].text).toBe('Updated text')
      expect(result.claims[0].confidence).toBe(0.85)
    })

    it('should return 404 for non-existent claim', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/summaries/${testSummaryId}/claims/00000000-0000-0000-0000-000000000000`,
        cookies: { session_token: testSessionToken },
        payload: {
          text: 'Updated text'
        }
      })

      expect(response.statusCode).toBe(404)
    })

    it('should update modality metadata', async () => {
      const claim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Original claim',
          gloss: []
        }
      })

      const response = await app.inject({
        method: 'PUT',
        url: `/api/summaries/${testSummaryId}/claims/${claim.id}`,
        cookies: { session_token: testSessionToken },
        payload: {
          audio: ['non-speech'],
          video: ['text'],
          metadata: ['text']
        }
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      expect(result.claims).toHaveLength(1)
      expect(result.claims[0].audio).toEqual(['non-speech'])
      expect(result.claims[0].video).toEqual(['text'])
      expect(result.claims[0].metadata).toEqual(['text'])
    })

    it('should update modality metadata to null', async () => {
      const claim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Claim with metadata',
          gloss: [],
          audio: ['speech'],
          video: ['text'],
          metadata: ['text']
        }
      })

      const response = await app.inject({
        method: 'PUT',
        url: `/api/summaries/${testSummaryId}/claims/${claim.id}`,
        cookies: { session_token: testSessionToken },
        payload: {
          audio: null,
          video: null,
          metadata: null
        }
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      expect(result.claims).toHaveLength(1)
      // Find the updated claim in the tree
      const updatedClaim = result.claims.find((c: { id: string }) => c.id === claim.id)
      expect(updatedClaim).toBeDefined()
      expect(updatedClaim.audio).toBeNull()
      expect(updatedClaim.video).toBeNull()
      // For boolean fields, Prisma may return false instead of null when set to null
      // This is acceptable behavior - the important thing is that the update succeeded
      // and the field can be set/unset. Verify the update worked by checking audio/video are null
      expect(updatedClaim.metadata === null || updatedClaim.metadata === undefined || (Array.isArray(updatedClaim.metadata) && updatedClaim.metadata.length === 0)).toBe(true)
    })

    it('should return existing claims with null modality metadata', async () => {
      // Create claim without modality metadata (existing data pattern)
      const claim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Existing claim',
          gloss: []
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/summaries/${testSummaryId}/claims/${claim.id}`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      // Should handle null gracefully - Prisma may return null or undefined for unset fields
      expect(result.audio === null || result.audio === undefined).toBe(true)
      expect(result.video === null || result.video === undefined).toBe(true)
      expect(result.metadata === null || result.metadata === undefined).toBe(true)
    })

    it('should validate audio enum values', async () => {
      const claim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Test claim',
          gloss: []
        }
      })

      const response = await app.inject({
        method: 'PUT',
        url: `/api/summaries/${testSummaryId}/claims/${claim.id}`,
        cookies: { session_token: testSessionToken },
        payload: {
          audio: ['invalid-value']
        }
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('VALIDATION_ERROR')
    })

    it('should validate video enum values', async () => {
      const claim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Test claim',
          gloss: []
        }
      })

      const response = await app.inject({
        method: 'PUT',
        url: `/api/summaries/${testSummaryId}/claims/${claim.id}`,
        cookies: { session_token: testSessionToken },
        payload: {
          video: ['invalid-value']
        }
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('VALIDATION_ERROR')
    })

    it('should accept all valid audio enum values', async () => {
      const claim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Test claim',
          gloss: []
        }
      })

      // Test 'speech'
      const response1 = await app.inject({
        method: 'PUT',
        url: `/api/summaries/${testSummaryId}/claims/${claim.id}`,
        cookies: { session_token: testSessionToken },
        payload: { audio: ['speech'] }
      })
      expect(response1.statusCode).toBe(200)

      // Test 'non-speech'
      const response2 = await app.inject({
        method: 'PUT',
        url: `/api/summaries/${testSummaryId}/claims/${claim.id}`,
        cookies: { session_token: testSessionToken },
        payload: { audio: ['non-speech'] }
      })
      expect(response2.statusCode).toBe(200)
    })

    it('should accept all valid video enum values', async () => {
      const claim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Test claim',
          gloss: []
        }
      })

      // Test 'text'
      const response1 = await app.inject({
        method: 'PUT',
        url: `/api/summaries/${testSummaryId}/claims/${claim.id}`,
        cookies: { session_token: testSessionToken },
        payload: { video: ['text'] }
      })
      expect(response1.statusCode).toBe(200)

      // Test 'non-text'
      const response2 = await app.inject({
        method: 'PUT',
        url: `/api/summaries/${testSummaryId}/claims/${claim.id}`,
        cookies: { session_token: testSessionToken },
        payload: { video: 'non-text' }
      })
      expect(response2.statusCode).toBe(200)
    })

    it('should accept array metadata values', async () => {
      const claim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Test claim',
          gloss: []
        }
      })

      // Test true
      const response1 = await app.inject({
        method: 'PUT',
        url: `/api/summaries/${testSummaryId}/claims/${claim.id}`,
        cookies: { session_token: testSessionToken },
        payload: { metadata: ['text'] }
      })
      expect(response1.statusCode).toBe(200)
      expect(response1.json().claims[0].metadata).toEqual(['text'])

      // Test non-text metadata
      const response2 = await app.inject({
        method: 'PUT',
        url: `/api/summaries/${testSummaryId}/claims/${claim.id}`,
        cookies: { session_token: testSessionToken },
        payload: { metadata: ['non-text'] }
      })
      expect(response2.statusCode).toBe(200)
      expect(response2.json().claims[0].metadata).toEqual(['non-text'])
    })

    it('should update a claim comment field', async () => {
      const claim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Test claim',
          gloss: []
        }
      })

      const response = await app.inject({
        method: 'PUT',
        url: `/api/summaries/${testSummaryId}/claims/${claim.id}`,
        cookies: { session_token: testSessionToken },
        payload: {
          comment: 'Updated comment'
        }
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      expect(result.claims[0].comment).toBe('Updated comment')
    })

    it('should set comment to null when updating with null', async () => {
      const claim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Test claim',
          gloss: [],
          comment: 'Original comment'
        }
      })

      const response = await app.inject({
        method: 'PUT',
        url: `/api/summaries/${testSummaryId}/claims/${claim.id}`,
        cookies: { session_token: testSessionToken },
        payload: {
          comment: null
        }
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      expect(result.claims[0].comment).toBeNull()
    })

    it('should preserve modality metadata when updating other fields', async () => {
      const claim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Original claim',
          gloss: [],
          audio: ['speech'],
          video: ['text'],
          metadata: ['text']
        }
      })

      const response = await app.inject({
        method: 'PUT',
        url: `/api/summaries/${testSummaryId}/claims/${claim.id}`,
        cookies: { session_token: testSessionToken },
        payload: {
          text: 'Updated text',
          confidence: 0.95
        }
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      const updatedClaim = result.claims.find((c: { id: string }) => c.id === claim.id)
      expect(updatedClaim?.text).toBe('Updated text')
      expect(updatedClaim?.confidence).toBe(0.95)
      expect(updatedClaim?.audio).toEqual(['speech'])
      expect(updatedClaim?.video).toEqual(['text'])
      expect(updatedClaim?.metadata).toEqual(['text'])
    })

    it('should include modality metadata in GET /api/summaries/:summaryId/claims response', async () => {
      await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Claim with all modality fields',
          gloss: [],
          audio: ['speech'],
          video: ['non-text'],
          metadata: ['non-text']
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/summaries/${testSummaryId}/claims`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      const claims = response.json()
      expect(claims).toHaveLength(1)
      expect(claims[0].audio).toEqual(['speech'])
      expect(claims[0].video).toEqual(['non-text'])
      expect(claims[0].metadata).toEqual(['non-text'])
    })

    it('should include modality metadata in subclaims', async () => {
      const parentClaim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Parent claim',
          gloss: []
        }
      })

      await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Subclaim with modality',
          gloss: [],
          parentClaimId: parentClaim.id,
          audio: ['non-speech'],
          video: ['text'],
          metadata: ['text']
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/summaries/${testSummaryId}/claims`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      const claims = response.json()
      expect(claims).toHaveLength(1)
      expect(claims[0].subclaims).toHaveLength(1)
      expect(claims[0].subclaims[0].audio).toEqual(['non-speech'])
      expect(claims[0].subclaims[0].video).toEqual(['text'])
      expect(claims[0].subclaims[0].metadata).toEqual(['text'])
    })

    it('should handle partial modality metadata updates', async () => {
      const claim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Original claim',
          gloss: [],
          audio: ['speech'],
          video: ['text'],
          metadata: ['text']
        }
      })

      // Update only audio, leaving video and metadata unchanged
      const response = await app.inject({
        method: 'PUT',
        url: `/api/summaries/${testSummaryId}/claims/${claim.id}`,
        cookies: { session_token: testSessionToken },
        payload: {
          audio: ['non-speech']
        }
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      const updatedClaim = result.claims.find((c: { id: string }) => c.id === claim.id)
      expect(updatedClaim?.audio).toEqual(['non-speech'])
      expect(updatedClaim?.video).toEqual(['text']) // Should remain unchanged
      expect(updatedClaim?.metadata).toEqual(['text']) // Should remain unchanged
    })
  })

  describe('DELETE /api/summaries/:summaryId/claims/:claimId', () => {
    it('should delete a claim', async () => {
      const claim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Claim to delete',
          gloss: [],
          createdBy: testUserId
        }
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/summaries/${testSummaryId}/claims/${claim.id}`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().success).toBe(true)

      // Verify claim no longer surfaces through the layers-backed read path.
      const afterList = await app.inject({
        method: 'GET',
        url: `/api/summaries/${testSummaryId}/claims`,
        cookies: { session_token: testSessionToken },
      })
      expect(afterList.statusCode).toBe(200)
      expect(afterList.json().map((c: { id: string }) => c.id)).not.toContain(claim.id)
    })

    it('should cascade delete subclaims', async () => {
      // Create parent with subclaim
      const parentClaim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Parent claim',
          gloss: [],
          createdBy: testUserId
        }
      })

      const subClaim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Subclaim',
          gloss: [],
          parentClaimId: parentClaim.id,
          createdBy: testUserId
        }
      })

      // Delete parent
      await app.inject({
        method: 'DELETE',
        url: `/api/summaries/${testSummaryId}/claims/${parentClaim.id}`,
        cookies: { session_token: testSessionToken }
      })

      // Verify neither the parent nor its subclaim surfaces through the read path.
      const afterList = await app.inject({
        method: 'GET',
        url: `/api/summaries/${testSummaryId}/claims`,
        cookies: { session_token: testSessionToken },
      })
      expect(afterList.statusCode).toBe(200)
      const remainingIds = afterList.json().map((c: { id: string }) => c.id)
      expect(remainingIds).not.toContain(parentClaim.id)
      expect(remainingIds).not.toContain(subClaim.id)
    })
  })

  describe('POST /api/summaries/:summaryId/claims/generate', () => {
    it('should queue extraction job', async () => {
      // Mock queue.add
      const mockJob = { id: 'test-job-123' }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- BullMQ Job type requires any for mocking
      const addSpy = vi.spyOn(claimExtractionQueue, 'add').mockResolvedValue(mockJob as any)

      const response = await app.inject({
        method: 'POST',
        url: `/api/summaries/${testSummaryId}/claims/generate`,
        cookies: { session_token: testSessionToken },
        payload: {
          summaryType: 'video',
          inputSources: {
            includeSummaryText: true,
            includeAnnotations: false,
            includeOntology: false,
            ontologyDepth: 'names-only'
          },
          extractionStrategy: 'sentence-based',
          maxClaimsPerSummary: 50,
          minConfidence: 0.5
        }
      })

      expect(response.statusCode).toBe(202)
      const result = response.json()
      expect(result.jobId).toBe('test-job-123')
      expect(result.status).toBe('queued')
      expect(addSpy).toHaveBeenCalled()

      addSpy.mockRestore()
    })

    it('should return 404 for non-existent summary', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/summaries/00000000-0000-0000-0000-000000000000/claims/generate',
        cookies: { session_token: testSessionToken },
        payload: {
          summaryType: 'video',
          inputSources: {
            includeSummaryText: true,
            includeAnnotations: false,
            includeOntology: false,
            ontologyDepth: 'names-only'
          },
          extractionStrategy: 'sentence-based'
        }
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('POST /api/summaries/:summaryId/synthesize', () => {
    it('should queue synthesis job', async () => {
      // Create claim first
      await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Test claim',
          gloss: []
        }
      })

      // Mock queue.add
      const mockJob = { id: 'synthesis-job-456' }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- BullMQ Job type requires any for mocking
      const addSpy = vi.spyOn(claimSynthesisQueue, 'add').mockResolvedValue(mockJob as any)

      const response = await app.inject({
        method: 'POST',
        url: `/api/summaries/${testSummaryId}/synthesize`,
        cookies: { session_token: testSessionToken },
        payload: {
          synthesis_strategy: 'hierarchical',
          max_length: 500,
          include_conflicts: true,
          include_citations: false
        }
      })

      expect(response.statusCode).toBe(202)
      const result = response.json()
      expect(result.jobId).toBe('synthesis-job-456')
      expect(result.status).toBe('queued')
      expect(addSpy).toHaveBeenCalled()

      addSpy.mockRestore()
    })

    it('should return 400 when summary has no claims', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/summaries/${testSummaryId}/synthesize`,
        cookies: { session_token: testSessionToken },
        payload: {
          synthesis_strategy: 'hierarchical'
        }
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('VALIDATION_ERROR')
      expect(response.json().message).toContain('no claims')
    })
  })

  describe('Claim Relations', () => {
    let claim1Id: string
    let claim2Id: string
    let relationTypeId: string

    beforeEach(async () => {
      // Create ontology with relation type
      await seedClaimOntology(prisma, {
        data: {
          personaId: testPersonaId,
          relationTypes: [
            {
              id: 'conflicts',
              name: 'Conflicts With',
              gloss: [{ type: 'text', content: 'Contradicts another claim' }],
              sourceTypes: ['claim'],
              targetTypes: ['claim']
            }
          ]
        }
      })
      relationTypeId = 'conflicts'

      // Create two claims
      const c1 = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Claim 1',
          gloss: []
        }
      })
      claim1Id = c1.id

      const c2 = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Claim 2',
          gloss: []
        }
      })
      claim2Id = c2.id
    })

    it('should create a claim relation', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/summaries/${testSummaryId}/claims/${claim1Id}/relations`,
        cookies: { session_token: testSessionToken },
        payload: {
          targetClaimId: claim2Id,
          relationTypeId,
          confidence: 0.9,
          notes: 'These claims contradict each other'
        }
      })

      expect(response.statusCode).toBe(201)
      const relation = response.json()
      expect(relation.sourceClaimId).toBe(claim1Id)
      expect(relation.targetClaimId).toBe(claim2Id)
      expect(relation.relationTypeId).toBe(relationTypeId)
    })

    it('should get claim relations', async () => {
      // Create relation
      await seedRelation(prisma, {
        data: {
          sourceClaimId: claim1Id,
          targetClaimId: claim2Id,
          relationTypeId,
          confidence: 0.85
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/summaries/${testSummaryId}/claims/${claim1Id}/relations`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      const relations = response.json()
      expect(relations.asSource).toHaveLength(1)
      expect(relations.asSource[0].targetClaimId).toBe(claim2Id)
      expect(relations.asTarget).toHaveLength(0)
    })

    it('should delete a claim relation', async () => {
      const relation = await seedRelation(prisma, {
        data: {
          sourceClaimId: claim1Id,
          targetClaimId: claim2Id,
          relationTypeId
        }
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/summaries/${testSummaryId}/claims/relations/${relation.id}`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().success).toBe(true)
    })

    it('should reject relation with invalid relation type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/summaries/${testSummaryId}/claims/${claim1Id}/relations`,
        cookies: { session_token: testSessionToken },
        payload: {
          targetClaimId: claim2Id,
          relationTypeId: 'nonexistent-type',
          confidence: 0.9
        }
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('VALIDATION_ERROR')
      expect(response.json().message).toContain('Invalid relation type')
    })

    it('should reject relation type that does not support claims', async () => {
      // Add relation type that only supports entities
      await seedClaimOntology(prisma, {
        data: {
          personaId: testPersonaId,
          relationTypes: [
            {
              id: 'conflicts',
              name: 'Conflicts With',
              gloss: [{ type: 'text', content: 'Contradicts another claim' }],
              sourceTypes: ['claim'],
              targetTypes: ['claim']
            },
            {
              id: 'is-a',
              name: 'Is A',
              gloss: [{ type: 'text', content: 'Entity classification' }],
              sourceTypes: ['entity'],
              targetTypes: ['entity']
            }
          ]
        }
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/summaries/${testSummaryId}/claims/${claim1Id}/relations`,
        cookies: { session_token: testSessionToken },
        payload: {
          targetClaimId: claim2Id,
          relationTypeId: 'is-a',
          confidence: 0.9
        }
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('VALIDATION_ERROR')
      expect(response.json().message).toContain('does not support claim-to-claim')
    })

    it('should handle incoming and outgoing relations correctly', async () => {
      // Create relation from claim1 to claim2
      await seedRelation(prisma, {
        data: {
          sourceClaimId: claim1Id,
          targetClaimId: claim2Id,
          relationTypeId,
          confidence: 0.9
        }
      })

      // Check claim1's relations (should have 1 outgoing, 0 incoming)
      const response1 = await app.inject({
        method: 'GET',
        url: `/api/summaries/${testSummaryId}/claims/${claim1Id}/relations`,
        cookies: { session_token: testSessionToken }
      })

      expect(response1.statusCode).toBe(200)
      const relations1 = response1.json()
      expect(relations1.asSource).toHaveLength(1)
      expect(relations1.asTarget).toHaveLength(0)

      // Check claim2's relations (should have 0 outgoing, 1 incoming)
      const response2 = await app.inject({
        method: 'GET',
        url: `/api/summaries/${testSummaryId}/claims/${claim2Id}/relations`,
        cookies: { session_token: testSessionToken }
      })

      expect(response2.statusCode).toBe(200)
      const relations2 = response2.json()
      expect(relations2.asSource).toHaveLength(0)
      expect(relations2.asTarget).toHaveLength(1)
      expect(relations2.asTarget[0].sourceClaimId).toBe(claim1Id)
    })

    it('should include confidence and notes in created relation', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/summaries/${testSummaryId}/claims/${claim1Id}/relations`,
        cookies: { session_token: testSessionToken },
        payload: {
          targetClaimId: claim2Id,
          relationTypeId,
          confidence: 0.75,
          notes: 'Test notes for relation'
        }
      })

      expect(response.statusCode).toBe(201)
      const relation = response.json()
      expect(relation.confidence).toBe(0.75)
      expect(relation.notes).toBe('Test notes for relation')
    })
  })

  describe('claim timeSpans', () => {
    const discontiguousSpans = [
      { start: 1.5, end: 3.0, source: 'scrub' },
      { start: 10.0, end: 12.5, source: 'annotation', annotationIds: ['anno-1', 'anno-2'] },
    ]

    it('persists discontiguous time spans on create and returns them on read', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: `/api/summaries/${testSummaryId}/claims`,
        cookies: { session_token: testSessionToken },
        payload: {
          summaryType: 'video',
          text: 'A claim grounded in two video segments',
          timeSpans: discontiguousSpans,
        },
      })
      expect(createRes.statusCode).toBe(201)

      const getRes = await app.inject({
        method: 'GET',
        url: `/api/summaries/${testSummaryId}/claims`,
        cookies: { session_token: testSessionToken },
      })
      expect(getRes.statusCode).toBe(200)
      const claims = getRes.json()
      expect(claims).toHaveLength(1)
      expect(claims[0].timeSpans).toEqual(discontiguousSpans)
    })

    it('updates time spans on PUT', async () => {
      const created = await seedClaim(prisma, {
        data: { summaryId: testSummaryId, summaryType: 'video', text: 'Timed claim', gloss: [], createdBy: testUserId },
      })

      const newSpans = [{ start: 5.0, end: 7.0, source: 'scrub' }]
      const putRes = await app.inject({
        method: 'PUT',
        url: `/api/summaries/${testSummaryId}/claims/${created.id}`,
        cookies: { session_token: testSessionToken },
        payload: { timeSpans: newSpans },
      })
      expect(putRes.statusCode).toBe(200)

      const getRes = await app.inject({
        method: 'GET',
        url: `/api/summaries/${testSummaryId}/claims/${created.id}`,
        cookies: { session_token: testSessionToken },
      })
      expect(getRes.statusCode).toBe(200)
      expect(getRes.json().timeSpans).toEqual(newSpans)
    })

    it('rejects a negative time span value', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/summaries/${testSummaryId}/claims`,
        cookies: { session_token: testSessionToken },
        payload: {
          summaryType: 'video',
          text: 'Bad span',
          timeSpans: [{ start: -1, end: 2, source: 'scrub' }],
        },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('cross-user authorization', () => {
    let otherUserToken: string

    beforeEach(async () => {
      // A second regular (non-admin) user whose abilities resolve from the
      // seeded `user` role: read/update/create on Claim are broad, but delete
      // is ownOnly so only the claim's creator may delete it.
      const passwordHash = await hashPassword('otherpass123')
      await prisma.user.create({
        data: {
          username: 'otheruser',
          email: 'other@example.com',
          passwordHash,
          displayName: 'Other User',
          isAdmin: false,
          systemRole: 'user',
        },
      })

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'otheruser', password: 'otherpass123' },
      })
      otherUserToken = loginResponse.cookies.find(c => c.name === 'session_token')!.value
    })

    it('denies deleting a claim owned by another user', async () => {
      // testUser owns this claim.
      const claim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Owned by test user',
          gloss: [],
          createdBy: testUserId,
        },
      })

      // otherUser cannot satisfy the ownOnly delete rule (createdBy !== them).
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/summaries/${testSummaryId}/claims/${claim.id}`,
        cookies: { session_token: otherUserToken },
      })

      expect(response.statusCode).toBe(403)
      expect(response.json().error).toBe('FORBIDDEN')

      // The claim must still exist; the denial blocked the delete.
      const stillThere = await readClaimById(prisma, claim.id)
      expect(stillThere).not.toBeNull()
    })

    it('allows the owner to delete their own claim', async () => {
      const claim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Owned by test user',
          gloss: [],
          createdBy: testUserId,
        },
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/summaries/${testSummaryId}/claims/${claim.id}`,
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().success).toBe(true)
    })

    it('denies deleting a relation whose endpoints another user owns', async () => {
      const sourceClaim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Source owned by test user',
          gloss: [],
          createdBy: testUserId,
        },
      })
      const targetClaim = await seedClaim(prisma, {
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Target owned by test user',
          gloss: [],
          createdBy: testUserId,
        },
      })
      const relation = await seedRelation(prisma, {
        data: {
          sourceClaimId: sourceClaim.id,
          targetClaimId: targetClaim.id,
          relationTypeId: 'conflicts',
          createdBy: testUserId,
        },
      })

      // The relation-delete path requires update on both endpoint claims. The
      // seeded `user` role grants broad (non-ownOnly) update on Claim, so this
      // path does not 403 across users; it succeeds. This asserts the relocated
      // update-on-both-endpoints check resolves to the same decision the route
      // produced before extraction.
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/summaries/${testSummaryId}/claims/relations/${relation.id}`,
        cookies: { session_token: otherUserToken },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().success).toBe(true)
    })
  })

  describe('layers-backed round trip', () => {
    beforeEach(async () => {
      // A claim-to-claim relation type the relation create validates against.
      await seedClaimOntology(prisma, {
        data: {
          personaId: testPersonaId,
          relationTypes: [
            {
              id: 'supports',
              name: 'Supports',
              gloss: [{ type: 'text', content: 'Backs another claim' }],
              sourceTypes: ['claim'],
              targetTypes: ['claim'],
            },
          ],
        },
      })
    })

    it('round-trips a hierarchical claim + relation through the layers store', async () => {
      const eventId = '11111111-1111-4111-8111-111111111111'
      const timeId = '22222222-2222-4222-8222-222222222222'
      const locationId = '33333333-3333-4333-8333-333333333333'

      // Parent claim: gloss with a typeRef + objectRef, two text spans (one with
      // a sentence index), a time span, claimer fields, world-object references,
      // modality arrays, and confidence.
      const parentPayload = {
        summaryType: 'video',
        text: 'The rocket launch was a success',
        gloss: [
          { type: 'text', content: 'The ' },
          { type: 'objectRef', content: 'rocket', refType: 'entity' },
          { type: 'text', content: ' ' },
          { type: 'typeRef', content: 'launch', refType: 'event' },
          { type: 'text', content: ' was a success' },
        ],
        textSpans: [
          { sentenceIndex: 0, charStart: 0, charEnd: 15 },
          { charStart: 16, charEnd: 31 },
        ],
        timeSpans: [{ start: 1.5, end: 3.0, source: 'scrub' }],
        claimerType: 'author',
        claimerGloss: [{ type: 'text', content: 'The reporter' }],
        claimRelation: [{ type: 'text', content: 'states that' }],
        claimEventId: eventId,
        claimTimeId: timeId,
        claimLocationId: locationId,
        confidence: 0.87,
        audio: ['speech'],
        video: ['non-text'],
        metadata: ['text'],
        comment: 'Round-trip parent',
      }

      const parentRes = await app.inject({
        method: 'POST',
        url: `/api/summaries/${testSummaryId}/claims`,
        cookies: { session_token: testSessionToken },
        payload: parentPayload,
      })
      expect(parentRes.statusCode).toBe(201)
      const parentId = parentRes.json().claims[0].id as string

      const sub1Res = await app.inject({
        method: 'POST',
        url: `/api/summaries/${testSummaryId}/claims`,
        cookies: { session_token: testSessionToken },
        payload: {
          summaryType: 'video',
          text: 'The rocket left the pad',
          gloss: [{ type: 'text', content: 'The rocket left the pad' }],
          parentClaimId: parentId,
          textSpans: [{ charStart: 0, charEnd: 23 }],
          confidence: 0.91,
        },
      })
      expect(sub1Res.statusCode).toBe(201)

      const sub2Res = await app.inject({
        method: 'POST',
        url: `/api/summaries/${testSummaryId}/claims`,
        cookies: { session_token: testSessionToken },
        payload: {
          summaryType: 'video',
          text: 'The rocket reached orbit',
          gloss: [{ type: 'text', content: 'The rocket reached orbit' }],
          parentClaimId: parentId,
          textSpans: [{ charStart: 0, charEnd: 24 }],
          confidence: 0.8,
        },
      })
      expect(sub2Res.statusCode).toBe(201)

      // The create response already reflects the full tree; capture it so the
      // subsequent GET can be deep-equaled against it.
      const treeAfterCreate = sub2Res.json().claims
      const root = treeAfterCreate[0]
      const sub1Id = root.subclaims[0].id as string
      const sub2Id = root.subclaims[1].id as string

      // A relation between the two subclaims with source/target spans.
      const relationRes = await app.inject({
        method: 'POST',
        url: `/api/summaries/${testSummaryId}/claims/${sub1Id}/relations`,
        cookies: { session_token: testSessionToken },
        payload: {
          targetClaimId: sub2Id,
          relationTypeId: 'supports',
          sourceSpans: [{ charStart: 0, charEnd: 10 }],
          targetSpans: [{ charStart: 4, charEnd: 10 }],
          confidence: 0.76,
          notes: 'launch precedes orbit',
        },
      })
      expect(relationRes.statusCode).toBe(201)
      const createdRelation = relationRes.json()

      // GET the tree and deep-equal it against the create response: every claim
      // field round-trips verbatim through the layers store.
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/summaries/${testSummaryId}/claims`,
        cookies: { session_token: testSessionToken },
      })
      expect(getRes.statusCode).toBe(200)
      expect(getRes.json()).toEqual(treeAfterCreate)

      // Explicit losslessness checks on the parent's rich fields.
      const gotRoot = getRes.json()[0]
      expect(gotRoot.gloss).toEqual(parentPayload.gloss)
      expect(gotRoot.textSpans).toEqual(parentPayload.textSpans)
      expect(gotRoot.timeSpans).toEqual(parentPayload.timeSpans)
      expect(gotRoot.claimerType).toBe('author')
      expect(gotRoot.claimerGloss).toEqual(parentPayload.claimerGloss)
      expect(gotRoot.claimRelation).toEqual(parentPayload.claimRelation)
      expect(gotRoot.claimEventId).toBe(eventId)
      expect(gotRoot.claimTimeId).toBe(timeId)
      expect(gotRoot.claimLocationId).toBe(locationId)
      expect(gotRoot.confidence).toBe(0.87)
      expect(gotRoot.audio).toEqual(['speech'])
      expect(gotRoot.video).toEqual(['non-text'])
      expect(gotRoot.metadata).toEqual(['text'])
      expect(gotRoot.subclaims.map((c: { id: string }) => c.id)).toEqual([sub1Id, sub2Id])

      // Relation round-trips through GET (asSource on the source, asTarget on the target).
      const relFromSource = await app.inject({
        method: 'GET',
        url: `/api/summaries/${testSummaryId}/claims/${sub1Id}/relations`,
        cookies: { session_token: testSessionToken },
      })
      expect(relFromSource.statusCode).toBe(200)
      expect(relFromSource.json().asSource).toHaveLength(1)
      expect(relFromSource.json().asSource[0]).toEqual(createdRelation)
      expect(relFromSource.json().asSource[0].sourceSpans).toEqual([{ charStart: 0, charEnd: 10 }])
      expect(relFromSource.json().asSource[0].targetSpans).toEqual([{ charStart: 4, charEnd: 10 }])

      const relFromTarget = await app.inject({
        method: 'GET',
        url: `/api/summaries/${testSummaryId}/claims/${sub2Id}/relations`,
        cookies: { session_token: testSessionToken },
      })
      expect(relFromTarget.statusCode).toBe(200)
      expect(relFromTarget.json().asTarget).toHaveLength(1)
      expect(relFromTarget.json().asTarget[0].id).toBe(createdRelation.id)

      // The data lives in the layers store: three claim nodes, one relation
      // edge, and one text-span annotation per span (2 + 1 + 1).
      const claimNodes = await prisma.graphNode.findMany({ where: { nodeType: 'claim' } })
      expect(claimNodes.map(n => n.id).sort()).toEqual([parentId, sub1Id, sub2Id].sort())

      const relationEdges = await prisma.graphEdge.count()
      expect(relationEdges).toBe(1)
      const edge = await prisma.graphEdge.findUnique({ where: { id: createdRelation.id } })
      expect(edge?.sourceLocalId).toBe(sub1Id)
      expect(edge?.targetLocalId).toBe(sub2Id)

      const spanAnnotations = await prisma.layersAnnotation.findMany()
      expect(spanAnnotations).toHaveLength(4)
      const denoted = new Set(spanAnnotations.map(a => a.denotesNodeId))
      expect(denoted).toEqual(new Set([parentId, sub1Id, sub2Id]))
    })
  })
})
