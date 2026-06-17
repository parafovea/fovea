/**
 * Anonymous-session route — issues a short-lived session for visitors
 * on demo.fovea.video. Gated by FOVEA_DEMO_MODE *and* the secondary
 * FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH flag (see ./config.ts). Refuses to
 * register at all if either is unset, so a misconfigured self-hoster
 * cannot accidentally enable unauthenticated access.
 *
 * Implementation:
 *   1. Create a fresh User row with username `demo-anonymous-{hex}`.
 *      The user has no email, no password hash, no admin role, no
 *      project memberships, no group memberships.
 *   2. Create a Session row for that user via authService.createSession
 *      with a short TTL — the idle-reset sweeper deletes stale users
 *      after 10 min of inactivity, so anything longer is wasted.
 *   3. Set the session_token cookie httpOnly so it lives the same way
 *      a logged-in session does.
 *   4. Return userId + ttlSeconds to the client (no token in the body —
 *      that goes via the cookie).
 *
 * The demo user has the default systemRole='user' so CASL behaves
 * exactly as it would for a self-hosted single-user deployment.
 */

import crypto from 'node:crypto'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { authService } from '../services/auth-service.js'
import { config } from '../config.js'
import { isAnonymousAuthAllowed } from './config.js'

interface AnonymousSessionResponse {
  userId: string
  ttlSeconds: number
}

const ANON_USERNAME_PREFIX = 'demo-anonymous-'
const ANON_SESSION_TTL_DAYS = 1

const anonymousSessionPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  if (!isAnonymousAuthAllowed()) {
    app.log.info('[demo] anonymous-session endpoint NOT registered (flag off)')
    return
  }

  app.log.warn(
    '[demo] anonymous-session endpoint REGISTERED — this deployment will issue unauthenticated sessions on POST /api/demo/anonymous-session. If you are NOT running demo.fovea.video, disable FOVEA_DEMO_MODE / FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH immediately.',
  )

  app.post<{ Reply: AnonymousSessionResponse | { error: string } }>(
    '/api/demo/anonymous-session',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['userId', 'ttlSeconds'],
            properties: {
              userId: { type: 'string' },
              ttlSeconds: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      // Reuse the existing anonymous user if the visitor's session
      // cookie still resolves to a live demo-anonymous-* row. Avoids
      // accumulating one new user per Start click (which made the
      // personas dropdown fill up with "Demo Researcher" entries
      // because the admin-bypass query returned every anonymous
      // user's persona).
      const existingToken = request.cookies.session_token
      if (existingToken) {
        const existing = await prisma.session.findUnique({
          where: { token: existingToken },
          select: { user: { select: { id: true, username: true } }, expiresAt: true },
        })
        if (
          existing?.user?.username?.startsWith(ANON_USERNAME_PREFIX) &&
          existing.expiresAt > new Date()
        ) {
          return {
            userId: existing.user.id,
            ttlSeconds: Math.floor(
              (existing.expiresAt.getTime() - Date.now()) / 1000,
            ),
          }
        }
      }

      const suffix = crypto.randomBytes(6).toString('hex')
      const username = `${ANON_USERNAME_PREFIX}${suffix}`

      const user = await prisma.user.create({
        data: {
          username,
          email: null,
          passwordHash: null,
          displayName: 'Demo visitor',
          isAdmin: false,
          systemRole: 'user',
        },
      })

      const { token, expiresAt } = await authService.createSession(user.id, {
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        expiresInDays: ANON_SESSION_TTL_DAYS,
      })

      reply.setCookie('session_token', token, {
        httpOnly: true,
        secure: config.server.isProduction,
        sameSite: 'lax',
        expires: expiresAt,
        path: '/',
      })

      return {
        userId: user.id,
        ttlSeconds: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      }
    },
  )
}

export default anonymousSessionPlugin
