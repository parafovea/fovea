/**
 * Idle-reset job — periodically deletes anonymous demo users (and their
 * cascaded workspace data) that have been idle longer than the
 * configured window. Started by registerDemoLayer at boot when
 * FOVEA_DEMO_MODE is on; the scheduler is a plain setInterval rather
 * than BullMQ because the work is small, fast, and doesn't need
 * cross-process coordination at booth scale.
 *
 * Idle is measured against the freshest Session.lastActivityAt for the
 * anonymous user. When the visitor clicks anything in the workspace,
 * the existing session-touch hook keeps that column fresh. A 10-minute
 * gap means the user walked away.
 *
 * The reset is destructive: deleting the User row cascades to personas,
 * annotations, claims, summaries, world objects, and sessions via the
 * onDelete: Cascade relations in schema.prisma. That's the point — a
 * CVPR demo workspace is per-visitor and ephemeral.
 */

import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'

const IDLE_WINDOW_MS = 10 * 60 * 1000 // 10 minutes (plan §5.3)
const SWEEP_INTERVAL_MS = 60 * 1000 // 1 minute
const DEMO_USERNAME_PREFIX = 'demo-anonymous-'

export function startIdleResetJob(app: FastifyInstance): () => void {
  const handle = setInterval(() => {
    void sweepOnce(app).catch((err) => {
      app.log.warn({ err }, '[demo] idle-reset sweep failed')
    })
  }, SWEEP_INTERVAL_MS)

  app.log.info('[demo] idle-reset job started (10 min window, 1 min sweep)')

  return () => {
    clearInterval(handle)
  }
}

async function sweepOnce(app: FastifyInstance): Promise<void> {
  const cutoff = new Date(Date.now() - IDLE_WINDOW_MS)

  // Find anonymous users whose freshest session is older than the
  // cutoff. A user with no sessions at all (created by the seeder but
  // never actually logged in) is also stale — that's the `none` arm.
  const stale = await prisma.user.findMany({
    where: {
      username: { startsWith: DEMO_USERNAME_PREFIX },
      OR: [
        { sessions: { none: {} } },
        {
          sessions: {
            every: { lastActivityAt: { lt: cutoff } },
          },
        },
      ],
    },
    select: { id: true },
  })

  if (stale.length === 0) return

  const ids = stale.map((u: { id: string }) => u.id)
  const deleted = await prisma.user.deleteMany({ where: { id: { in: ids } } })
  app.log.info({ swept: deleted.count }, '[demo] idle-reset swept stale anonymous users')
}
