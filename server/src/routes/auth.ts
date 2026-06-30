import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcrypt'
import { Type } from '@sinclair/typebox'
import { Prisma } from '@prisma/client'
import { authService } from '../services/auth-service.js'
import { lockoutService } from '../services/lockout-service.js'
import { prisma } from '../lib/prisma.js'
import {
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  TooManyRequestsError,
  conflictMessageFromP2002,
} from '../lib/errors.js'
import {
  recordLoginAttempt,
  recordSessionEvent,
} from '../lib/authMetrics.js'
import { requireAuth } from '../middleware/auth.js'
import { config } from '../config.js'
import { buildAbilities } from '../middleware/abilities.js'
import { serializeAbilities } from '../lib/abilities.js'
import { isSingleUserMode } from '../services/user-service.js'

/**
 * Authentication routes for login, logout, registration.
 */
const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Login endpoint.
   * Authenticates user and creates session.
   * Implements account lockout and session regeneration.
   *
   * @route POST /api/auth/login
   */
  fastify.post<{
    Body: {
      username: string
      password: string
      rememberMe?: boolean
    }
  }>(
    '/api/auth/login',
    {
      schema: {
        description: 'Authenticate user and create session',
        tags: ['auth'],
        body: Type.Object({
          username: Type.String({ minLength: 1 }),
          password: Type.String({ minLength: 1 }),
          rememberMe: Type.Optional(Type.Boolean()),
        }),
        response: {
          200: Type.Object({
            user: Type.Object({
              id: Type.String({ format: 'uuid' }),
              username: Type.String(),
              email: Type.Union([Type.String(), Type.Null()]),
              displayName: Type.String(),
              isAdmin: Type.Boolean(),
            }),
          }),
          401: Type.Object({
            error: Type.String(),
          }),
          429: Type.Object({
            error: Type.String(),
            message: Type.String(),
            details: Type.Object({
              retryAfterSeconds: Type.Number(),
            }),
          }),
        },
      },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { username, password, rememberMe } = request.body

      // Check lockout status before authentication
      // Note: recordLockout is called within lockoutService.checkLockout when locked
      const lockoutStatus = await lockoutService.checkLockout(username)
      if (lockoutStatus.locked) {
        request.log.warn(
          { username, attemptCount: lockoutStatus.attemptCount },
          'Login blocked due to lockout'
        )
        reply.header('Retry-After', lockoutStatus.retryAfterSeconds.toString())
        throw new TooManyRequestsError(
          'Too many failed login attempts. Please try again later.',
          lockoutStatus.retryAfterSeconds
        )
      }

      // Authenticate with password provider
      const result = await authService.authenticate('password', {
        username,
        password,
      })

      if (!result.success || !result.user) {
        // Record failed attempt
        await lockoutService.recordFailedAttempt(username, request.ip)
        recordLoginAttempt(false, result.error || 'invalid_credentials')
        request.log.info({ username }, 'Failed login attempt')
        throw new UnauthorizedError(result.error || 'Authentication failed')
      }

      // Clear failed attempts on successful login
      await lockoutService.recordSuccessfulLogin(username)

      // Get existing session token (if any) for regeneration
      const oldToken = request.cookies.session_token || ''

      // Regenerate session (creates new session and invalidates old one atomically)
      const { token, expiresAt, oldSessionId, newSessionId } =
        await authService.regenerateSession(oldToken, result.user.id, {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          expiresInDays: rememberMe ? 30 : 7,
        })

      // Record successful login and session event
      recordLoginAttempt(true)
      recordSessionEvent(oldSessionId ? 'regenerated' : 'created')

      request.log.info(
        { userId: result.user.id, oldSessionId, newSessionId },
        'Session regenerated on login'
      )

      // Set session cookie
      reply.setCookie('session_token', token, {
        httpOnly: true,
        secure: config.server.isProduction,
        sameSite: 'lax',
        expires: expiresAt,
        path: '/',
      })

      return {
        user: {
          id: result.user.id,
          username: result.user.username,
          email: result.user.email,
          displayName: result.user.displayName,
          isAdmin: result.user.isAdmin,
        },
      }
    }
  )

  /**
   * Logout endpoint.
   * Destroys session and clears cookie.
   *
   * @route POST /api/auth/logout
   */
  fastify.post(
    '/api/auth/logout',
    {
      schema: {
        description: 'Logout user and destroy session',
        tags: ['auth'],
        response: {
          200: Type.Object({
            success: Type.Boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      const token = request.cookies.session_token

      if (token) {
        await authService.destroySession(token)
        recordSessionEvent('revoked')
      }

      reply.clearCookie('session_token', { path: '/' })
      return { success: true }
    }
  )

  /**
   * Get current user endpoint.
   * Returns authenticated user or 401.
   *
   * @route GET /api/auth/me
   */
  fastify.get(
    '/api/auth/me',
    {
      schema: {
        description: 'Get current authenticated user',
        tags: ['auth'],
        response: {
          200: Type.Object({
            user: Type.Object({
              id: Type.String({ format: 'uuid' }),
              username: Type.String(),
              email: Type.Union([Type.String(), Type.Null()]),
              displayName: Type.String(),
              isAdmin: Type.Boolean(),
            }),
          }),
          401: Type.Object({
            error: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      const token = request.cookies.session_token

      // Handle session-based authentication
      if (token) {
        const user = await authService.validateSession(token)

        if (!user) {
          reply.clearCookie('session_token', { path: '/' })
          throw new UnauthorizedError('Session expired')
        }

        return {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.displayName,
            isAdmin: user.isAdmin,
          },
        }
      }

      // In single-user mode, auto-authenticate with default user
      if (isSingleUserMode()) {
        // Find default user by id (matches what seed.ts creates)
        const defaultUserId = 'default-user'
        let defaultUser = await prisma.user.findUnique({
          where: { id: defaultUserId },
        })

        if (!defaultUser) {
          // Create default user if doesn't exist (fallback if seed didn't run)
          defaultUser = await prisma.user.create({
            data: {
              id: defaultUserId,
              username: 'user',
              displayName: 'Default User',
              email: null,
              passwordHash: null,
              isAdmin: false,
            },
          })
        }

        // Create session for default user
        const { token: sessionToken, expiresAt } = await authService.createSession(
          defaultUser.id,
          {
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
            expiresInDays: 30,
          }
        )

        // Set session cookie
        reply.setCookie('session_token', sessionToken, {
          httpOnly: true,
          secure: config.server.isProduction,
          sameSite: 'lax',
          expires: expiresAt,
          path: '/',
        })

        return {
          user: {
            id: defaultUser.id,
            username: defaultUser.username,
            email: defaultUser.email,
            displayName: defaultUser.displayName,
            isAdmin: defaultUser.isAdmin,
          },
        }
      }

      // Multi-user mode requires authentication
      throw new UnauthorizedError('Not authenticated')
    }
  )

  /**
   * User registration endpoint.
   * Only enabled if ALLOW_REGISTRATION=true.
   *
   * @route POST /api/auth/register
   */
  fastify.post<{
    Body: {
      username: string
      email?: string
      password: string
      displayName: string
    }
  }>(
    '/api/auth/register',
    {
      schema: {
        description: 'Register new user (if enabled)',
        tags: ['auth'],
        body: Type.Object({
          username: Type.String({ minLength: 3, maxLength: 50 }),
          email: Type.Optional(Type.String({ format: 'email' })),
          password: Type.String({ minLength: 8 }),
          displayName: Type.String({ minLength: 1 }),
        }),
        response: {
          201: Type.Object({
            user: Type.Object({
              id: Type.String({ format: 'uuid' }),
              username: Type.String(),
              email: Type.Union([Type.String(), Type.Null()]),
              displayName: Type.String(),
              isAdmin: Type.Boolean(),
            }),
          }),
          400: Type.Object({
            error: Type.String(),
          }),
          403: Type.Object({
            error: Type.String(),
          }),
          409: Type.Object({
            error: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      // Check if registration is enabled
      if (!config.auth.allowRegistration) {
        throw new ForbiddenError('Registration is disabled')
      }

      const { username, email, password, displayName } = request.body

      // Check if username already exists
      const existingUser = await prisma.user.findUnique({
        where: { username },
      })

      if (existingUser) {
        throw new ConflictError('Username already exists')
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12)

      // Create user. The pre-check narrows the common case, but a duplicate
      // username can still race past it, and a duplicate email is not pre-checked
      // at all — translate the unique violation to 409 instead of a 500.
      let user
      try {
        user = await prisma.user.create({
          data: {
            username,
            email: email || null,
            passwordHash,
            displayName,
            isAdmin: false,
          },
        })
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictError(conflictMessageFromP2002(error, {
            email: 'An account with this email already exists',
            username: 'Username already exists',
          }))
        }
        throw error
      }

      // Create session so the user is logged in immediately after registration
      const { token, expiresAt } = await authService.regenerateSession('', user.id, {
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        expiresInDays: 7,
      })

      recordSessionEvent('created')

      reply.setCookie('session_token', token, {
        httpOnly: true,
        secure: config.server.isProduction,
        sameSite: 'lax',
        expires: expiresAt,
        path: '/',
      })

      return reply.code(201).send({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.displayName,
          isAdmin: user.isAdmin,
        },
      })
    }
  )

  /**
   * Session status endpoint.
   * Returns session expiration and last activity times.
   *
   * @route GET /api/auth/session-status
   */
  fastify.get(
    '/api/auth/session-status',
    {
      schema: {
        description: 'Get current session status',
        tags: ['auth'],
        response: {
          200: Type.Object({
            expiresAt: Type.String({ format: 'date-time' }),
            lastActivityAt: Type.String({ format: 'date-time' }),
          }),
          401: Type.Object({
            error: Type.String(),
          }),
        },
      },
    },
    async (request) => {
      const token = request.cookies.session_token

      if (!token) {
        throw new UnauthorizedError('No session found')
      }

      // Get session without updating lastActivityAt
      const session = await authService.getSession(token)

      if (!session) {
        throw new UnauthorizedError('Session not found or expired')
      }

      // Check if session has expired
      if (session.expiresAt < new Date()) {
        throw new UnauthorizedError('Session expired')
      }

      return {
        expiresAt: session.expiresAt.toISOString(),
        lastActivityAt: (session.lastActivityAt || session.createdAt).toISOString(),
      }
    }
  )

  /**
   * Extend session endpoint.
   * Extends the current session expiration by 30 minutes.
   *
   * @route POST /api/auth/extend-session
   */
  fastify.post(
    '/api/auth/extend-session',
    {
      schema: {
        description: 'Extend current session expiration',
        tags: ['auth'],
        response: {
          200: Type.Object({
            expiresAt: Type.String({ format: 'date-time' }),
          }),
          401: Type.Object({
            error: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      const token = request.cookies.session_token

      if (!token) {
        throw new UnauthorizedError('No session found')
      }

      // Extend session by 30 minutes
      const newExpiresAt = await authService.extendSession(token, 30)

      if (!newExpiresAt) {
        throw new UnauthorizedError('Session not found or expired')
      }

      recordSessionEvent('extended')

      // Update cookie with new expiration
      reply.setCookie('session_token', token, {
        httpOnly: true,
        secure: config.server.isProduction,
        sameSite: 'lax',
        expires: newExpiresAt,
        path: '/',
      })

      return {
        expiresAt: newExpiresAt.toISOString(),
      }
    }
  )

  /**
   * Get CASL abilities for the current user.
   * Returns serialized permission rules for frontend authorization.
   *
   * @route GET /api/auth/abilities
   */
  fastify.get(
    '/api/auth/abilities',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Get serialized CASL abilities for current user',
        tags: ['auth'],
        response: {
          200: Type.Object({
            rules: Type.Array(Type.Unknown()),
          }),
          401: Type.Object({
            error: Type.String(),
          }),
        },
      },
    },
    async (request) => {
      if (!request.ability) {
        throw new UnauthorizedError('No abilities defined')
      }

      return {
        rules: serializeAbilities(request.ability),
      }
    }
  )
}

export default authRoutes
