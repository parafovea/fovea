import { Type, Static } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { requireAdmin } from '../middleware/auth.js'
import { ErrorResponseSchema, ConflictError, InternalError } from '../lib/errors.js'
import { pushSystemConfigRow } from '../services/system-config-propagator.js'

/**
 * Admin-only key-value configuration surface.
 *
 * Every key has a discriminated schema validated on write. The full set of
 * keys is enumerated by the ``ConfigKeyName`` union so adding a new setting
 * requires touching exactly this file plus the downstream consumers — no
 * stringly-typed escape hatch.
 *
 * On successful write the value is posted to the model-service
 * ``/api/admin/reconfigure`` endpoint authenticated with a shared service
 * token. On model-service startup the reverse direction is invoked (see
 * ``applySystemConfigOnBoot``) so persisted admin settings survive a
 * model-service restart.
 */

// ---------- per-key value schemas ----------

const StoragePathsValueSchema = Type.Object({
  videoDataRoot: Type.String({ minLength: 1, maxLength: 2048 }),
  thumbnailOutputRoot: Type.String({ minLength: 1, maxLength: 2048 }),
  audioOutputRoot: Type.String({ minLength: 1, maxLength: 2048 }),
})

const RuntimeValueSchema = Type.Object({
  cudaDevice: Type.String({ minLength: 1, maxLength: 64 }),
  warmupOnStartup: Type.Boolean(),
  defaultBatchSize: Type.Integer({ minimum: 1, maximum: 128 }),
  maxBatchSize: Type.Integer({ minimum: 1, maximum: 128 }),
  offloadThreshold: Type.Number({ minimum: 0, maximum: 1 }),
})

const ExternalApiProviderSchema = Type.Object({
  provider: Type.Union([
    Type.Literal('anthropic'),
    Type.Literal('openai'),
    Type.Literal('google'),
  ]),
  endpoint: Type.String({ minLength: 1, maxLength: 2048 }),
  timeoutSeconds: Type.Integer({ minimum: 1, maximum: 600 }),
  maxRetries: Type.Integer({ minimum: 0, maximum: 10 }),
})

const ExternalApisValueSchema = Type.Object({
  providers: Type.Array(ExternalApiProviderSchema),
})

// ---------- union of (key, value) rows ----------

const ConfigRowSchema = Type.Union([
  Type.Object({
    key: Type.Literal('storagePaths'),
    value: StoragePathsValueSchema,
  }),
  Type.Object({
    key: Type.Literal('runtime'),
    value: RuntimeValueSchema,
  }),
  Type.Object({
    key: Type.Literal('externalApis'),
    value: ExternalApisValueSchema,
  }),
])

const StoredConfigRowSchema = Type.Intersect([
  ConfigRowSchema,
  Type.Object({
    version: Type.Integer({ minimum: 1 }),
    updatedAt: Type.String({ format: 'date-time' }),
    updatedByUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  }),
])

type ConfigKey = 'storagePaths' | 'runtime' | 'externalApis'

const KNOWN_KEYS: readonly ConfigKey[] = ['storagePaths', 'runtime', 'externalApis'] as const

const DEFAULTS: { [K in ConfigKey]: Static<typeof ConfigRowSchema> & { key: K } } = {
  storagePaths: {
    key: 'storagePaths',
    value: {
      videoDataRoot: '/videos',
      thumbnailOutputRoot: '/tmp/thumbnails',
      audioOutputRoot: '/tmp/audio',
    },
  },
  runtime: {
    key: 'runtime',
    value: {
      cudaDevice: 'cuda',
      warmupOnStartup: false,
      defaultBatchSize: 1,
      maxBatchSize: 8,
      offloadThreshold: 0.85,
    },
  },
  externalApis: {
    key: 'externalApis',
    value: { providers: [] },
  },
}

function isKnownKey(value: string): value is ConfigKey {
  return (KNOWN_KEYS as readonly string[]).includes(value)
}

/**
 * Wrap ``pushSystemConfigRow`` so a failed write surfaces as an
 * InternalError to the HTTP client, while the startup replay path can
 * tolerate per-row failures silently.
 */
