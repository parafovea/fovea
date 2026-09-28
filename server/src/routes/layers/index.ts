import { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../../middleware/auth.js'
import { buildAbilities } from '../../middleware/abilities.js'
import expressionsRoutes from './expressions.js'
import mediaRoutes from './media.js'
import annotationLayersRoutes from './annotation-layers.js'
import videoAnnotationsRoutes from './video-annotations.js'
import graphRoutes from './graph.js'
import ontologiesRoutes from './ontologies.js'
import corporaRoutes from './corpora.js'
import interchangeRoutes from './interchange.js'

/**
 * Aggregator for the layers-shaped annotation store.
 *
 * Applies the shared authentication + CASL hooks once, then registers each
 * resource sub-module under the `/api/layers` prefix. Every sub-module is a
 * plain `FastifyPluginAsync` (see the route contract below) that declares its
 * own endpoints; because the hooks are registered on this encapsulated plugin
 * instance before the sub-modules, all layers endpoints run behind
 * `requireAuth` + `buildAbilities` without repeating the wiring per file.
 *
 * Route contract each sub-module MUST satisfy:
 *
 * ```ts
 * import { FastifyInstance } from 'fastify'
 * export default async function <name>Routes(fastify: FastifyInstance): Promise<void> {
 *   fastify.get('/expressions', { schema: { ... } }, handler)
 *   // ...register this resource's endpoints on `fastify`
 * }
 * ```
 *
 * i.e. a default-exported `FastifyPluginAsync` (async `(fastify) => void`).
 * Sub-modules must NOT re-register `requireAuth` / `buildAbilities` (the
 * aggregator owns them) and must NOT add their own `/api/layers` prefix — the
 * prefix is applied here at registration time. Endpoint paths are declared
 * relative to that prefix (e.g. `/expressions`, `/media/:id`).
 */
const layersRoute: FastifyPluginAsync = async (fastify) => {
  // Shared hooks for every layers endpoint: authenticate the caller, then
  // build their CASL abilities so per-route accessibleBy()/can() checks work.
  fastify.addHook('onRequest', requireAuth)
  fastify.addHook('onRequest', buildAbilities)

  await fastify.register(expressionsRoutes)
  await fastify.register(mediaRoutes)
  await fastify.register(annotationLayersRoutes)
  await fastify.register(videoAnnotationsRoutes)
  await fastify.register(graphRoutes)
  await fastify.register(ontologiesRoutes)
  await fastify.register(corporaRoutes)
  await fastify.register(interchangeRoutes)
}

export default layersRoute
