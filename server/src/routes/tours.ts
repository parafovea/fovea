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
import { loadCustomTours } from '../lib/custom-tours.js'

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
  {
    id: 'ontology-authoring',
    title: "Building a persona's ontology",
    description:
      'Author entity types, event types, roles, and relations — the four layers a Fovea persona uses to structure annotation.',
    durationMinutes: 3,
    tags: ['ontology', 'types', 'persona'],
  },
  {
    id: 'wikidata-augmentation',
    title: 'Grow your ontology from Wikidata',
    description:
      'Search Wikidata live, import an entity type with QID grounding, expand via related concepts in seconds.',
    durationMinutes: 2,
    tags: ['ontology', 'wikidata', 'augmentation'],
  },
  {
    id: 'events-roles-claims',
    title: 'Beyond boxes: events, roles, and claims',
    description:
      'Box two people, declare an event between them, assign roles, watch Fovea derive a structured claim and graph it.',
    durationMinutes: 4,
    tags: ['events', 'roles', 'claims', 'graph'],
  },
  {
    id: 'world-layer',
    title: 'The world layer: instances, places, times',
    description:
      'Beyond types, Fovea tracks specific instances — this concert, this venue, this date — and lets annotations point at them.',
    durationMinutes: 3,
    tags: ['world', 'entities', 'locations', 'times', 'collections'],
  },
  {
    id: 'model-in-the-loop',
    title: 'Model in the loop: tracking, interpolation, detection',
    description:
      'Models propose; humans dispose. Track a bbox across the clip, edit the trajectory, accept detection candidates.',
    durationMinutes: 4,
    tags: ['model-service', 'tracking', 'interpolation', 'detection'],
  },
  {
    id: 'summaries-and-claims',
    title: 'Summaries, transcripts, and claim extraction',
    description:
      'Generate a structured summary, browse the transcript, extract claims anchored to their source span.',
    durationMinutes: 4,
    tags: ['summaries', 'transcripts', 'claims', 'extraction'],
  },
  {
    id: 'collaboration',
    title: 'Collaboration: projects, groups, sharing',
    description:
      'Projects bundle videos, personas, and members. Groups are reusable membership sets across projects.',
    durationMinutes: 3,
    tags: ['projects', 'groups', 'sharing', 'collaboration'],
  },
  {
    id: 'admin',
    title: 'Admin: users, models, and system config',
    description:
      'Manage users, roles, and the active detection / tracking models. Validate VRAM before pushing.',
    durationMinutes: 3,
    tags: ['admin', 'rbac', 'models', 'system-config'],
  },
  {
    id: 'import-export',
    title: 'Import & export',
    description:
      'Pull in COCO, CSV, or Fovea-native dumps; export filtered by persona, time range, or type.',
    durationMinutes: 2,
    tags: ['import', 'export', 'data-management'],
  },
]

const toursPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Custom tours are loaded once at boot — server restart picks up
  // changes. Failures are logged loudly so a self-hoster sees them
  // without scrolling past success messages.
  const customLoad = await loadCustomTours()
  if (customLoad.failures.length > 0) {
    for (const failure of customLoad.failures) {
      app.log.warn({ path: failure.path, reason: failure.reason }, '[tours] failed to load custom tour file')
    }
  }
  if (customLoad.tours.length > 0) {
    app.log.info({ count: customLoad.tours.length }, '[tours] loaded custom tours from FOVEA_TOURS_DIR')
  }

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
    async () => ({ tours: [...BUILT_IN_TOURS, ...customLoad.tours] }),
  )
}

export default toursPlugin
