/**
 * One-shot backfill from the legacy ontology sidecar to the native layers
 * representation.
 *
 * Before the native re-model, every ontology-derived TypeDef stashed its whole
 * original type under `features.foveaOntology.object`, and its layers-native
 * columns held only a partial projection (flattened gloss text, raw EventRole[]
 * in allowedRoles, wikidata-only knowledgeRefs). This script reprojects each
 * stashed type through the current mapper so the native columns and stand-off
 * rows become authoritative, then removes the stash:
 *
 *   - `gloss` becomes the stand-off Expression + span AnnotationLayer + reference
 *     annotations (via {@link writeGlossStandoff});
 *   - `allowedRoles` becomes true roleSlot[] (event roles, relation domain/range,
 *     and a sentinel constraints slot);
 *   - `allowedValues` receives a role type's allowed filler kinds;
 *   - `knowledgeRefs` receives the wikidata/wikibase identifiers and the OWL
 *     algebraic-property groundings;
 *   - `features` holds only flat identity/ordering/provenance scalars, with the
 *     `foveaOntology` stash removed.
 *
 * Idempotent: every derived id is a pure function of the row id, and a re-run
 * finds no `foveaOntology` stash to migrate. Reversible in spirit — it rewrites
 * columns the write path already recomputes on the next save.
 *
 * Run (against a configured DATABASE_URL) with tsx, e.g.
 * `tsx prisma/backfill/backfill-ontology-native.ts`. This script is not wired
 * into `prisma migrate`; run it once after deploying the re-model.
 *
 * @module
 */

import { PrismaClient } from '@prisma/client'

import {
  ontologyToLayers,
  emptyOntology,
  type PersonaOntologyAggregate,
} from '../../src/services/ontology-layers-mapper.js'
import { writeGlossStandoff } from '../../src/services/layers-bridge/ontology-bridge.js'
import { toJson } from '../../src/services/layers-bridge/util.js'

/** The legacy stash a TypeDef's `features.foveaOntology` carried. */
interface OntologyStash {
  bucket: keyof PersonaOntologyAggregate
  index: number
  object: Record<string, unknown>
}

/** Extracts the legacy ontology stash from a TypeDef's features, or null. */
function readStash(features: unknown): OntologyStash | null {
  if (features === null || typeof features !== 'object') return null
  const marker = (features as Record<string, unknown>).foveaOntology
  if (marker === null || typeof marker !== 'object') return null
  const record = marker as Record<string, unknown>
  const bucket = record.bucket
  if (
    (bucket !== 'entityTypes' &&
      bucket !== 'eventTypes' &&
      bucket !== 'roleTypes' &&
      bucket !== 'relationTypes') ||
    typeof record.index !== 'number' ||
    record.object === null ||
    typeof record.object !== 'object'
  ) {
    return null
  }
  return { bucket, index: record.index, object: record.object as Record<string, unknown> }
}

/**
 * Backfills every persona ontology whose TypeDefs still carry the legacy stash.
 *
 * @param prisma - the Prisma client
 * @returns the number of TypeDefs migrated
 */
export async function backfillOntologyNative(prisma: PrismaClient): Promise<number> {
  const ontologies = await prisma.layersOntology.findMany({ where: { personaId: { not: null } } })
  let migrated = 0

  for (const ontology of ontologies) {
    const personaId = ontology.personaId
    if (!personaId) continue

    const typeDefs = await prisma.typeDef.findMany({ where: { ontologyId: ontology.id } })

    // Reconstruct the legacy aggregate from the stashes, preserving bucket order.
    const staged: Record<keyof PersonaOntologyAggregate, Array<{ index: number; object: Record<string, unknown> }>> = {
      entityTypes: [],
      eventTypes: [],
      roleTypes: [],
      relationTypes: [],
    }
    const rowByOriginalId = new Map<string, string>()
    for (const typeDef of typeDefs) {
      const stash = readStash(typeDef.features)
      if (!stash) continue
      staged[stash.bucket].push({ index: stash.index, object: stash.object })
      const originalId = typeof stash.object.id === 'string' ? stash.object.id : typeDef.id
      rowByOriginalId.set(originalId, typeDef.id)
    }
    if (rowByOriginalId.size === 0) continue

    const aggregate = emptyOntology()
    for (const bucket of Object.keys(staged) as (keyof PersonaOntologyAggregate)[]) {
      aggregate[bucket] = staged[bucket].sort((a, b) => a.index - b.index).map((entry) => entry.object)
    }

    const scope = { projectId: ontology.projectId, createdByUserId: ontology.createdByUserId }
    const meta = { name: ontology.name, description: ontology.description, domain: ontology.domain }
    const { typeDefs: mapped } = ontologyToLayers(aggregate, personaId, meta, scope)

    for (const type of mapped) {
      const rowId = rowByOriginalId.get(type.id)
      if (!rowId) continue
      await prisma.typeDef.update({
        where: { id: rowId },
        data: {
          gloss: type.gloss,
          allowedRoles: toJson(type.allowedRoles) ?? undefined,
          allowedValues: toJson(type.allowedValues) ?? undefined,
          knowledgeRefs: toJson(type.knowledgeRefs) ?? undefined,
          // The features column now holds only flat scalars; the foveaOntology
          // stash is dropped by overwriting the whole column.
          features: toJson(type.features) ?? undefined,
        },
      })
      await writeGlossStandoff(prisma, rowId, type.glossItems, ontology.id, personaId, scope)
      migrated += 1
    }
  }

  return migrated
}

/** Runs the backfill against the configured DATABASE_URL. */
async function main(): Promise<void> {
  const prisma = new PrismaClient()
  try {
    const migrated = await backfillOntologyNative(prisma)
    process.stdout.write(`Backfilled ${migrated} ontology type definitions to the native representation.\n`)
  } finally {
    await prisma.$disconnect()
  }
}

// Run when executed directly; skip when imported by tests (which set VITEST /
// NODE_ENV=test), mirroring prisma/seed.ts.
const isTestEnvironment = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'
if (!isTestEnvironment) {
  main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`)
    process.exitCode = 1
  })
}
