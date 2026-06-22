/**
 * Emits the OpenAPI 3.x specification to `server/openapi.json`.
 *
 * The Fastify app already registers `@fastify/swagger`; this builds the app,
 * waits for every route (and its TypeBox schema) to register, then writes the
 * generated spec to disk. That committed `openapi.json` is the single source
 * the frontend (`openapi-typescript`) and the model-service Pydantic drift
 * check generate from, so the cross-service contract is authored once.
 *
 * Run with `pnpm --filter @fovea/server gen:openapi`. `buildApp()` eagerly
 * connects to Redis and Postgres (it imports the queue setup), so the env must
 * point at reachable infra. The script seeds the minimal required env when
 * unset, but real runs supply `DATABASE_URL` / `REDIS_HOST` / `REDIS_PORT`
 * (the e2e stack is the convenient local target).
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

process.env.NODE_ENV ??= 'production'
process.env.SESSION_SECRET ??= 'openapi-dump-session-secret-min-32-chars!!'
process.env.DATABASE_URL ??= 'postgresql://user:password@localhost:5432/fovea?schema=public'

const { buildApp } = await import('../src/app.js')

/**
 * Materialize component schemas that `@fastify/swagger` references via `$ref`
 * but never registers under `components.schemas`.
 *
 * TypeBox `Type.Recursive` (used by the recursive claim/subclaims schema) emits
 * a self-referential definition. `@fastify/swagger` inlines the definition at
 * every use site but rewrites the inner self-reference to
 * `#/components/schemas/def-N` without populating that entry, leaving a dangling
 * `$ref` that standard OpenAPI consumers (openapi-typescript) reject. The fix
 * walks the spec, finds each dangling component ref, locates an inlined object
 * node that recursively references it, and registers a copy of that node under
 * `components.schemas`. The route schemas are left untouched.
 *
 * @param spec - the OpenAPI document emitted by `app.swagger()`
 */
function resolveDanglingComponentRefs(spec: Record<string, unknown>): void {
  const components = (spec.components ??= {}) as Record<string, unknown>
  const schemas = (components.schemas ??= {}) as Record<string, unknown>

  const refPrefix = '#/components/schemas/'
  const referenced = new Set<string>()
  collectRefs(spec, referenced)

  for (const ref of referenced) {
    if (!ref.startsWith(refPrefix)) continue
    const name = ref.slice(refPrefix.length)
    if (name in schemas) continue
    const definition = findSelfReferencingNode(spec, ref)
    if (!definition) {
      throw new Error(
        `OpenAPI spec references ${ref} but no inlined definition for it was found; ` +
          'the recursive-schema repair in dump-openapi.ts needs updating.',
      )
    }
    schemas[name] = definition
  }
}

/**
 * Collect every `$ref` string value reachable in the spec.
 *
 * @param node - current node in the recursive walk
 * @param out - accumulator set of ref strings
 */
function collectRefs(node: unknown, out: Set<string>): void {
  if (node === null || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' && typeof value === 'string') {
      out.add(value)
    } else {
      collectRefs(value, out)
    }
  }
}

/**
 * Find the inlined object node that is the body of the recursive definition
 * `ref` names: the node that, somewhere in one of its own array-typed
 * properties, references `ref` directly (the `subclaims: Array(This)` cycle).
 *
 * Matching on a direct property self-reference (rather than any descendant
 * reference) avoids capturing a wrapping schema or a containing array, so the
 * registered component is exactly the recursive shape.
 *
 * @param spec - the OpenAPI document to search
 * @param ref - the component ref to resolve (e.g. `#/components/schemas/def-0`)
 * @returns a deep copy of the matching node, or null when none is found
 */
function findSelfReferencingNode(
  spec: Record<string, unknown>,
  ref: string,
): Record<string, unknown> | null {
  let found: Record<string, unknown> | null = null
  const visit = (node: unknown): void => {
    if (found || node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }
    const record = node as Record<string, unknown>
    if (!('$ref' in record) && hasDirectPropertySelfReference(record, ref)) {
      found = structuredClone(record)
      return
    }
    for (const value of Object.values(record)) visit(value)
  }
  visit(spec)
  return found
}

/**
 * Report whether `node` is an object schema one of whose properties is an
 * array whose `items` is exactly `{ $ref: ref }` (the recursive self-link).
 *
 * @param node - candidate object-schema node
 * @param ref - the ref string identifying the recursion
 * @returns true when the node directly recurses on `ref`
 */
function hasDirectPropertySelfReference(
  node: Record<string, unknown>,
  ref: string,
): boolean {
  if (node.type !== 'object' || typeof node.properties !== 'object' || node.properties === null) {
    return false
  }
  for (const property of Object.values(node.properties as Record<string, unknown>)) {
    if (property === null || typeof property !== 'object') continue
    const items = (property as Record<string, unknown>).items
    if (items && typeof items === 'object' && (items as Record<string, unknown>).$ref === ref) {
      return true
    }
  }
  return false
}

const app = await buildApp()
await app.ready()
const spec = app.swagger() as Record<string, unknown>
resolveDanglingComponentRefs(spec)
const outPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'openapi.json')
writeFileSync(outPath, JSON.stringify(spec, null, 2) + '\n')
await app.close()
console.log(`Wrote OpenAPI spec to ${outPath}`)
