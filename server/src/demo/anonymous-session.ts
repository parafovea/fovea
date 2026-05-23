/**
 * Anonymous-session route — issues a short-lived session for visitors
 * on demo.fovea.video. Gated by FOVEA_DEMO_MODE *and* the secondary
 * FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH flag (see ./config.ts). Refuses to
 * register at all if either is unset, so a misconfigured self-hoster
 * cannot accidentally enable unauthenticated access.
 *
 * The session is a real Session row scoped to a freshly-created
 * "demo-anonymous-{nanoid}" user with no admin role, no project
 * memberships, and a per-visitor namespaced workspace. The idle-reset
 * job (./idle-reset.ts) deletes the user + associated data after the
 * configured timeout.
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { isAnonymousAuthAllowed } from './config'

interface AnonymousSessionResponse {
  userId: string
  sessionToken: string
  /** Seconds until the session expires due to idle GC. */
  ttlSeconds: number
}

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
            required: ['userId', 'sessionToken', 'ttlSeconds'],
            properties: {
              userId: { type: 'string' },
              sessionToken: { type: 'string' },
              ttlSeconds: { type: 'number' },
            },
          },
        },
      },
    },
    async () => {
      // Implementation lands in T-11 (see plan timeline). Stubbed here
      // so the route registers and the CI gate that asserts 200 with
      // the flag on / 404 with it off can be wired now. Without this
      // stub the gate would have nothing to test against.
      throw new Error('anonymous-session creation not yet implemented (T-11 milestone)')
    },
  )
}

export default anonymousSessionPlugin
