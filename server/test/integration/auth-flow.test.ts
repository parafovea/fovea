import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../../src/lib/password.js'

/**
 * Integration tests for complete authentication flows.
 * Tests workflows across multiple endpoints to verify proper integration.
 */
describe('Authentication Flow Integration', () => {
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
    // Clean database
    await prisma.apiKey.deleteMany()
    await prisma.session.deleteMany()
    await prisma.annotation.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.user.deleteMany()
  })

  describe('Complete registration to logout flow', () => {
    it('registers → logs in → accesses protected resource → logs out', async () => {
      // Enable registration and force multi-user mode
      const originalRegistration = process.env.ALLOW_REGISTRATION
      const originalMode = process.env.FOVEA_MODE
      process.env.ALLOW_REGISTRATION = 'true'
      process.env.FOVEA_MODE = 'multi-user'

      // Need to create new app instance for mode change to take effect
      const testApp = await buildApp()

      try {
        // 1. Register new user
        const registerResponse = await testApp.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'securepass123',
          displayName: 'New User'
        }
      })

      expect(registerResponse.statusCode).toBe(201)
      const { user: registeredUser } = registerResponse.json()
      expect(registeredUser.username).toBe('newuser')

        // 2. Login with credentials
        const loginResponse = await testApp.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'newuser',
          password: 'securepass123'
        }
      })

      expect(loginResponse.statusCode).toBe(200)
      const sessionCookie = loginResponse.cookies.find(c => c.name === 'session_token')
      expect(sessionCookie).toBeDefined()

        // 3. Access protected resource (persona creation)
        const createPersonaResponse = await testApp.inject({
        method: 'POST',
        url: '/api/personas',
        cookies: { session_token: sessionCookie!.value },
        payload: {
          name: 'Analyst',
          role: 'Security Analyst',
          informationNeed: 'Threat detection'
        }
      })

      expect(createPersonaResponse.statusCode).toBe(201)
      const persona = createPersonaResponse.json()
      expect(persona.name).toBe('Analyst')
      // Note: Persona API doesn't return userId in response for security
      // Verify ownership by querying database
      const personaInDb = await prisma.persona.findUnique({
        where: { id: persona.id }
      })
      expect(personaInDb!.userId).toBe(registeredUser.id)

        // 4. Verify session is valid
        const meResponse = await testApp.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { session_token: sessionCookie!.value }
      })

      expect(meResponse.statusCode).toBe(200)
      expect(meResponse.json().user.username).toBe('newuser')

        // 5. Logout
        const logoutResponse = await testApp.inject({
        method: 'POST',
        url: '/api/auth/logout',
        cookies: { session_token: sessionCookie!.value }
      })

        expect(logoutResponse.statusCode).toBe(200)

        // 6. Verify cannot access protected resource after logout
        // Use /api/auth/me which requires authentication
        const accessAfterLogout = await testApp.inject({
          method: 'GET',
          url: '/api/auth/me',
          cookies: { session_token: sessionCookie!.value }
        })

        expect(accessAfterLogout.statusCode).toBe(401)
      } finally {
        await testApp.close()
        // Restore environment
        if (originalRegistration !== undefined) {
          process.env.ALLOW_REGISTRATION = originalRegistration
        } else {
          delete process.env.ALLOW_REGISTRATION
        }
        if (originalMode !== undefined) {
          process.env.FOVEA_MODE = originalMode
        } else {
          delete process.env.FOVEA_MODE
        }
      }
    })
  })

  describe('Admin creates user → user manages resources flow', () => {
    it('admin creates user → user logs in → user creates persona', async () => {
      // 1. Create admin user
      const adminPasswordHash = await hashPassword('adminpass')
      await prisma.user.create({
        data: {
          username: 'admin',
          email: 'admin@example.com',
          passwordHash: adminPasswordHash,
          displayName: 'Admin',
          isAdmin: true
        }
      })

      // 2. Admin logs in
      const adminLoginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'adminpass' }
      })

      const adminCookie = adminLoginResponse.cookies.find(c => c.name === 'session_token')

      // 3. Admin creates new user
      const createUserResponse = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        cookies: { session_token: adminCookie!.value },
        payload: {
          username: 'analyst',
          email: 'analyst@example.com',
          password: 'analystpass',
          displayName: 'Analyst User',
          isAdmin: false
        }
      })

      expect(createUserResponse.statusCode).toBe(201)
      const newUser = createUserResponse.json()

      // 4. New user logs in
      const userLoginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'analyst', password: 'analystpass' }
      })

      expect(userLoginResponse.statusCode).toBe(200)
      const userCookie = userLoginResponse.cookies.find(c => c.name === 'session_token')

      // 5. User creates persona
      const createPersonaResponse = await app.inject({
        method: 'POST',
        url: '/api/personas',
        cookies: { session_token: userCookie!.value },
        payload: {
          name: 'Threat Hunter',
          role: 'Security Analyst',
          informationNeed: 'APT detection'
        }
      })

      expect(createPersonaResponse.statusCode).toBe(201)
      const persona = createPersonaResponse.json()
      // Note: Persona API doesn't return userId in response for security
      const personaInDb = await prisma.persona.findUnique({
        where: { id: persona.id }
      })
      expect(personaInDb!.userId).toBe(newUser.id)

      // 6. User can only see their own personas
      const getPersonasResponse = await app.inject({
        method: 'GET',
        url: '/api/personas',
        cookies: { session_token: userCookie!.value }
      })

      const personas = getPersonasResponse.json()
      expect(personas).toHaveLength(1)
      expect(personas[0].id).toBe(persona.id)
    })
  })

  describe('Session expiration and re-authentication', () => {
    it('expired session requires re-authentication', async () => {
      // Force multi-user mode for this test
      const originalMode = process.env.FOVEA_MODE
      process.env.FOVEA_MODE = 'multi-user'

      // Create new app instance with multi-user mode
      const testApp = await buildApp()

      try {
        // 1. Create user
        const passwordHash = await hashPassword('testpass')
        const user = await prisma.user.create({
          data: {
            username: 'testuser',
            email: 'test@example.com',
            passwordHash,
            displayName: 'Test User',
            isAdmin: false
          }
        })

        // 2. Create expired session manually
        const expiredDate = new Date()
        expiredDate.setDate(expiredDate.getDate() - 1)

        const expiredSession = await prisma.session.create({
          data: {
            userId: user.id,
            token: 'expired-token-integration',
            expiresAt: expiredDate
          }
        })

        // 3. Try to access protected resource with expired session
        // Use /api/auth/me which requires authentication
        const accessResponse = await testApp.inject({
          method: 'GET',
          url: '/api/auth/me',
          cookies: { session_token: expiredSession.token }
        })

        expect(accessResponse.statusCode).toBe(401)

        // 4. Re-authenticate
        const loginResponse = await testApp.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'testuser', password: 'testpass' }
      })

      expect(loginResponse.statusCode).toBe(200)
      const newCookie = loginResponse.cookies.find(c => c.name === 'session_token')

        // 5. Access protected resource with new session
        const retryAccessResponse = await testApp.inject({
        method: 'GET',
        url: '/api/personas',
        cookies: { session_token: newCookie!.value }
      })

        expect(retryAccessResponse.statusCode).toBe(200)
      } finally {
        await testApp.close()
        // Restore original mode
        if (originalMode) {
          process.env.FOVEA_MODE = originalMode
        } else {
          delete process.env.FOVEA_MODE
        }
      }
    })
  })

  describe('Password change (future) → sessions remain valid', () => {
    it('sessions remain valid after password update', async () => {
      // Note: This tests current behavior. In a production system,
      // you might want to invalidate sessions on password change.

      // 1. Create user and login
      const passwordHash = await hashPassword('oldpass')
      const user = await prisma.user.create({
        data: {
          username: 'testuser',
          email: 'test@example.com',
          passwordHash,
          displayName: 'Test User',
          isAdmin: false
        }
      })

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'testuser', password: 'oldpass' }
      })

      const sessionCookie = loginResponse.cookies.find(c => c.name === 'session_token')

      // 2. Update password directly in database
      const newPasswordHash = await hashPassword('newpass')
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash }
      })

      // 3. Verify old session still works
      const accessResponse = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { session_token: sessionCookie!.value }
      })

      expect(accessResponse.statusCode).toBe(200)
      expect(accessResponse.json().user.username).toBe('testuser')
    })
  })

  describe('User deletion → sessions invalidated', () => {
    it('all sessions invalidated when user is deleted', async () => {
      // 1. Create admin and regular user
      const adminPasswordHash = await hashPassword('adminpass')
      await prisma.user.create({
        data: {
          username: 'admin',
          email: 'admin@example.com',
          passwordHash: adminPasswordHash,
          displayName: 'Admin',
          isAdmin: true
        }
      })

      const userPasswordHash = await hashPassword('userpass')
      const regularUser = await prisma.user.create({
        data: {
          username: 'regularuser',
          email: 'regular@example.com',
          passwordHash: userPasswordHash,
          displayName: 'Regular User',
          isAdmin: false
        }
      })

      // 2. Create sessions for regular user
      const loginResponse1 = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'regularuser', password: 'userpass' }
      })
      const session1 = loginResponse1.cookies.find(c => c.name === 'session_token')

      const loginResponse2 = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'regularuser', password: 'userpass' }
      })
      const session2 = loginResponse2.cookies.find(c => c.name === 'session_token')

      // 3. Admin logs in
      const adminLoginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'adminpass' }
      })
      const adminCookie = adminLoginResponse.cookies.find(c => c.name === 'session_token')

      // 4. Admin deletes regular user
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/admin/users/${regularUser.id}`,
        cookies: { session_token: adminCookie!.value }
      })

      expect(deleteResponse.statusCode).toBe(200)

      // 5. Verify regular user's sessions are invalid (cascade delete)
      const accessResponse1 = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { session_token: session1!.value }
      })

      const accessResponse2 = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { session_token: session2!.value }
      })

      expect(accessResponse1.statusCode).toBe(401)
      expect(accessResponse2.statusCode).toBe(401)

      // 6. Verify sessions deleted from database
      const sessions = await prisma.session.findMany({
        where: { userId: regularUser.id }
      })
      expect(sessions).toHaveLength(0)
    })
  })

  describe('Concurrent sessions', () => {
    it('supports multiple concurrent sessions for same user', async () => {
      // 1. Create user
      const passwordHash = await hashPassword('testpass')
      await prisma.user.create({
        data: {
          username: 'testuser',
          email: 'test@example.com',
          passwordHash,
          displayName: 'Test User',
          isAdmin: false
        }
      })

      // 2. Login from multiple devices
      const login1 = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'testuser', password: 'testpass' },
        headers: { 'user-agent': 'Device 1' }
      })

      const login2 = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'testuser', password: 'testpass' },
        headers: { 'user-agent': 'Device 2' }
      })

      const login3 = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'testuser', password: 'testpass' },
        headers: { 'user-agent': 'Device 3' }
      })

      const cookie1 = login1.cookies.find(c => c.name === 'session_token')
      const cookie2 = login2.cookies.find(c => c.name === 'session_token')
      const cookie3 = login3.cookies.find(c => c.name === 'session_token')

      // 3. Verify all sessions are independent and valid
      const access1 = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { session_token: cookie1!.value }
      })

      const access2 = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { session_token: cookie2!.value }
      })

      const access3 = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { session_token: cookie3!.value }
      })

      expect(access1.statusCode).toBe(200)
      expect(access2.statusCode).toBe(200)
      expect(access3.statusCode).toBe(200)

      // 4. Logout from one device
      await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        cookies: { session_token: cookie1!.value }
      })

      // 5. Verify only that session is invalid
      const accessAfterLogout1 = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { session_token: cookie1!.value }
      })

      const accessAfterLogout2 = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { session_token: cookie2!.value }
      })

      expect(accessAfterLogout1.statusCode).toBe(401)
      expect(accessAfterLogout2.statusCode).toBe(200) // Other sessions still valid
    })
  })

  describe('Admin session management', () => {
    it('admin can view and delete user sessions', async () => {
      // 1. Create admin and regular user
      const adminPasswordHash = await hashPassword('adminpass')
      await prisma.user.create({
        data: {
          username: 'admin',
          email: 'admin@example.com',
          passwordHash: adminPasswordHash,
          displayName: 'Admin',
          isAdmin: true
        }
      })

      const userPasswordHash = await hashPassword('userpass')
      const regularUser = await prisma.user.create({
        data: {
          username: 'regularuser',
          email: 'regular@example.com',
          passwordHash: userPasswordHash,
          displayName: 'Regular User',
          isAdmin: false
        }
      })

      // 2. Regular user creates multiple sessions
      const userLogin1 = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'regularuser', password: 'userpass' }
      })

      const userLogin2 = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'regularuser', password: 'userpass' }
      })

      const userCookie1 = userLogin1.cookies.find(c => c.name === 'session_token')
      const userCookie2 = userLogin2.cookies.find(c => c.name === 'session_token')

      // 3. Admin logs in
      const adminLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'adminpass' }
      })

      const adminCookie = adminLogin.cookies.find(c => c.name === 'session_token')

      // 4. Admin views all sessions
      const getSessionsResponse = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions',
        cookies: { session_token: adminCookie!.value }
      })

      expect(getSessionsResponse.statusCode).toBe(200)
      const sessions = getSessionsResponse.json()
      expect(sessions.length).toBeGreaterThanOrEqual(3) // Admin + 2 user sessions

      // 5. Admin deletes one user session
      // Sessions have user.id in response, not userId directly
      const userSessions = sessions.filter((s: { user?: { id: string } }) => s.user?.id === regularUser.id)
      expect(userSessions.length).toBeGreaterThan(0)

      const deleteSessionResponse = await app.inject({
        method: 'DELETE',
        url: `/api/admin/sessions/${userSessions[0].id}`,
        cookies: { session_token: adminCookie!.value }
      })

      expect(deleteSessionResponse.statusCode).toBe(200)

      // 6. Verify at least one session is invalid
      // We don't know which cookie was deleted, so check both
      const accessResponse1 = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { session_token: userCookie1!.value }
      })

      const accessResponse2 = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { session_token: userCookie2!.value }
      })

      // At least one should be invalid, the other still valid
      const responses = [accessResponse1.statusCode, accessResponse2.statusCode]
      expect(responses).toContain(401) // One is invalid
      expect(responses).toContain(200) // One is still valid
    })
  })
})
