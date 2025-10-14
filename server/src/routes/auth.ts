import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcrypt'
import { Type } from '@sinclair/typebox'
import { authService } from '../services/auth-service.js'
import { prisma } from '../lib/prisma.js'

/**
 * Authentication routes for login, logout, registration.
 */
const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Login endpoint.
   * Authenticates user and creates session.
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
        },
      },
    },
    async (request, reply) => {
      const { username, password, rememberMe } = request.body

      // Authenticate with password provider
      const result = await authService.authenticate('password', {
        username,
        password,
      })

      if (!result.success || !result.user) {
        return reply.code(401).send({ error: result.error || 'Authentication failed' })
      }

      // Create session
      const { token, expiresAt } = await authService.createSession(
        result.user.id,
        {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          expiresInDays: rememberMe ? 30 : 7,
        }
      )

      // Set session cookie
      reply.setCookie('session_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
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
      const mode = process.env.FOVEA_MODE || 'single-user'

      // Handle session-based authentication
      if (token) {
        const user = await authService.validateSession(token)

        if (!user) {
          reply.clearCookie('session_token', { path: '/' })
          return reply.code(401).send({ error: 'Session expired' })
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
      if (mode === 'single-user') {
        // Find or create default user
        let defaultUser = await prisma.user.findUnique({
          where: { username: 'user' },
        })

        if (!defaultUser) {
          // Create default user if doesn't exist
          const bcryptRounds = 12
          const defaultPassword = await bcrypt.hash('password', bcryptRounds)
          defaultUser = await prisma.user.create({
            data: {
              username: 'user',
              displayName: 'Default User',
              email: null,
              passwordHash: defaultPassword,
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
          secure: process.env.NODE_ENV === 'production',
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
      return reply.code(401).send({ error: 'Not authenticated' })
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
        },
      },
    },
    async (request, reply) => {
      // Check if registration is enabled
      if (process.env.ALLOW_REGISTRATION !== 'true') {
        return reply.code(403).send({ error: 'Registration is disabled' })
      }

      const { username, email, password, displayName } = request.body

      // Check if username already exists
      const existingUser = await prisma.user.findUnique({
        where: { username },
      })

      if (existingUser) {
        return reply.code(400).send({ error: 'Username already exists' })
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12)

      // Create user
      const user = await prisma.user.create({
        data: {
          username,
          email: email || null,
          passwordHash,
          displayName,
          isAdmin: false,
        },
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
}

export default authRoutes
