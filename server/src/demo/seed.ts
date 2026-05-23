/**
 * Demo fixture-seeder route — POST /api/demo/seed seeds a known
 * workspace state for a given tour id. Gated by FOVEA_DEMO_MODE and
 * additionally protected by the X-Demo-Seed-Token header so a leaked
 * URL alone can't wipe the database.
 *
 * Self-hosters who want fixture-mode tours can also use this endpoint
 * by pointing their own seed bundles at the same JSON Schema (see
 * CVPR_2026_DEMO_PLAN.md §6.6 — the seeder is generic, only the
 * fixture *data* is CVPR-flavored).
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { getSeedToken, isDemoModeEnabled } from './config'

interface SeedRequestBody {
  tourId: string
  sessionUserId: string
}

const seedPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  if (!isDemoModeEnabled()) {
    app.log.info('[demo] fixture-seed endpoint NOT registered (FOVEA_DEMO_MODE off)')
    return
  }

  const token = getSeedToken()
  if (!token) {
    app.log.error(
      '[demo] fixture-seed endpoint NOT registered: FOVEA_DEMO_SEED_TOKEN is unset or < 32 chars. Refusing to register an unauthenticated state-wipe endpoint.',
    )
    return
  }

  app.post<{ Body: SeedRequestBody; Reply: { seeded: string[] } | { error: string } }>(
    '/api/demo/seed',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tourId', 'sessionUserId'],
          properties: {
            tourId: { type: 'string', minLength: 1, maxLength: 64 },
            sessionUserId: { type: 'string', minLength: 1, maxLength: 64 },
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['seeded'],
            properties: {
              seeded: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const provided = req.headers['x-demo-seed-token']
      if (provided !== token) {
        return reply.code(403).send({ error: 'invalid X-Demo-Seed-Token' })
      }
      // Stubbed pending the fixture bundles landing under
      // annotation-tool/demo/fixtures/tour-{id}/.
      throw new Error('fixture seeding not yet implemented (T-7 milestone)')
    },
  )
}

export default seedPlugin
