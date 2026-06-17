/**
 * Demo fixture-seeder route — POST /api/demo/seed seeds a known
 * workspace state for a given tour id. Gated by FOVEA_DEMO_MODE and
 * additionally protected by the X-Demo-Seed-Token header so a leaked
 * URL alone can't wipe the database.
 *
 * Implementation:
 *   1. Validate token (constant-time compare).
 *   2. Confirm the target user is an anonymous demo user (refuses to
 *      touch any real user even if the token is correct).
 *   3. Load the bundle from disk via $FOVEA_DEMO_FIXTURES_DIR (default
 *      `../annotation-tool/demo/fixtures/`).
 *   4. Validate the bundle shape via seed-schema.ts.
 *   5. Inside one Prisma $transaction: wipe the user's personas
 *      (cascade removes ontologies / world / annotations / claims /
 *      summaries / persona preferences) and recreate from the bundle.
 *
 * Idempotent: calling /api/demo/seed twice in a row produces identical
 * state. The first call wipes + recreates; the second wipes the just-
 * created rows and recreates the same shape.
 */

import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { config } from '../config.js'
import { prisma } from '../lib/prisma.js'
import { getSeedToken, isDemoModeEnabled } from './config.js'
import {
  validateSeedBundle,
  type SeedBundle,
  type SeedTypeDecl,
} from './seed-schema.js'

interface ClipManifestEntry {
  id: string
  sourceId: string
  durationSec: number
  framing?: string
}

interface ClipManifestSource {
  id: string
  title: string
  artist: string
  performanceDate?: string
  license: string
  sourceUrl: string
}

interface ClipManifest {
  sources: ClipManifestSource[]
  clips: ClipManifestEntry[]
}

/**
 * Where the clip manifest lives. Mirrors the FOVEA_DEMO_FIXTURES_DIR
 * pattern — override via env if the manifest moves; default resolves
 * from the server cwd to the monorepo location.
 */
function manifestPath(): string {
  const overridden = config.demo.clipsManifestPath
  if (overridden && overridden.length > 0) return overridden
  return resolve(
    process.cwd(),
    '..',
    'annotation-tool',
    'demo',
    'scripts',
    'clips.json',
  )
}

let cachedManifest: ClipManifest | null = null

async function loadManifest(): Promise<ClipManifest | null> {
  if (cachedManifest) return cachedManifest
  try {
    const raw = await readFile(manifestPath(), 'utf-8')
    cachedManifest = JSON.parse(raw) as ClipManifest
    return cachedManifest
  } catch {
    // Missing manifest is non-fatal: tours without videos still seed.
    return null
  }
}

interface SeedRequestBody {
  tourId: string
  sessionUserId: string
}

interface SeedSuccess {
  seeded: string[]
}

/**
 * Where the bundles live on disk. Resolves relative to the server
 * process cwd; in production the demo image bundles them next to the
 * server build. Override with FOVEA_DEMO_FIXTURES_DIR if you've laid
 * them out somewhere else (the env var matches the FOVEA_TOURS_DIR
 * pattern for custom tours).
 */
function fixturesDir(): string {
  const overridden = config.demo.fixturesDir
  if (overridden && overridden.length > 0) return overridden
  return resolve(process.cwd(), '..', 'annotation-tool', 'demo', 'fixtures')
}

const seedPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  if (!isDemoModeEnabled()) {
    app.log.info('[demo] fixture-seed endpoint NOT registered (FOVEA_DEMO_MODE off)')
    return
  }

  const token = getSeedToken()
  if (!token) {
    app.log.error(
      '[demo] fixture-seed endpoint NOT registered: FOVEA_DEMO_SEED_TOKEN is unset or < 32 chars. Refusing to register an unauthenticated state-wipe endpoint.',
    )
    return
  }

  app.post<{ Body: SeedRequestBody; Reply: SeedSuccess | { error: string } }>(
    '/api/demo/seed',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tourId', 'sessionUserId'],
          properties: {
            tourId: { type: 'string', minLength: 1, maxLength: 64 },
            sessionUserId: { type: 'string', minLength: 1, maxLength: 64 },
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['seeded'],
            properties: {
              seeded: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const provided = req.headers['x-demo-seed-token']
      if (typeof provided !== 'string' || !constantTimeEqual(provided, token)) {
        return reply.code(403).send({ error: 'invalid X-Demo-Seed-Token' })
      }

      const { tourId, sessionUserId } = req.body

      // Refuse to seed a user that isn't an anonymous demo user. The
      // anonymous-session endpoint names them `demo-anonymous-{hex}`;
      // the seeder MUST reject anything else so a leaked seed token
      // can't wipe a real user's workspace.
      const user = await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { id: true, username: true },
      })
      if (!user || !user.username.startsWith('demo-anonymous-')) {
        return reply
          .code(403)
          .send({ error: 'seed target must be an anonymous demo user' })
      }

      // Load + validate the bundle before touching the database.
      let bundle: SeedBundle
      try {
        // Convention: tourId is the bare tour id ("first-annotation"),
        // matching the `id` field of the tour script. The fixture
        // bundle on disk is named `tour-${id}.json`, matching the
        // bundle's own `tourId` field. The caller is expected to send
        // the bare id; mixing in filename stems is a layering error
        // we want to surface, not paper over.
        const path = join(fixturesDir(), `tour-${tourId}.json`)
        const raw = await readFile(path, 'utf-8')
        const parsed = JSON.parse(raw) as unknown
        const result = validateSeedBundle(parsed)
        if (!result.ok) {
          return reply.code(400).send({ error: `bundle invalid: ${result.reason}` })
        }
        if (result.bundle.tourId !== tourId) {
          return reply.code(400).send({
            error: `bundle tourId "${result.bundle.tourId}" does not match request tourId "${tourId}"`,
          })
        }
        bundle = result.bundle
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'ENOENT') {
          return reply.code(404).send({ error: `no fixture bundle for tourId "${tourId}"` })
        }
        return reply.code(500).send({ error: `failed to load bundle: ${(err as Error).message}` })
      }

      // Load the clip manifest now so the transaction body has it in
      // scope. Missing manifest is non-fatal: tours without videos
      // still seed (we just upsert no Video rows).
      const manifest = await loadManifest()

      type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
      const seeded = await prisma.$transaction(async (tx: Tx) => {
        // Wipe the user's personas; cascade removes ontologies / world /
        // annotations / claims / summaries / persona preferences.
        await tx.persona.deleteMany({ where: { userId: sessionUserId } })

        const createdPersonas: Array<{ id: string; index: number }> = []
        for (let i = 0; i < bundle.personas.length; i++) {
          const p = bundle.personas[i]
          const created = await tx.persona.create({
            data: {
              userId: sessionUserId,
              name: p.name,
              role: p.role,
              informationNeed: p.informationNeed ?? 'Demo persona.',
            },
            select: { id: true },
          })
          createdPersonas.push({ id: created.id, index: i })
        }

        if (bundle.ontology) {
          const target = createdPersonas[bundle.ontology.personaIndex]
          if (target) {
            await tx.ontology.create({
              data: {
                personaId: target.id,
                entityTypes: toJsonOntologyTypes(bundle.ontology.entityTypes),
                eventTypes: toJsonOntologyTypes(bundle.ontology.eventTypes),
                roleTypes: toJsonOntologyTypes(bundle.ontology.roles),
                relationTypes: toJsonOntologyTypes(bundle.ontology.relationTypes),
              },
            })
          }
        }

        // World / annotations / summaries: bundle accepts them as
        // untyped pass-throughs for forward compatibility, but the
        // seeder doesn't apply them yet — the corresponding bundle
        // sections in the demo content stay empty until each loader
        // lands. Tours 1-3 assume an empty world, which is correct.

        // Videos: upsert the rows referenced by bundle.videos[]. Videos
        // are shared resources (not user-owned), so we upsert by
        // filename so concurrent demo visitors using the same clips
        // don't trip the unique constraint. Each clip's metadata comes
        // from clips.json (loaded above as `manifest`) — the file path
        // is just `${clipId}.mp4` relative to the server's STORAGE_PATH,
        // matching where fetch-demo-clips.sh writes them.
        let videosUpserted = 0
        if (bundle.videos && bundle.videos.length > 0) {
          for (const v of bundle.videos) {
            const manifestEntry = manifest?.clips.find((c) => c.id === v.videoId)
            const source = manifestEntry
              ? manifest?.sources.find((s) => s.id === manifestEntry.sourceId)
              : undefined
            const filename = `${v.videoId}.mp4`
            await tx.video.upsert({
              where: { filename },
              update: {
                // Refresh duration if the manifest changed; everything
                // else is immutable per-clip.
                duration: manifestEntry?.durationSec ?? undefined,
              },
              create: {
                id: v.videoId,
                filename,
                path: filename,
                duration: manifestEntry?.durationSec ?? null,
                metadata: source
                  ? {
                      attribution: {
                        artist: source.artist,
                        title: source.title,
                        license: source.license,
                        sourceUrl: source.sourceUrl,
                        framing: manifestEntry?.framing ?? null,
                      },
                    }
                  : undefined,
              },
            })
            videosUpserted++
          }
        }

        const summary = [
          `${createdPersonas.length} persona(s)`,
          bundle.ontology ? 'ontology' : null,
          videosUpserted > 0 ? `${videosUpserted} video(s)` : null,
        ].filter((s): s is string => !!s)

        return summary
      })

      return { seeded }
    },
  )
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf-8')
  const bb = Buffer.from(b, 'utf-8')
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Stamp `id`, `createdAt`, `updatedAt`, and a single-segment `gloss`
 * array onto each declared type so the Ontology JSON columns match
 * the shape the frontend reads. We don't bother with rich GlossItem
 * content here — the tour's narration carries the explanation; the
 * database row just needs a usable type name + a definition string.
 */
function toJsonOntologyTypes(
  decls: SeedTypeDecl[] | undefined,
): Array<{ id: string; name: string; gloss: Array<{ type: string; content: string }>; examples: string[]; createdAt: string; updatedAt: string }> {
  if (!decls || decls.length === 0) return []
  const now = new Date().toISOString()
  return decls.map((d, i) => ({
    id: `demo-${i}-${d.name.toLowerCase().replace(/\s+/g, '-')}`,
    name: d.name,
    gloss: [{ type: 'text', content: d.gloss }],
    examples: [],
    createdAt: now,
    updatedAt: now,
  }))
}

export default seedPlugin
