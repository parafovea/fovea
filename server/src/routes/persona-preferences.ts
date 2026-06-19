import { Type, Static } from '@sinclair/typebox'
import { subject } from '@casl/ability'
import { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../middleware/auth.js'
import { buildAbilities } from '../middleware/abilities.js'
import { ErrorResponseSchema, NotFoundError, ForbiddenError } from '../lib/errors.js'
import { demoPermitsSystemPersonaRead } from '../lib/demo-rbac.js'

/**
 * Partial per-persona overrides layered on top of the user-level document.
 *
 * Every field is fully optional (the shape is ``Partial``) so the row only
 * stores what the user actually wants to pin at the persona level. Missing
 * fields inherit from the user-level preferences; ``null`` fields mean "use
 * the backend default" and are sent as omitted keys on the wire.
 */
const GenerationOverridesSchema = Type.Partial(
  Type.Object({
    temperature: Type.Number({ minimum: 0, maximum: 2 }),
    topP: Type.Number({ minimum: 0, maximum: 1 }),
    maxTokens: Type.Integer({ minimum: 1, maximum: 32768 }),
  })
)

const AudioOverridesSchema = Type.Partial(
  Type.Object({
    beamSize: Type.Integer({ minimum: 1, maximum: 10 }),
    computeType: Type.Union([
      Type.Literal('float16'),
      Type.Literal('float32'),
      Type.Literal('int8'),
      Type.Literal('int8_float16'),
    ]),
    numSpeakers: Type.Integer({ minimum: 1, maximum: 20 }),
    minSpeakers: Type.Integer({ minimum: 1, maximum: 20 }),
    maxSpeakers: Type.Integer({ minimum: 1, maximum: 20 }),
    vadThreshold: Type.Number({ minimum: 0, maximum: 1 }),
  })
)

const DetectionOverridesSchema = Type.Partial(
  Type.Object({
    confidenceThreshold: Type.Number({ minimum: 0, maximum: 1 }),
  })
)

const PersonaPreferencesPayloadSchema = Type.Partial(
  Type.Object({
    generation: GenerationOverridesSchema,
    audio: AudioOverridesSchema,
    detection: DetectionOverridesSchema,
  })
)

type PersonaPreferencesPayload = Static<typeof PersonaPreferencesPayloadSchema>

const ResponseSchema = Type.Object({
  personaId: Type.String({ format: 'uuid' }),
  inferencePreferences: PersonaPreferencesPayloadSchema,
  updatedAt: Type.String({ format: 'date-time' }),
})

const UpdateSchema = Type.Object({
  inferencePreferences: PersonaPreferencesPayloadSchema,
})

/**
 * Fastify plugin for per-persona inference preferences.
 *
 * Read+write rights follow the persona itself — a caller can edit a
 * persona's preferences iff they can update that persona. CASL's
 * ``accessibleBy``/``subject`` wrappers re-use the existing persona ability
 * rules so no new permission is introduced.
 */
const personaPreferencesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { personaId: string } }>(
    '/api/personas/:personaId/preferences',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Get persona-scoped inference preferences',
        tags: ['preferences'],
        params: Type.Object({ personaId: Type.String({ format: 'uuid' }) }),
        response: {
          200: ResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const personaId = request.params.personaId
      const persona = await fastify.prisma.persona.findUnique({
        where: { id: personaId },
      })
      if (!persona) throw new NotFoundError('Persona', personaId)
      if (!request.ability) throw new ForbiddenError('No abilities defined')
      if (!request.ability.can('read', subject('Persona', persona))) {
        // Callers whose CASL ability is scoped to their own data (anonymous
        // demo sessions, non-admin users opening a tour) still need to read
        // per-persona inference preferences for the seeded system personas the
        // deployment exposes via tours. demoPermitsSystemPersonaRead permits the
        // read only in demo mode and only for system personas (see
        // lib/demo-rbac.ts).
        if (!demoPermitsSystemPersonaRead(persona.isSystemGenerated)) {
          throw new ForbiddenError('Cannot read this Persona')
        }
      }

      const row = await fastify.prisma.personaPreferences.findUnique({
        where: { personaId },
      })
      if (!row) {
        return reply.send({
          personaId,
          inferencePreferences: {} as PersonaPreferencesPayload,
          updatedAt: new Date(0).toISOString(),
        })
      }
      return reply.send({
        personaId,
        inferencePreferences: (row.inferencePreferences ?? {}) as PersonaPreferencesPayload,
        updatedAt: row.updatedAt.toISOString(),
      })
    }
  )

  fastify.put<{
    Params: { personaId: string }
    Body: Static<typeof UpdateSchema>
  }>(
    '/api/personas/:personaId/preferences',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Upsert persona-scoped inference preferences',
        tags: ['preferences'],
        params: Type.Object({ personaId: Type.String({ format: 'uuid' }) }),
        body: UpdateSchema,
        response: {
          200: ResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const personaId = request.params.personaId
      const persona = await fastify.prisma.persona.findUnique({
        where: { id: personaId },
      })
      if (!persona) throw new NotFoundError('Persona', personaId)
      if (!request.ability) throw new ForbiddenError('No abilities defined')
      if (!request.ability.can('update', subject('Persona', persona))) {
        throw new ForbiddenError('Cannot update this Persona')
      }

      const row = await fastify.prisma.personaPreferences.upsert({
        where: { personaId },
        create: {
          personaId,
          inferencePreferences: request.body.inferencePreferences,
        },
        update: {
          inferencePreferences: request.body.inferencePreferences,
        },
      })
      return reply.send({
        personaId,
        inferencePreferences: (row.inferencePreferences ?? {}) as PersonaPreferencesPayload,
        updatedAt: row.updatedAt.toISOString(),
      })
    }
  )
}

export default personaPreferencesRoute
