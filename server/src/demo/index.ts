/**
 * Demo deployment layer entry point — wires every FOVEA_DEMO_MODE-gated
 * route under a single plugin so app.ts can register the layer with one
 * call. Each sub-plugin no-ops at register time if its flag is off, so
 * a stock build that simply imports this entry point pays no cost.
 *
 * Imports from product code (./../routes, ./../services, etc.) are
 * allowed. The reverse — product code reaching into this directory —
 * is forbidden by the eslint no-restricted-imports rule.
 */

import type { FastifyInstance } from 'fastify'
import anonymousSessionPlugin from './anonymous-session'
import seedPlugin from './seed'
import { isDemoModeEnabled } from './config'
import { startIdleResetJob } from './idle-reset'

export async function registerDemoLayer(app: FastifyInstance): Promise<void> {
  if (!isDemoModeEnabled()) {
    app.log.info('[demo] layer disabled (FOVEA_DEMO_MODE off)')
    return
  }
  app.log.warn(
    '[demo] layer ENABLED. This deployment exposes demo-only routes intended for demo.fovea.video. If this is a production deployment, set FOVEA_DEMO_MODE=false and restart.',
  )
  await app.register(anonymousSessionPlugin)
  await app.register(seedPlugin)

  // Idle-reset sweeper runs as long as the Fastify instance is alive;
  // tear it down on graceful shutdown so the timer doesn't keep the
  // process alive during test teardown.
  const stopIdleReset = startIdleResetJob(app)
  app.addHook('onClose', async () => {
    stopIdleReset()
  })
}
