import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../../src/lib/password.js'

/**
 * Integration tests for Authentication API.
 * Tests login, logout, registration, and session management.
 */
describe('Authentication Routes', () => {
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
    // Clean up database before each test
    await prisma.session.deleteMany()
    await prisma.apiKey.deleteMany()
    await prisma.annotation.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.user.deleteMany()
  })

  describe('POST /api/auth/login', () => {
    it('successfully authenticates user with valid credentials', async () => {
      // Create test user
      const passwordHash = await hashPassword('testpass123')
      await prisma.user.create({
        data: {
          username: 'testuser',
          email: 'test@example.com',
          passwordHash,
          displayName: 'Test User',
          isAdmin: false,
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'testuser',
          password: 'testpass123',
        },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.user).toBeDefined()
      expect(body.user.username).toBe('testuser')
      expect(body.user.email).toBe('test@example.com')
      expect(body.user.displayName).toBe('Test User')
      expect(body.user.isAdmin).toBe(false)
      expect(body.user).toHaveProperty('id')
      expect(body.user.passwordHash).toBeUndefined()
    })

    it('sets httpOnly session cookie on successful login', async () => {
      const passwordHash = await hashPassword('testpass123')
      await prisma.user.create({
        data: {
          username: 'testuser',
          email: 'test@example.com',
          passwordHash,
          displayName: 'Test User',
          isAdmin: false,
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'testuser',
          password: 'testpass123',
        },
      })

      expect(response.statusCode).toBe(200)
      const setCookie = response.headers['set-cookie']
      expect(setCookie).toBeDefined()
      expect(setCookie).toContain('session_token')
      expect(setCookie).toContain('HttpOnly')
      expect(setCookie).toContain('Path=/')
    })

    it('creates session in database on successful login', async () => {
      const passwordHash = await hashPassword('testpass123')
      const user = await prisma.user.create({
        data: {
          username: 'testuser',
          email: 'test@example.com',
          passwordHash,
          displayName: 'Test User',
          isAdmin: false,
        },
      })

      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'testuser',
          password: 'testpass123',
        },
      })

      const sessions = await prisma.session.findMany({
        where: { userId: user.id },
      })

      expect(sessions).toHaveLength(1)
      expect(sessions[0].userId).toBe(user.id)
      expect(sessions[0].token).toBeDefined()
      expect(sessions[0].expiresAt).toBeInstanceOf(Date)
      expect(sessions[0].expiresAt.getTime()).toBeGreaterThan(Date.now())
    })

    it('respects rememberMe for session duration', async () => {
      const passwordHash = await hashPassword('testpass123')
      const user = await prisma.user.create({
        data: {
          username: 'testuser',
          email: 'test@example.com',
          passwordHash,
          displayName: 'Test User',
          isAdmin: false,
        },
      })

      // Login without rememberMe (7 day default)
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'testuser',
          password: 'testpass123',
          rememberMe: false,
        },
      })

      const sessionWithoutRemember = await prisma.session.findFirst({
        where: { userId: user.id },
      })
      expect(sessionWithoutRemember).toBeDefined()

      // Calculate expected expiration (7 days)
      const sevenDaysFromNow = new Date()
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
      const expirationDiff = Math.abs(
        sessionWithoutRemember!.expiresAt.getTime() - sevenDaysFromNow.getTime()
      )
      expect(expirationDiff).toBeLessThan(5000) // Within 5 seconds

      // Clean up
      await prisma.session.deleteMany()

      // Login with rememberMe (30 days)
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'testuser',
          password: 'testpass123',
          rememberMe: true,
        },
      })

      const sessionWithRemember = await prisma.session.findFirst({
        where: { userId: user.id },
      })
      expect(sessionWithRemember).toBeDefined()

      // Calculate expected expiration (30 days)
      const thirtyDaysFromNow = new Date()
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
      const rememberExpirationDiff = Math.abs(
        sessionWithRemember!.expiresAt.getTime() - thirtyDaysFromNow.getTime()
      )
      expect(rememberExpirationDiff).toBeLessThan(5000) // Within 5 seconds
    })

    it('returns 401 with invalid username', async () => {
      const passwordHash = await hashPassword('testpass123')
      await prisma.user.create({
        data: {
          username: 'testuser',
          email: 'test@example.com',
          passwordHash,
          displayName: 'Test User',
          isAdmin: false,
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'wronguser',
          password: 'testpass123',
        },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toHaveProperty('error')
    })

    it('returns 401 with invalid password', async () => {
      const passwordHash = await hashPassword('testpass123')
      await prisma.user.create({
        data: {
          username: 'testuser',
          email: 'test@example.com',
          passwordHash,
          displayName: 'Test User',
          isAdmin: false,
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'testuser',
          password: 'wrongpassword',
        },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toHaveProperty('error')
    })

    it('validates required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: '',
          password: 'testpass123',
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('does not create session on failed login', async () => {
      const passwordHash = await hashPassword('testpass123')
      await prisma.user.create({
        data: {
          username: 'testuser',
          email: 'test@example.com',
          passwordHash,
          displayName: 'Test User',
          isAdmin: false,
        },
      })

      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'testuser',
          password: 'wrongpassword',
        },
      })

      const sessions = await prisma.session.findMany()
      expect(sessions).toHaveLength(0)
    })
  })

  describe('POST /api/auth/logout', () => {
    it('successfully destroys session and clears cookie', async () => {
      const passwordHash = await hashPassword('testpass123')
      const user = await prisma.user.create({
        data: {
          username: 'testuser',
          email: 'test@example.com',
          passwordHash,
          displayName: 'Test User',
          isAdmin: false,
        },
      })

      // Login first
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'testuser',
          password: 'testpass123',
        },
      })

      const cookies = loginResponse.cookies
      const sessionCookie = cookies.find((c) => c.name === 'session_token')
      expect(sessionCookie).toBeDefined()

      // Verify session exists
      const sessionsBeforeLogout = await prisma.session.findMany({
        where: { userId: user.id },
      })
      expect(sessionsBeforeLogout).toHaveLength(1)

      // Logout
      const logoutResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        cookies: {
          session_token: sessionCookie!.value,
        },
      })

      expect(logoutResponse.statusCode).toBe(200)
      expect(logoutResponse.json()).toEqual({ success: true })

      // Verify session destroyed
      const sessionsAfterLogout = await prisma.session.findMany({
        where: { userId: user.id },
      })
      expect(sessionsAfterLogout).toHaveLength(0)

      // Verify cookie cleared
      const setCookie = logoutResponse.headers['set-cookie'] as string
      expect(setCookie).toContain('session_token=')
      expect(setCookie).toContain('Expires=') // Cookie should be expired
    })

    it('succeeds even without valid session token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ success: true })
    })

    it('clears cookie even if session does not exist in database', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        cookies: {
          session_token: 'invalid-token-12345',
        },
      })

      expect(response.statusCode).toBe(200)
      const setCookie = response.headers['set-cookie'] as string
      expect(setCookie).toContain('session_token=')
    })
  })

  describe('GET /api/auth/me', () => {
    it('returns authenticated user with valid session', async () => {
      const passwordHash = await hashPassword('testpass123')
      await prisma.user.create({
        data: {
          username: 'testuser',
          email: 'test@example.com',
          passwordHash,
          displayName: 'Test User',
          isAdmin: false,
        },
      })

      // Login first
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'testuser',
          password: 'testpass123',
        },
      })

      const cookies = loginResponse.cookies
      const sessionCookie = cookies.find((c) => c.name === 'session_token')

      // Call /me endpoint
      const meResponse = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: {
          session_token: sessionCookie!.value,
        },
      })

      expect(meResponse.statusCode).toBe(200)
      const body = meResponse.json()
      expect(body.user).toBeDefined()
      expect(body.user.username).toBe('testuser')
      expect(body.user.email).toBe('test@example.com')
      expect(body.user.displayName).toBe('Test User')
      expect(body.user.isAdmin).toBe(false)
      expect(body.user.passwordHash).toBeUndefined()
    })

    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({ error: 'Not authenticated' })
    })

    it('returns 401 with invalid session token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: {
          session_token: 'invalid-token-12345',
        },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({ error: 'Session expired' })
    })

    it('returns 401 and clears cookie with expired session', async () => {
      const passwordHash = await hashPassword('testpass123')
      const user = await prisma.user.create({
        data: {
          username: 'testuser',
          email: 'test@example.com',
          passwordHash,
          displayName: 'Test User',
          isAdmin: false,
        },
      })

      // Create expired session manually
      const expiredDate = new Date()
      expiredDate.setDate(expiredDate.getDate() - 1) // Yesterday

      const session = await prisma.session.create({
        data: {
          userId: user.id,
          token: 'expired-token-12345',
          expiresAt: expiredDate,
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: {
          session_token: session.token,
        },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({ error: 'Session expired' })

      // Verify cookie cleared
      const setCookie = response.headers['set-cookie'] as string
      expect(setCookie).toContain('session_token=')

      // Verify expired session deleted from database
      const sessionInDb = await prisma.session.findUnique({
        where: { id: session.id },
      })
      expect(sessionInDb).toBeNull()
    })
  })

  describe('POST /api/auth/register', () => {
    it('creates new user when registration is enabled', async () => {
      // Set environment variable
      process.env.ALLOW_REGISTRATION = 'true'

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'securepass123',
          displayName: 'New User',
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.user).toBeDefined()
      expect(body.user.username).toBe('newuser')
      expect(body.user.email).toBe('newuser@example.com')
      expect(body.user.displayName).toBe('New User')
      expect(body.user.isAdmin).toBe(false)
      expect(body.user.passwordHash).toBeUndefined()

      // Verify user created in database
      const user = await prisma.user.findUnique({
        where: { username: 'newuser' },
      })
      expect(user).toBeDefined()
      expect(user!.passwordHash).toBeDefined()
      expect(user!.passwordHash).not.toBe('securepass123') // Should be hashed

      // Clean up
      delete process.env.ALLOW_REGISTRATION
    })

    it('creates user without email when not provided', async () => {
      process.env.ALLOW_REGISTRATION = 'true'

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'newuser',
          password: 'securepass123',
          displayName: 'New User',
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.user.email).toBeNull()

      delete process.env.ALLOW_REGISTRATION
    })

    it('returns 403 when registration is disabled', async () => {
      process.env.ALLOW_REGISTRATION = 'false'

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'securepass123',
          displayName: 'New User',
        },
      })

      expect(response.statusCode).toBe(403)
      expect(response.json()).toEqual({ error: 'Registration is disabled' })

      delete process.env.ALLOW_REGISTRATION
    })

    it('returns 400 for duplicate username', async () => {
      process.env.ALLOW_REGISTRATION = 'true'

      // Create existing user
      const passwordHash = await hashPassword('testpass123')
      await prisma.user.create({
        data: {
          username: 'existinguser',
          email: 'existing@example.com',
          passwordHash,
          displayName: 'Existing User',
          isAdmin: false,
        },
      })

      // Try to register with same username
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'existinguser',
          email: 'different@example.com',
          password: 'securepass123',
          displayName: 'Different User',
        },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ error: 'Username already exists' })

      delete process.env.ALLOW_REGISTRATION
    })

    it('validates username minimum length', async () => {
      process.env.ALLOW_REGISTRATION = 'true'

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'ab', // Too short
          email: 'test@example.com',
          password: 'securepass123',
          displayName: 'Test User',
        },
      })

      expect(response.statusCode).toBe(400)

      delete process.env.ALLOW_REGISTRATION
    })

    it('validates password minimum length', async () => {
      process.env.ALLOW_REGISTRATION = 'true'

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'testuser',
          email: 'test@example.com',
          password: 'short', // Too short
          displayName: 'Test User',
        },
      })

      expect(response.statusCode).toBe(400)

      delete process.env.ALLOW_REGISTRATION
    })

    it('validates email format', async () => {
      process.env.ALLOW_REGISTRATION = 'true'

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'testuser',
          email: 'not-an-email',
          password: 'securepass123',
          displayName: 'Test User',
        },
      })

      expect(response.statusCode).toBe(400)

      delete process.env.ALLOW_REGISTRATION
    })

    it('hashes password securely', async () => {
      process.env.ALLOW_REGISTRATION = 'true'

      const plainPassword = 'securepass123'

      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'testuser',
          email: 'test@example.com',
          password: plainPassword,
          displayName: 'Test User',
        },
      })

      const user = await prisma.user.findUnique({
        where: { username: 'testuser' },
      })

      expect(user).toBeDefined()
      expect(user!.passwordHash).not.toBe(plainPassword)
      expect(user!.passwordHash).toMatch(/^\$2[aby]\$\d+\$/) // bcrypt format

      delete process.env.ALLOW_REGISTRATION
    })
  })
})
