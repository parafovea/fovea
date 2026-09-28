// Extract the `components.schemas` map from the vendored OpenAPI document into a
// standalone JSON Schema components file. Each schema is rewritten with an `$id`
// of `layers:<Name>` and internal `#/components/schemas/<Name>` refs are
// rewritten to `layers:<Name>` so the set can be registered directly with
// Fastify's `app.addSchema` and cross-referenced by `$ref`.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const jsonSchemaDir = join(here, '..', 'json-schema')

const openapi = JSON.parse(readFileSync(join(jsonSchemaDir, 'openapi.json'), 'utf8'))
const schemas = openapi.components?.schemas ?? {}

const rewriteRefs = (node) => {
  if (Array.isArray(node)) return node.map(rewriteRefs)
  if (node && typeof node === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string') {
        const m = v.match(/^#\/components\/schemas\/(.+)$/)
        out[k] = m ? `layers:${m[1]}` : v
      } else {
        out[k] = rewriteRefs(v)
      }
    }
    return out
  }
  return node
}

const components = {}
for (const [name, schema] of Object.entries(schemas)) {
  components[name] = { $id: `layers:${name}`, ...rewriteRefs(schema) }
}

writeFileSync(
  join(jsonSchemaDir, 'components.json'),
  JSON.stringify(components, null, 2) + '\n'
)
console.log(`Wrote ${Object.keys(components).length} JSON Schema components.`)
