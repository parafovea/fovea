import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { Panproto } from '@panproto/core'
import type { BuiltSchema } from '@panproto/core'
import { z } from 'zod'

/**
 * Loads the schemas the FOVEA<->layers lenses map between: the `pub.layers.*`
 * records as their vendored ATProto lexicons, and each FOVEA view-model as a
 * JSON Schema emitted from its Zod definition. Both sides parse into panproto
 * `BuiltSchema`s over one graph format, so a lens is a schema morphism between
 * them.
 *
 * ATProto is the wire format for the layers records that live on a PDS; the
 * FOVEA view-models never leave the server, so they stay JSON Schema. panproto
 * is the single engine for both loading and the mapping.
 */

const require = createRequire(import.meta.url)

/** Absolute path to the vendored `pub.layers.*` lexicon tree. */
const LEXICON_DIR = join(dirname(require.resolve('@fovea/layers-schema/package.json')), 'lexicons', 'pub', 'layers')

let panprotoPromise: Promise<Panproto> | null = null

/** The initialized panproto instance, loaded once per process. */
export function getPanproto(): Promise<Panproto> {
  panprotoPromise ??= Panproto.init()
  return panprotoPromise
}

/** Reads a vendored lexicon document by its path under `pub/layers/`. */
function readLexicon(relativePath: string): object {
  return JSON.parse(readFileSync(join(LEXICON_DIR, relativePath), 'utf8')) as object
}

const layersSchemaCache = new Map<string, BuiltSchema>()

/**
 * Loads a `pub.layers.*` record as a `BuiltSchema` with its cross-file `$ref`s
 * resolved. `recordLexicon` names the record document; `defLexicons` names the
 * `defs` documents whose fragments it references. Cached by the record path.
 *
 * @param recordLexicon - path under `pub/layers/` of the record document (e.g. `annotation/annotationLayer.json`)
 * @param defLexicons - paths of the `defs` documents the record's `$ref`s resolve into
 * @returns the loaded record schema
 */
export async function loadLayersSchema(recordLexicon: string, defLexicons: readonly string[]): Promise<BuiltSchema> {
  const cached = layersSchemaCache.get(recordLexicon)
  if (cached) return cached
  const p = await getPanproto()
  const schema = p.parseSchemaBundle('atproto', [readLexicon(recordLexicon), ...defLexicons.map(readLexicon)])
  layersSchemaCache.set(recordLexicon, schema)
  return schema
}

/**
 * Builds a `BuiltSchema` for a FOVEA view-model from its Zod definition, via the
 * JSON Schema panproto loads directly. The Zod schema is the single definition
 * of the view-model shape; this projects it into the graph format so a lens can
 * bind to it.
 *
 * @param source - the Zod schema describing the view-model
 * @returns the loaded source schema
 */
export async function loadFoveaSchema(source: z.ZodType): Promise<BuiltSchema> {
  const p = await getPanproto()
  return p.parseSchemaDocument('json-schema', z.toJSONSchema(source))
}
