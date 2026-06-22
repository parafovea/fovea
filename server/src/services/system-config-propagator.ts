/**
 * Propagates SystemConfig rows from the server's Postgres to the
 * model-service's live runtime state.
 *
 * Shared between the admin-config route (push on every write) and the
 * startup hook (push every persisted row so a fresh model-service process
 * picks up admin state without operator intervention).
 *
 * Authentication is service-to-service via ``MODEL_SERVICE_ADMIN_TOKEN``;
 * no user session is involved. If the token is absent the function logs a
 * warning and returns without raising — the server should still serve the
 * rest of its API even when the model-service admin channel is not wired.
 */

import axios, { AxiosError } from 'axios'
import type { FastifyBaseLogger } from 'fastify'
import type { PrismaClient } from '@prisma/client'

import { config } from '../config.js'

interface AdminPushPayload {
  key: string
  value: unknown
}

/**
 * Outcome of a single SystemConfig push attempt.
 *
 * Distinguishing "intentionally skipped" from "tried and failed" lets the
 * admin-config route return 200 (DB row written, model-service channel
 * deliberately not wired) instead of 500 (DB write made it but the
 * downstream push erupted), which is what the docstring of this module
 * promises but the previous `boolean` return type collapsed.
 */
export type PushResult = 'pushed' | 'skipped-no-token' | 'failed'

/**
 * Push one ``(key, value)`` row to the model-service. Returns a typed
 * outcome — callers choose whether to treat 'skipped-no-token' as
 * benign (admin-config route, startup replay) or as a hard failure
 * (none currently). 'failed' always indicates an actual error.
 */
export async function pushSystemConfigRow(
  log: Pick<FastifyBaseLogger, 'warn' | 'info'>,
  payload: AdminPushPayload
): Promise<PushResult> {
  const modelServiceUrl = config.modelService.url
  const token = config.modelService.adminToken
  if (!token) {
    log.warn('MODEL_SERVICE_ADMIN_TOKEN not set; skipping SystemConfig propagation')
    return 'skipped-no-token'
  }
  try {
    await axios.post(`${modelServiceUrl}/api/admin/reconfigure`, payload, {
      timeout: 15000,
      headers: { 'X-Admin-Token': token, 'Content-Type': 'application/json' },
    })
    return 'pushed'
  } catch (err) {
    const error = err as AxiosError
    const detail = (error.response?.data as { detail?: string } | undefined)?.detail
    log.warn(
      `SystemConfig push for key=${payload.key} failed: ${detail ?? error.message} (status=${error.response?.status ?? 'none'})`
    )
    return 'failed'
  }
}

/**
 * Replay every persisted SystemConfig row. Used on server startup so a
 * fresh model-service picks up admin state without an operator hitting
 * the "Replay" button. Any per-row failure is logged but does not abort
 * the remaining rows.
 */
export async function replaySystemConfigOnStartup(
  prisma: PrismaClient,
  log: Pick<FastifyBaseLogger, 'warn' | 'info'>
): Promise<{ attempted: number; succeeded: number }> {
  const rows = await prisma.systemConfig.findMany()
  if (rows.length === 0) {
    log.info('No SystemConfig rows to replay on startup')
    return { attempted: 0, succeeded: 0 }
  }
  let succeeded = 0
  for (const row of rows) {
    const result = await pushSystemConfigRow(log, { key: row.key, value: row.value })
    if (result === 'pushed') succeeded += 1
  }
  log.info(
    `SystemConfig startup replay complete: ${succeeded}/${rows.length} rows applied to model-service`
  )
  return { attempted: rows.length, succeeded }
}
