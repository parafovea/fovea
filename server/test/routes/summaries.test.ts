import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

/**
 * Integration tests for the Video Summaries API.
 * Tests CRUD operations and audio metadata handling for video summaries.
 */
describe('Video Summaries API', () => {
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
        id: 'test-video',
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
  })

  describe('POST /api/summaries', () => {
    it('saves a summary with audio metadata fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/summaries',
        cookies: { session_token: testSessionToken },
        payload: {
          videoId: testVideoId,
          personaId: testPersonaId,
          summary: 'Test summary with audio',
          visualAnalysis: 'Visual analysis text',
          audioTranscript: 'This is the audio transcript',
          keyFrames: [1, 2, 3],
          confidence: 0.95,
          transcriptJson: {
            segments: [
              { start: 0, end: 5, text: 'Test segment', speaker: 'Speaker 1', confidence: 0.9 }
            ],
            language: 'en'
          },
          audioLanguage: 'en',
          speakerCount: 2,
          audioModelUsed: 'whisper-v3-turbo',
          visualModelUsed: 'gemini-2-5-flash',
          fusionStrategy: 'timestamp_aligned',
          processingTimeAudio: 3.5,
          processingTimeVisual: 12.3,
          processingTimeFusion: 0.8,
        }
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.audioLanguage).toBe('en')
      expect(body.speakerCount).toBe(2)
      expect(body.audioModelUsed).toBe('whisper-v3-turbo')
      expect(body.visualModelUsed).toBe('gemini-2-5-flash')
      expect(body.fusionStrategy).toBe('timestamp_aligned')
      expect(body.processingTimeAudio).toBe(3.5)
      expect(body.processingTimeVisual).toBe(12.3)
      expect(body.processingTimeFusion).toBe(0.8)
      expect(body.transcriptJson).toEqual({
        segments: [
          { start: 0, end: 5, text: 'Test segment', speaker: 'Speaker 1', confidence: 0.9 }
        ],
        language: 'en'
      })
    })

    it('saves a summary without audio metadata for backward compatibility', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/summaries',
        cookies: { session_token: testSessionToken },
        payload: {
          videoId: testVideoId,
          personaId: testPersonaId,
          summary: 'Test summary without audio',
          visualAnalysis: 'Visual analysis only',
          audioTranscript: null,
          keyFrames: [1, 2, 3],
          confidence: 0.85,
        }
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.summary).toBe('Test summary without audio')
      expect(body.audioLanguage).toBeNull()
      expect(body.speakerCount).toBeNull()
      expect(body.transcriptJson).toBeNull()
    })

    it('updates existing summary with audio metadata', async () => {
      // Create initial summary
      await app.inject({
        method: 'POST',
        url: '/api/summaries',
        cookies: { session_token: testSessionToken },
        payload: {
          videoId: testVideoId,
          personaId: testPersonaId,
          summary: 'Initial summary',
          visualAnalysis: 'Initial visual analysis',
          audioTranscript: null,
          keyFrames: [1],
          confidence: 0.8,
        }
      })

      // Update with audio metadata
      const response = await app.inject({
        method: 'POST',
        url: '/api/summaries',
        cookies: { session_token: testSessionToken },
        payload: {
          videoId: testVideoId,
          personaId: testPersonaId,
          summary: 'Updated summary with audio',
          visualAnalysis: 'Updated visual analysis',
          audioTranscript: 'Updated audio transcript',
          keyFrames: [1, 2],
          confidence: 0.9,
          audioLanguage: 'es',
          speakerCount: 1,
          audioModelUsed: 'faster-whisper-large-v3',
        }
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.summary).toBe('Updated summary with audio')
      expect(body.audioLanguage).toBe('es')
      expect(body.speakerCount).toBe(1)
      expect(body.audioModelUsed).toBe('faster-whisper-large-v3')
    })
  })

  describe('GET /api/videos/:videoId/summaries/:personaId', () => {
    it('returns summary with audio metadata fields', async () => {
      // Create summary with audio metadata
      await prisma.videoSummary.create({
        data: {
          videoId: testVideoId,
          personaId: testPersonaId,
          summary: 'Test summary',
          visualAnalysis: 'Visual analysis',
          audioTranscript: 'Audio transcript',
          transcriptJson: {
            segments: [{ start: 0, end: 5, text: 'Test', confidence: 0.9 }]
          },
          audioLanguage: 'en',
          speakerCount: 2,
          audioModelUsed: 'whisper-v3-turbo',
          visualModelUsed: 'gemini-2-5-flash',
          fusionStrategy: 'native_multimodal',
          processingTimeAudio: 2.5,
          processingTimeVisual: 10.0,
          processingTimeFusion: 0.5,
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/videos/${testVideoId}/summaries/${testPersonaId}`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.audioLanguage).toBe('en')
      expect(body.speakerCount).toBe(2)
      expect(body.audioModelUsed).toBe('whisper-v3-turbo')
      expect(body.visualModelUsed).toBe('gemini-2-5-flash')
      expect(body.fusionStrategy).toBe('native_multimodal')
      expect(body.processingTimeAudio).toBe(2.5)
      expect(body.processingTimeVisual).toBe(10.0)
      expect(body.processingTimeFusion).toBe(0.5)
      expect(body.transcriptJson).toEqual({
        segments: [{ start: 0, end: 5, text: 'Test', confidence: 0.9 }]
      })
    })

    it('returns 404 when summary does not exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/videos/${testVideoId}/summaries/${testPersonaId}`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ error: 'Summary not found' })
    })
  })

  describe('GET /api/videos/:videoId/summaries', () => {
    it('returns all summaries for a video including audio metadata', async () => {
      // Create second persona
      const persona2 = await prisma.persona.create({
        data: {
          name: 'Second Analyst',
          role: 'Audio Specialist',
          informationNeed: 'Audio analysis',
          userId: testUserId
        }
      })

      // Create two summaries
      await prisma.videoSummary.create({
        data: {
          videoId: testVideoId,
          personaId: testPersonaId,
          summary: 'First summary',
          visualAnalysis: 'Visual analysis 1',
          audioTranscript: 'Transcript 1',
          audioLanguage: 'en',
          speakerCount: 1,
        }
      })

      await prisma.videoSummary.create({
        data: {
          videoId: testVideoId,
          personaId: persona2.id,
          summary: 'Second summary',
          visualAnalysis: 'Visual analysis 2',
          audioTranscript: 'Transcript 2',
          audioLanguage: 'es',
          speakerCount: 3,
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/videos/${testVideoId}/summaries`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveLength(2)

      // Find summaries by audioLanguage (order not guaranteed)
      const enSummary = body.find((s: any) => s.audioLanguage === 'en')
      const esSummary = body.find((s: any) => s.audioLanguage === 'es')

      expect(enSummary).toBeDefined()
      expect(enSummary.speakerCount).toBe(1)
      expect(esSummary).toBeDefined()
      expect(esSummary.speakerCount).toBe(3)
    })
  })

  describe('POST /api/videos/summaries/generate', () => {
    it('accepts audio configuration parameters when queuing job', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/videos/summaries/generate',
        cookies: { session_token: testSessionToken },
        payload: {
          videoId: testVideoId,
          personaId: testPersonaId,
          maxFrames: 20,
          enableAudio: true,
          enableSpeakerDiarization: true,
          fusionStrategy: 'timestamp_aligned',
          audioLanguage: 'en',
        }
      })

      expect(response.statusCode).toBe(202)
      const body = response.json()
      expect(body.jobId).toBeDefined()
      expect(body.status).toBe('queued')
      expect(body.videoId).toBe(testVideoId)
      expect(body.personaId).toBe(testPersonaId)
    })

    it('works without audio configuration for backward compatibility', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/videos/summaries/generate',
        cookies: { session_token: testSessionToken },
        payload: {
          videoId: testVideoId,
          personaId: testPersonaId,
          maxFrames: 30,
        }
      })

      expect(response.statusCode).toBe(202)
      const body = response.json()
      expect(body.jobId).toBeDefined()
    })
  })

  describe('DELETE /api/videos/:videoId/summaries/:personaId', () => {
    it('deletes a summary with audio metadata', async () => {
      await prisma.videoSummary.create({
        data: {
          videoId: testVideoId,
          personaId: testPersonaId,
          summary: 'Summary to delete',
          visualAnalysis: 'Visual',
          audioTranscript: 'Audio',
          audioLanguage: 'en',
          speakerCount: 2,
        }
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/videos/${testVideoId}/summaries/${testPersonaId}`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ success: true })

      // Verify deletion
      const summary = await prisma.videoSummary.findUnique({
        where: {
          videoId_personaId: {
            videoId: testVideoId,
            personaId: testPersonaId,
          }
        }
      })
      expect(summary).toBeNull()
    })
  })
})