async function pushOrRaise(
  log: { warn: (msg: string) => void; info: (msg: string) => void },
  payload: { key: string; value: unknown }
): Promise<void> {
  const ok = await pushSystemConfigRow(log, payload)
  if (!ok) {
    throw new InternalError('Model-service refused the new configuration')
  }
}

const ListResponseSchema = Type.Object({
  rows: Type.Array(StoredConfigRowSchema),
})

const adminConfigRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/admin/config',
    {
      onRequest: [requireAdmin],
      schema: {
        description: 'List every SystemConfig row (with defaults materialized for missing keys)',
        tags: ['admin-config'],
        response: { 200: ListResponseSchema },
      },
    },
    async (_request, reply) => {
      const rows = await fastify.prisma.systemConfig.findMany()
      const byKey = new Map(rows.map((r) => [r.key, r]))
      const out = KNOWN_KEYS.map((key) => {
        const existing = byKey.get(key)
        if (existing) {
          return {
            key,
            value: existing.value as Static<typeof ConfigRowSchema>['value'],
            version: existing.version,
            updatedAt: existing.updatedAt.toISOString(),
            updatedByUserId: existing.updatedByUserId,
          }
        }
        return {
          ...DEFAULTS[key],
          version: 1,
          updatedAt: new Date(0).toISOString(),
          updatedByUserId: null,
        }
      })
      return reply.send({ rows: out })
    }
  )

  fastify.put<{
    Params: { key: string }
    Body: Static<typeof ConfigRowSchema>
  }>(
    '/api/admin/config/:key',
    {
      onRequest: [requireAdmin],
      schema: {
        description: 'Upsert a SystemConfig row and propagate to the model-service',
        tags: ['admin-config'],
        params: Type.Object({ key: Type.String() }),
        body: ConfigRowSchema,
        response: {
          200: StoredConfigRowSchema,
          400: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { key } = request.params
      if (!isKnownKey(key)) {
        throw new ConflictError(`Unknown config key: ${key}`)
      }
      if (request.body.key !== key) {
        throw new ConflictError(
          `Body key ${request.body.key} does not match URL key ${key}`
        )
      }

      // Resolve the caller's user row before writing. The SystemConfig
      // audit FK must point at a real users row or be null — the
      // ALLOW_TEST_ADMIN_BYPASS mode injects a synthetic id that isn't in
      // the table, and a user could in principle be deleted between auth
      // and this write in production.
      const callerId = request.user?.id ?? null
      let auditUserId: string | null = null
      if (callerId) {
        const caller = await fastify.prisma.user.findUnique({
          where: { id: callerId },
          select: { id: true },
        })
        auditUserId = caller?.id ?? null
      }

      const row = await fastify.prisma.systemConfig.upsert({
        where: { key },
        create: {
          key,
          value: request.body.value,
          updatedByUserId: auditUserId,
        },
        update: {
          value: request.body.value,
          version: { increment: 1 },
          updatedByUserId: auditUserId,
        },
      })

      await pushOrRaise(fastify.log, { key, value: request.body.value })

      return reply.send({
        key,
        value: row.value as Static<typeof ConfigRowSchema>['value'],
        version: row.version,
        updatedAt: row.updatedAt.toISOString(),
        updatedByUserId: row.updatedByUserId,
      })
    }
  )

  /**
   * Manual replay: forces every stored SystemConfig row back out to the
   * model-service. Used on model-service restart to re-sync state, and
   * exposed as a button in the admin UI for explicit "re-apply".
   */
  fastify.post(
    '/api/admin/config/replay',
    {
      onRequest: [requireAdmin],
      schema: {
        description: 'Re-push every SystemConfig row to the model-service',
        tags: ['admin-config'],
        response: {
          200: Type.Object({ replayed: Type.Array(Type.String()) }),
        },
      },
    },
    async (_request, reply) => {
      const rows = await fastify.prisma.systemConfig.findMany()
      for (const row of rows) {
        await pushOrRaise(fastify.log, { key: row.key, value: row.value })
      }
      return reply.send({ replayed: rows.map((r) => r.key) })
    }
  )
}

export default adminConfigRoute
