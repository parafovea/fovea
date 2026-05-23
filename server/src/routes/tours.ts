/**
 * Tours-manifest API — read-only listing of tours available to the
 * current deployment. Lives in product routes (not under /demo)
 * because the tour engine is a product feature, not demo cruft.
 *
 * Phase 1 (this commit): returns the static built-in catalog the
 * frontend already knows about. The endpoint exists so:
 *   1. The demo landing page can deep-link to /tour/:id and the
 *      backend can validate the id without the frontend trusting its
 *      own bundle.
 *   2. Self-hosters who wire $FOVEA_TOURS_DIR (planned for T-9) get
 *      their custom-tour directory listing surfaced through the same
 *      endpoint without a frontend change.
 *
 * Schema mirrors annotation-tool/src/tours/engine/types.ts.
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify'

interface TourSummary {
  id: string
  title: string
  description: string
  durationMinutes: number
  tags?: string[]
}

// The built-in catalog is intentionally duplicated server-side rather
// than imported from annotation-tool/. The frontend and backend are
// independent build units; this avoids a cross-package import for one
// list of three fields.
const BUILT_IN_TOURS: readonly TourSummary[] = [
  {
    id: 'first-annotation',
    title: 'First annotation in 90 seconds',
    description:
      "The on-ramp: pick a clip, pause anywhere, draw a box, assign a type. Annotations save as you go.",
    durationMinutes: 2,
    tags: ['annotation', 'video', 'getting-started'],
  },
]

const toursPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get<{ Reply: { tours: TourSummary[] } }>(
    '/api/tours',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['tours'],
            properties: {
              tours: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'title', 'description', 'durationMinutes'],
                  properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    durationMinutes: { type: 'number' },
                    tags: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    async () => ({ tours: [...BUILT_IN_TOURS] }),
  )
}

export default toursPlugin
