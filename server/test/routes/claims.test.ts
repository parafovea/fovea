import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { claimExtractionQueue, claimSynthesisQueue } from '../../src/queues/setup.js'

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
  })

  beforeEach(async () => {
    // Clean database in dependency order
    await prisma.claimRelation.deleteMany()
    await prisma.claim.deleteMany()
    await prisma.apiKey.deleteMany()
    await prisma.session.deleteMany()
    await prisma.annotation.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.video.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.persona.deleteMany()
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
      const parentClaim = await prisma.claim.create({
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
      await prisma.claim.createMany({
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
      await prisma.claim.createMany({
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
      const parentClaim = await prisma.claim.create({
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
  })

  describe('PUT /api/summaries/:summaryId/claims/:claimId', () => {
    it('should update a claim', async () => {
      const claim = await prisma.claim.create({
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
  })

  describe('DELETE /api/summaries/:summaryId/claims/:claimId', () => {
    it('should delete a claim', async () => {
      const claim = await prisma.claim.create({
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Claim to delete',
          gloss: []
        }
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/summaries/${testSummaryId}/claims/${claim.id}`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().success).toBe(true)

      // Verify claim was deleted
      const deletedClaim = await prisma.claim.findUnique({ where: { id: claim.id } })
      expect(deletedClaim).toBeNull()
    })

    it('should cascade delete subclaims', async () => {
      // Create parent with subclaim
      const parentClaim = await prisma.claim.create({
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Parent claim',
          gloss: []
        }
      })

      const subClaim = await prisma.claim.create({
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Subclaim',
          gloss: [],
          parentClaimId: parentClaim.id
        }
      })

      // Delete parent
      await app.inject({
        method: 'DELETE',
        url: `/api/summaries/${testSummaryId}/claims/${parentClaim.id}`,
        cookies: { session_token: testSessionToken }
      })

      // Verify both are deleted
      const deletedParent = await prisma.claim.findUnique({ where: { id: parentClaim.id } })
      const deletedSub = await prisma.claim.findUnique({ where: { id: subClaim.id } })
      expect(deletedParent).toBeNull()
      expect(deletedSub).toBeNull()
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
      await prisma.claim.create({
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
      await prisma.ontology.create({
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
      const c1 = await prisma.claim.create({
        data: {
          summaryId: testSummaryId,
          summaryType: 'video',
          text: 'Claim 1',
          gloss: []
        }
      })
      claim1Id = c1.id

      const c2 = await prisma.claim.create({
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
      await prisma.claimRelation.create({
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
      const relation = await prisma.claimRelation.create({
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
      await prisma.ontology.update({
        where: { personaId: testPersonaId },
        data: {
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
      await prisma.claimRelation.create({
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
})
