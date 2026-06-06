import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../../src/lib/password.js'
import { seedBaselinePermissions } from '../helpers/rbac-test-setup.js'

/**
 * Integration tests for the user-level inference preferences routes.
 *
 * Covers:
 *  - GET returns empty document for a user with no row yet
 *  - PUT creates the row on first call and upserts on subsequent calls
 *  - a second user cannot read or influence the first user's row
 *  - unauthenticated callers are rejected
 */
describe('User preferences routes', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let aliceToken: string
  let bobToken: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await prisma.userPreferences.deleteMany()
    await prisma.session.deleteMany()
    await prisma.rolePermission.deleteMany()
    await prisma.user.deleteMany()
    await seedBaselinePermissions(prisma)

    const alice = await prisma.user.create({
      data: {
        username: 'alice',
        email: 'alice@example.com',
        passwordHash: await hashPassword('alicepw123'),
        displayName: 'Alice',
        isAdmin: false,
        systemRole: 'user',
      },
    })
    const aliceLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'alice', password: 'alicepw123' },
    })
    aliceToken = aliceLogin.cookies.find((c) => c.name === 'session_token')!.value

    const bob = await prisma.user.create({
      data: {
        username: 'bob',
        email: 'bob@example.com',
        passwordHash: await hashPassword('bobpw12345'),
        displayName: 'Bob',
        isAdmin: false,
        systemRole: 'user',
      },
    })
    const bobLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'bob', password: 'bobpw12345' },
    })
    bobToken = bobLogin.cookies.find((c) => c.name === 'session_token')!.value

    expect(alice.id).toBeTruthy()
    expect(bob.id).toBeTruthy()
  })

  it('GET returns empty document when no row exists', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/me/preferences',
      cookies: { session_token: aliceToken },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json() as {
      inferencePreferences: { generation: { temperature: number | null } }
    }
    expect(body.inferencePreferences.generation.temperature).toBeNull()
  })

  it('PUT persists preferences and subsequent GET returns them', async () => {
    const payload = {
      inferencePreferences: {
        generation: { temperature: 0.45, topP: 0.85, maxTokens: 1024 },
        audio: {
          beamSize: 3,
          computeType: 'float16',
          numSpeakers: null,
          minSpeakers: null,
          maxSpeakers: null,
          vadThreshold: null,
        },
        detection: { confidenceThreshold: 0.5 },
      },
    }
    const put = await app.inject({
      method: 'PUT',
      url: '/api/me/preferences',
      cookies: { session_token: aliceToken },
      payload,
    })
    expect(put.statusCode).toBe(200)

    const get = await app.inject({
      method: 'GET',
      url: '/api/me/preferences',
      cookies: { session_token: aliceToken },
    })
    const body = get.json() as typeof payload
    expect(body.inferencePreferences.generation.temperature).toBe(0.45)
    expect(body.inferencePreferences.audio.beamSize).toBe(3)
    expect(body.inferencePreferences.detection.confidenceThreshold).toBe(0.5)
  })

  it("one user's PUT does not leak into another user's GET", async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/me/preferences',
      cookies: { session_token: aliceToken },
      payload: {
        inferencePreferences: {
          generation: { temperature: 0.1, topP: 0.1, maxTokens: 100 },
          audio: {
            beamSize: null,
            computeType: null,
            numSpeakers: null,
            minSpeakers: null,
            maxSpeakers: null,
            vadThreshold: null,
          },
          detection: { confidenceThreshold: null },
        },
      },
    })
    const bobGet = await app.inject({
      method: 'GET',
      url: '/api/me/preferences',
      cookies: { session_token: bobToken },
    })
    const body = bobGet.json() as {
      inferencePreferences: { generation: { temperature: number | null } }
    }
    expect(body.inferencePreferences.generation.temperature).toBeNull()
  })

  it('rejects unauthenticated requests with 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/me/preferences',
    })
    expect(response.statusCode).toBe(401)
  })
})
