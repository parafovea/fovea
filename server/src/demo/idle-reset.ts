/**
 * Idle-reset job — periodically deletes anonymous demo users (and their
 * cascaded workspace data) that have been idle longer than the
 * configured window. Started by registerDemoLayer at boot when
 * FOVEA_DEMO_MODE is on; the scheduler is a plain setInterval rather
 * than BullMQ because the work is small, fast, and doesn't need
 * cross-process coordination at booth scale.
 *
 * Idle is measured against the Session.lastActivityAt column for the
 * anonymous user — when a visitor clicks anything in the workspace,
 * the existing session-touch hook keeps that column fresh. A 10-minute
 * gap means the user walked away.
 *
 * The reset is destructive (deletes the User row, which cascades to
 * personas, annotations, claims, summaries, world objects, sessions).
 * That's the point: a CVPR demo workspace is per-visitor and ephemeral.
 */

import type { FastifyInstance } from 'fastify'

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
  // Pending T-11 implementation: the actual Prisma query against the
  // anonymous-user table. The shape is:
  //
  //   const cutoff = new Date(Date.now() - IDLE_WINDOW_MS)
  //   const stale = await app.prisma.user.findMany({
  //     where: {
  //       username: { startsWith: DEMO_USERNAME_PREFIX },
  //       sessions: { every: { lastActivityAt: { lt: cutoff } } },
  //     },
  //     select: { id: true },
  //   })
  //   await app.prisma.user.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } })
  //
  // Wired up once the anonymous-session endpoint lands a real user row.
  void app
  void IDLE_WINDOW_MS
  void DEMO_USERNAME_PREFIX
}
