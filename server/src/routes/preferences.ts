import { Type, Static } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../middleware/auth.js'
import { ErrorResponseSchema } from '../lib/errors.js'

/**
 * Wire-shape of the per-user inference preferences document.
 *
 * Mirrors the frontend's ``InferencePreferences`` type verbatim. Fields may
 * be ``null``, meaning "use the backend dataclass default" — omitted keys
 * from the DB fall back through the same path.
 *
 * The nullable fields use ``Type.Unsafe`` with a JSON-Schema array type so
 * fast-json-stringify serializes ``null`` correctly on the response path
 * (TypeBox's ``Type.Union([..., Type.Null()])`` silently coerces to ``0`` /
 * ``""``). Request AJV accepts either shape, but the two-sided invariant
 * only holds with the array-type form.
 */
const NullableNumber = Type.Unsafe<number | null>({ type: ['number', 'null'] })
const NullableInt = Type.Unsafe<number | null>({ type: ['integer', 'null'] })
const NullableComputeType = Type.Unsafe<
  'float16' | 'float32' | 'int8' | 'int8_float16' | null
>({
  type: ['string', 'null'],
  enum: ['float16', 'float32', 'int8', 'int8_float16', null],
})

const GenerationPreferencesSchema = Type.Object({
  temperature: NullableNumber,
  topP: NullableNumber,
  maxTokens: NullableInt,
})

const AudioPreferencesSchema = Type.Object({
  beamSize: NullableInt,
  computeType: NullableComputeType,
  numSpeakers: NullableInt,
  minSpeakers: NullableInt,
  maxSpeakers: NullableInt,
  vadThreshold: NullableNumber,
})

const DetectionPreferencesSchema = Type.Object({
  confidenceThreshold: NullableNumber,
})

const InferencePreferencesSchema = Type.Object({
  generation: GenerationPreferencesSchema,
  audio: AudioPreferencesSchema,
  detection: DetectionPreferencesSchema,
})

type InferencePreferencesPayload = Static<typeof InferencePreferencesSchema>

const EMPTY_PREFERENCES: InferencePreferencesPayload = {
  generation: { temperature: null, topP: null, maxTokens: null },
  audio: {
    beamSize: null,
    computeType: null,
    numSpeakers: null,
    minSpeakers: null,
    maxSpeakers: null,
    vadThreshold: null,
  },
  detection: { confidenceThreshold: null },
}

function normalize(raw: unknown): InferencePreferencesPayload {
  // Fall back to EMPTY_PREFERENCES for any missing / malformed sub-object so
  // a partially-written column still hydrates into a complete response.
  if (typeof raw !== 'object' || raw === null) return EMPTY_PREFERENCES
  const maybe = raw as Partial<InferencePreferencesPayload>
  return {
    generation: { ...EMPTY_PREFERENCES.generation, ...(maybe.generation ?? {}) },
    audio: { ...EMPTY_PREFERENCES.audio, ...(maybe.audio ?? {}) },
    detection: { ...EMPTY_PREFERENCES.detection, ...(maybe.detection ?? {}) },
  }
}

const PreferencesResponseSchema = Type.Object({
  inferencePreferences: InferencePreferencesSchema,
  updatedAt: Type.String({ format: 'date-time' }),
})

const PreferencesUpdateSchema = Type.Object({
  inferencePreferences: InferencePreferencesSchema,
})

/**
 * Fastify plugin for the authenticated user's own inference preferences.
 *
 * Routes:
 * - ``GET /api/me/preferences`` — read (creates row lazily, returns empty)
 * - ``PUT /api/me/preferences`` — upsert (atomic replace)
 *
 * Per-persona overrides and admin-managed system config are separate
 * routes — see ``persona-preferences.ts`` and ``admin-config.ts``.
 */
const preferencesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/me/preferences',
    {
      onRequest: [requireAuth],
      schema: {
        description: "Get current user's inference preferences",
        tags: ['preferences'],
        response: {
          200: PreferencesResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id
      const row = await fastify.prisma.userPreferences.findUnique({
        where: { userId },
      })
      if (!row) {
        return reply.send({
          inferencePreferences: EMPTY_PREFERENCES,
          updatedAt: new Date(0).toISOString(),
        })
      }
      return reply.send({
        inferencePreferences: normalize(row.inferencePreferences),
        updatedAt: row.updatedAt.toISOString(),
      })
    }
  )

  fastify.put<{ Body: Static<typeof PreferencesUpdateSchema> }>(
    '/api/me/preferences',
    {
      onRequest: [requireAuth],
      schema: {
        description: "Upsert current user's inference preferences",
        tags: ['preferences'],
        body: PreferencesUpdateSchema,
        response: {
          200: PreferencesResponseSchema,
          400: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id
      const row = await fastify.prisma.userPreferences.upsert({
        where: { userId },
        create: {
          userId,
          inferencePreferences: request.body.inferencePreferences,
        },
        update: {
          inferencePreferences: request.body.inferencePreferences,
        },
      })
      return reply.send({
        inferencePreferences: normalize(row.inferencePreferences),
        updatedAt: row.updatedAt.toISOString(),
      })
    }
  )
}

export default preferencesRoute
