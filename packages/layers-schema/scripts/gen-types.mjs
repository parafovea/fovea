#!/usr/bin/env node
// Generates the `pub.layers.*` TypeScript types under `src/generated/` directly
// from the vendored atproto lexicons under `lexicons/pub/layers/`, so the
// lexicons stay the single source of truth and regeneration needs no Rust
// toolchain. The emitted layout, naming, and formatting reproduce the output of
// the upstream `idiolect-codegen` / `layers-codegen` pipeline byte-for-byte.
//
// Usage: node scripts/gen-types.mjs [--lexicons <dir>] [--out <dir>]
//   --lexicons  root of the vendored `pub/layers` tree (default: ../lexicons/pub/layers)
//   --out       destination for the generated tree (default: ../src/generated)

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--lexicons') out.lexicons = argv[++i]
    else if (argv[i] === '--out') out.out = argv[++i]
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const LEX_ROOT = args.lexicons ?? join(PKG_ROOT, 'lexicons', 'pub', 'layers')
const OUT_DIR = args.out ?? join(PKG_ROOT, 'src', 'generated')

const FAMILY_ID = 'pub.layers'
const FAMILY_NSID_PREFIX = 'pub.layers.'
const FAMILY_MARKER = 'LayersFamily'

// --------------------------------------------------------------------------
// Naming primitives
// --------------------------------------------------------------------------

/** camelCase / kebab / spaced -> snake_case, lowercasing interior capitals. */
function toSnake(s) {
  let out = ''
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i]
    if (c >= 'A' && c <= 'Z') out += (i > 0 ? '_' : '') + c.toLowerCase()
    else if (c === '-' || c === ' ') out += '_'
    else out += c
  }
  return out
}

/** Uppercase segment starts (split on -,_,space); preserve interior capitals. */
function pascalCase(s) {
  let out = ''
  let upperNext = true
  for (const c of s) {
    if (c === '-' || c === '_' || c === ' ') upperNext = true
    else if (upperNext) {
      out += c.toUpperCase()
      upperNext = false
    } else out += c
  }
  return out
}

/** Lowercase only the first character. */
function camelCase(s) {
  return s.length ? s[0].toLowerCase() + s.slice(1) : s
}

/** nsid -> path segments (snake per segment). */
function modulePathForNsid(nsid) {
  return nsid.split('.').filter(Boolean).map(toSnake)
}

/** nsid -> module base name (bare snake leaf for pub.layers). */
function moduleNameForNsid(nsid) {
  const segs = nsid.split('.').filter(Boolean)
  const leaf = segs[segs.length - 1]
  if (nsid.startsWith('dev.idiolect.')) return toSnake(leaf)
  const m = /^dev\.([^.]+)\./.exec(nsid)
  if (m && m[1] !== 'idiolect') return `${m[1]}_${toSnake(leaf)}`
  return toSnake(leaf)
}

/** "#foo" | "com.x.y#foo" | "com.x.y" -> { nsid, def }. */
function resolveRef(currentNsid, raw) {
  if (raw.startsWith('#')) return { nsid: currentNsid, def: raw.slice(1) }
  const hash = raw.indexOf('#')
  if (hash === -1) return { nsid: raw, def: 'main' }
  return { nsid: raw.slice(0, hash), def: raw.slice(hash + 1) }
}

/** Relative import spec (stage 1); the emitted `from` is `"./" + spec`. */
function relativeTsImport(fromNsid, toNsid) {
  const from = modulePathForNsid(fromNsid)
  const to = modulePathForNsid(toNsid)
  const fromDir = from.slice(0, -1)
  const toDir = to.slice(0, -1)
  const toLeaf = to[to.length - 1]
  let common = 0
  while (common < fromDir.length && common < toDir.length && fromDir[common] === toDir[common]) common += 1
  const ups = fromDir.length - common
  const downs = toDir.slice(common)
  const prefix = ups === 0 ? './' : '../'.repeat(ups)
  return prefix + downs.map((s) => `${s}/`).join('') + toLeaf
}

// --------------------------------------------------------------------------
// JSDoc / small emitters
// --------------------------------------------------------------------------

/** oxc-style JSDoc lines (indent spaces, then `* `, no leading space before `*`). */
function jsdoc(desc, indent) {
  if (!desc) return []
  const pad = ' '.repeat(indent)
  const lines = [`${pad}/**`]
  for (const line of String(desc).split('\n')) lines.push(`${pad}* ${line}`)
  lines.push(`${pad}*/`)
  return lines
}

/** A string-literal union alias; `open` adds the ` | string & {}` arm. */
function enumAlias(name, values, open, desc) {
  const arms = values.map((v) => JSON.stringify(v)).join(' | ')
  const decl = `export type ${name} = ${arms}${open ? ' | string & {}' : ''};`
  return desc ? [...jsdoc(desc, 0), decl].join('\n') : decl
}

// --------------------------------------------------------------------------
// Type rendering
// --------------------------------------------------------------------------

function addImport(ctx, toNsid, name) {
  const spec = relativeTsImport(ctx.currentNsid, toNsid)
  if (!ctx.imports.has(spec)) ctx.imports.set(spec, new Set())
  ctx.imports.get(spec).add(name)
}

/** A `$type`-discriminated union alias over `refs`. */
function unionAlias(name, refs, ctx, desc) {
  const arms = refs.map((ref) => {
    const r = resolveRef(ctx.currentNsid, ref)
    const tn = pascalCase(r.def)
    if (r.nsid !== ctx.currentNsid) addImport(ctx, r.nsid, tn)
    return `{\n  $type: "${r.nsid}#${r.def}";\n} & ${tn}`
  })
  const decl = `export type ${name} = ${arms.join(' | ')};`
  return desc ? [...jsdoc(desc, 0), decl].join('\n') : decl
}

/**
 * Renders a lexicon field/items node to a TS type. Returns `{ type }` and, when
 * the node is an inline enum/union/object, an `inline` sibling declaration to
 * hoist (`category`: union 0, enum 1, object 2).
 */
function renderType(node, parentName, fieldName, ctx) {
  switch (node.type) {
    case 'string': {
      if (Array.isArray(node.enum)) {
        const name = parentName + pascalCase(fieldName)
        return { type: name, inline: { category: 1, text: enumAlias(name, node.enum, false, null), nested: [] } }
      }
      if (Array.isArray(node.knownValues)) {
        const name = parentName + pascalCase(fieldName)
        return { type: name, inline: { category: 1, text: enumAlias(name, node.knownValues, true, null), nested: [] } }
      }
      return { type: 'string' }
    }
    case 'integer':
    case 'number':
      return { type: 'number' }
    case 'boolean':
      return { type: 'boolean' }
    case 'cid-link':
      return { type: 'string' }
    case 'bytes':
    case 'blob':
    case 'unknown':
      return { type: 'unknown' }
    case 'ref': {
      const r = resolveRef(ctx.currentNsid, node.ref)
      const name = pascalCase(r.def)
      if (r.nsid !== ctx.currentNsid) addImport(ctx, r.nsid, name)
      return { type: name }
    }
    case 'array': {
      const inner = renderType(node.items, parentName, fieldName, ctx)
      return { type: `${inner.type}[]`, inline: inner.inline }
    }
    case 'union': {
      const name = parentName + pascalCase(fieldName)
      return { type: name, inline: { category: 0, text: unionAlias(name, node.refs, ctx, null), nested: [] } }
    }
    case 'object': {
      const name = parentName + pascalCase(fieldName)
      const built = buildInterface(name, node.properties || {}, node.required || [], node.description, ctx)
      return { type: name, inline: { category: 2, text: built.interfaceText, nested: built.orderedInlineTexts } }
    }
    default:
      return { type: 'unknown' }
  }
}

/**
 * Builds an interface declaration and the ordered list of inline sibling
 * declarations it hoists. Fields sort alphabetically by original name; inlines
 * sort by category then original field name, each object inline followed by its
 * own nested inlines.
 */
function buildInterface(typeName, properties, required, description, ctx) {
  const reqSet = new Set(required || [])
  const propNames = Object.keys(properties).sort()
  const fieldLines = []
  const localInlines = []
  for (const origName of propNames) {
    const prop = properties[origName]
    const rt = renderType(prop, typeName, origName, ctx)
    for (const l of jsdoc(prop.description, 2)) fieldLines.push(l)
    const opt = reqSet.has(origName) ? '' : '?'
    fieldLines.push(`  ${camelCase(origName)}${opt}: ${rt.type};`)
    if (rt.inline) localInlines.push({ ...rt.inline, sortKey: origName })
  }
  localInlines.sort((a, b) => a.category - b.category || (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0))
  const orderedInlineTexts = []
  for (const il of localInlines) {
    orderedInlineTexts.push(il.text)
    orderedInlineTexts.push(...il.nested)
  }
  const interfaceText = [...jsdoc(description, 0), `export interface ${typeName} {`, ...fieldLines, '}'].join('\n')
  return { interfaceText, orderedInlineTexts }
}

// --------------------------------------------------------------------------
// Emit predicate
// --------------------------------------------------------------------------

const LEAF_TYPES = new Set([
  'string', 'integer', 'boolean', 'number', 'cid-link', 'bytes', 'blob', 'unknown', 'ref', 'array', 'union', 'object',
])

/** Whether a property/items node is a supported shape (recursively). */
function nodeSupported(node) {
  if (!node || typeof node !== 'object' || !LEAF_TYPES.has(node.type)) return false
  if (node.type === 'array') return nodeSupported(node.items)
  if (node.type === 'union') return Array.isArray(node.refs)
  if (node.type === 'object') {
    const props = node.properties || {}
    return Object.values(props).every(nodeSupported)
  }
  return true
}

/** Whether a top-level def is a supported shape. */
function defSupported(def) {
  if (!def || typeof def !== 'object') return false
  switch (def.type) {
    case 'record':
      return def.record && typeof def.record === 'object' && Object.values(def.record.properties || {}).every(nodeSupported)
    case 'object':
      return Object.values(def.properties || {}).every(nodeSupported)
    case 'string':
      return Array.isArray(def.enum)
    case 'union':
      return Array.isArray(def.refs)
    default:
      return false
  }
}

/** Whether a whole lexicon file emits (all-or-nothing over its defs). */
function fileEmits(doc) {
  if (typeof doc.id !== 'string' || !doc.defs || typeof doc.defs !== 'object') return false
  const main = doc.defs.main
  if (main && main.type !== 'record') return false
  return Object.values(doc.defs).every(defSupported)
}

// --------------------------------------------------------------------------
// Per-lexicon file
// --------------------------------------------------------------------------

function renderImports(ctx) {
  if (ctx.imports.size === 0) return null
  return [...ctx.imports.keys()]
    .sort()
    .map((spec) => `import type { ${[...ctx.imports.get(spec)].sort().join(', ')} } from "./${spec}";`)
    .join('\n')
}

/** Emits one module file for a lexicon doc. Returns { relPath, content }. */
function emitLexiconFile(doc) {
  const nsid = doc.id
  const ctx = { currentNsid: nsid, imports: new Map() }
  const defs = doc.defs
  const decls = []
  let mainInlines = []

  if (defs.main && defs.main.type === 'record') {
    const rec = defs.main.record || {}
    const built = buildInterface(
      pascalCase(moduleNameForNsid(nsid)),
      rec.properties || {},
      rec.required || [],
      defs.main.description,
      ctx,
    )
    decls.push(built.interfaceText)
    mainInlines = built.orderedInlineTexts
  }

  const nonMainInlines = []
  for (const defName of Object.keys(defs).filter((n) => n !== 'main').sort()) {
    const def = defs[defName]
    if (def.type === 'object') {
      const built = buildInterface(pascalCase(defName), def.properties || {}, def.required || [], def.description, ctx)
      decls.push(built.interfaceText)
      nonMainInlines.push(...built.orderedInlineTexts)
    } else if (def.type === 'string' && Array.isArray(def.enum)) {
      decls.push(enumAlias(pascalCase(defName), def.enum, false, def.description))
    } else if (def.type === 'union') {
      decls.push(unionAlias(pascalCase(defName), def.refs, ctx, def.description))
    }
    // non-main `record` defs emit nothing
  }
  decls.push(...nonMainInlines, ...mainInlines)

  const lines = ['// @generated by idiolect-codegen. do not edit.', `// source: ${nsid}`, '']
  const importBlock = renderImports(ctx)
  if (importBlock) lines.push(importBlock, '')
  if (doc.description) lines.push(`// ${doc.description}`, '')
  lines.push(decls.join('\n\n'))
  return { relPath: `${modulePathForNsid(nsid).join('/')}.ts`, content: `${lines.join('\n')}\n` }
}

// --------------------------------------------------------------------------
// Barrels + root index
// --------------------------------------------------------------------------

const ROOT_INDEX_BANNER = [
  '// @generated by idiolect-codegen. do not edit.',
  '',
  '// TypeScript types generated from the `dev.idiolect.*` lexicons plus the vendored',
  '// `dev.panproto.*` tree (see `lexicons/dev/panproto/VENDORED.md`).',
  '//',
  '// The on-disk layout mirrors the lexicon directory tree under',
  '// `lexicons/`: a per-directory `index.ts` re-exports its',
  '// immediate children. Top-level barrel below points at every',
  '// first-segment directory plus the cross-cutting fixtures and',
  '// record helpers.',
]

const EXAMPLES_STUB = [
  '// @generated by idiolect-codegen. do not edit.',
  '',
  '// Minimally-valid fixture records, surfaced from `lexicons/dev/*/examples/`.',
  '// Each `*Json` const is the raw json fixture string.',
  '',
].join('\n')

/** Barrel + root-index files derived from the emitted module rel-paths. */
function emitBarrels(moduleRelPaths) {
  const dirs = new Map()
  const ensure = (d) => {
    if (!dirs.has(d)) dirs.set(d, { subdirs: new Set(), leaves: new Set() })
    return dirs.get(d)
  }
  ensure('')
  for (const relPath of moduleRelPaths) {
    const segs = relPath.replace(/\.ts$/, '').split('/')
    const leaf = segs[segs.length - 1]
    const dirSegs = segs.slice(0, -1)
    ensure(dirSegs.join('/')).leaves.add(leaf)
    for (let i = 0; i < dirSegs.length; i += 1) {
      ensure(dirSegs.slice(0, i).join('/')).subdirs.add(dirSegs[i])
    }
  }

  const files = []
  for (const [dir, { subdirs, leaves }] of dirs) {
    if (dir === '') {
      const firstSegs = [...subdirs].sort()
      const body = [
        ...firstSegs.map((s) => `export * from "./${s}/index";`),
        'export * from "./examples";',
        'export * from "./family";',
      ]
      files.push({ relPath: 'index.ts', content: `${[...ROOT_INDEX_BANNER, '', ...body].join('\n')}\n` })
      continue
    }
    const body = [
      ...[...subdirs].sort().map((s) => `export * from "./${s}/index";`),
      ...[...leaves].sort().map((l) => `export * from "./${l}";`),
    ]
    files.push({
      relPath: `${dir}/index.ts`,
      content: `${['// @generated by idiolect-codegen. do not edit.', '', ...body].join('\n')}\n`,
    })
  }
  return files
}

// --------------------------------------------------------------------------
// family.ts
// --------------------------------------------------------------------------

/** Assigns family members their disambiguated alias/key/guard (collision walk-up). */
function familyMembers(recordDocs) {
  const members = recordDocs
    .filter((d) => d.id.startsWith(FAMILY_NSID_PREFIX))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((d) => {
      const nsid = d.id
      const segs = nsid.split('.').filter(Boolean)
      const rawType = pascalCase(moduleNameForNsid(nsid))
      return { nsid, segs, rawType, importPath: `./${modulePathForNsid(nsid).join('/')}` }
    })

  // Group by bare rawType; colliding groups walk up parent segments minimally.
  const byRaw = new Map()
  for (const m of members) {
    if (!byRaw.has(m.rawType)) byRaw.set(m.rawType, [])
    byRaw.get(m.rawType).push(m)
  }
  for (const group of byRaw.values()) {
    if (group.length === 1) {
      const m = group[0]
      m.alias = m.rawType
      m.key = moduleNameForNsid(m.nsid)
      m.disambiguated = false
      continue
    }
    let k = 1
    for (;;) {
      const aliases = group.map((m) => pascalCase(m.segs.slice(m.segs.length - 1 - k).map(toSnake).join('_')))
      if (new Set(aliases).size === aliases.length) {
        group.forEach((m, i) => {
          m.alias = aliases[i]
          m.key = camelCase(aliases[i])
          m.disambiguated = true
        })
        break
      }
      k += 1
    }
  }
  for (const m of members) m.guard = `is${m.alias}`
  return members
}

function emitFamily(recordDocs) {
  const members = familyMembers(recordDocs)
  const L = []
  L.push('// @generated by idiolect-codegen. do not edit.', '')
  L.push('// Generated record family for `pub.layers`.')
  L.push('//')
  L.push('// Per-record types come from the sibling generated modules. This file')
  L.push('// emits the discriminated-union view, the dispatch helpers, and the')
  L.push('// family identity (`FAMILY_ID`, `FAMILY_NSID_PREFIX`, `FamilyMarker`)')
  L.push('// that mirror the Rust `family.rs` surface.', '')
  for (const m of members) {
    const spec = m.disambiguated ? `${m.rawType} as ${m.alias}` : m.rawType
    L.push(`import type { ${spec} } from "${m.importPath}";`)
  }
  L.push('')
  L.push('/** Family identifier, mirrored from the Rust `RecordFamily::ID` constant. */')
  L.push(`export const FAMILY_ID = "${FAMILY_ID}" as const;`, '')
  L.push('/** NSID prefix every member of this family shares. Informational. */')
  L.push(`export const FAMILY_NSID_PREFIX = "${FAMILY_NSID_PREFIX}" as const;`, '')
  L.push('/** Nominal marker for the family, mirrored from the Rust `LayersFamily` struct. */')
  L.push(`export type FamilyMarker = "${FAMILY_MARKER}";`, '')
  L.push('/**', ' * Canonical NSIDs, keyed by record kind for ergonomic call sites.', ' */')
  L.push('export const NSID = {')
  for (const m of members) L.push(`  ${m.key}: "${m.nsid}",`)
  L.push('} as const;', '')
  L.push('export type NSID = (typeof NSID)[keyof typeof NSID];', '')
  L.push('/**', ' * Mapping from record NSID to its TypeScript record type.', ' */')
  L.push('export type RecordTypes = {')
  for (const m of members) L.push(`  [NSID.${m.key}]: ${m.alias};`)
  L.push('};', '')
  L.push('/**', ' * Discriminated union tagged by `$nsid` for runtime dispatch.', ' */')
  L.push('export type AnyRecord =')
  members.forEach((m, i) => {
    const tail = i === members.length - 1 ? ';' : ''
    L.push(`  | { readonly $nsid: typeof NSID.${m.key}; readonly value: ${m.alias} }${tail}`)
  })
  L.push('')
  L.push('/** True if `r` is an `AnyRecord` tagged with the given nsid. */')
  L.push('export function isKind<K extends NSID>(')
  L.push('  r: AnyRecord,')
  L.push('  nsid: K,')
  L.push('): r is Extract<AnyRecord, { $nsid: K }> {')
  L.push('  return r.$nsid === nsid;')
  L.push('}', '')
  members.forEach((m) => {
    L.push(`/** True if \`r\` wraps a \`${m.alias}\`. */`)
    L.push(
      `export function ${m.guard}(r: AnyRecord): r is { readonly $nsid: typeof NSID.${m.key}; readonly value: ${m.alias} } {`,
    )
    L.push(`  return r.$nsid === NSID.${m.key};`)
    L.push('}', '')
  })
  L.push('/**', ' * Wrap a strongly-typed record in its `AnyRecord` variant.', ' */')
  L.push('export function tagRecord<K extends NSID>(')
  L.push('  nsid: K,')
  L.push('  value: RecordTypes[K],')
  L.push('): AnyRecord {')
  L.push('  return { $nsid: nsid, value } as AnyRecord;')
  L.push('}', '')
  L.push('/** All record NSIDs in declaration order. */')
  L.push('export const RECORD_NSIDS = [')
  for (const m of members) L.push(`  NSID.${m.key},`)
  L.push('] as const satisfies readonly NSID[];', '')
  L.push('const FAMILY_NSID_SET: ReadonlySet<string> = new Set(RECORD_NSIDS);', '')
  L.push('/**')
  L.push(' * True if `nsid` is a member of this family — exact match against')
  L.push(" * the family's record set. Mirrors the Rust `RecordFamily::contains`")
  L.push(' * predicate; the type narrowing to `NSID` is sound because the')
  L.push(' * runtime check tests against the same literal set the type encodes.')
  L.push(' */')
  L.push('export function familyContains(nsid: string): nsid is NSID {')
  L.push('  return FAMILY_NSID_SET.has(nsid);')
  L.push('}', '')
  L.push('/**')
  L.push(' * Loose decoded view: family NSID and an unvalidated record body.')
  L.push(' * `decodeRecord` produces this; callers pair it with a per-record')
  L.push(' * validator (Zod, io-ts, hand-rolled) before treating the body as')
  L.push(' * any specific record type.')
  L.push(' */')
  L.push('export interface DecodedRecord {')
  L.push('  readonly $nsid: NSID;')
  L.push('  readonly body: unknown;')
  L.push('}', '')
  L.push('/**')
  L.push(' * Split an atproto wire-form record (an object whose `$type` field')
  L.push(' * carries the NSID of the contained record) into a (`$nsid`, body)')
  L.push(' * pair. Mirrors the Rust `AnyRecord::from_typed_json` constructor in')
  L.push(' * shape, but TypeScript has no runtime structural validator for the')
  L.push(' * generated record types, so the body comes back as `unknown` and')
  L.push(' * the caller is responsible for narrowing it.')
  L.push(' *')
  L.push(' * Returns `null` if `value` is not structurally a record object or')
  L.push(' * its `$type` is outside this family.')
  L.push(' */')
  L.push('export function decodeRecord(value: unknown): DecodedRecord | null {')
  L.push('  if (typeof value !== "object" || value === null || Array.isArray(value)) {')
  L.push('    return null;')
  L.push('  }')
  L.push('  const obj = value as Record<string, unknown>;')
  L.push('  const ty = obj["$type"];')
  L.push('  if (typeof ty !== "string" || !familyContains(ty)) return null;')
  L.push('  const { $type: _stripped, ...body } = obj;')
  L.push('  return { $nsid: ty, body };')
  L.push('}', '')
  L.push('/**')
  L.push(' * Encode an `AnyRecord` into atproto wire form: the inner `value`')
  L.push(' * spread with a `$type` discriminator. Mirrors the Rust')
  L.push(' * `AnyRecord::to_typed_json` method.')
  L.push(' */')
  L.push('export function toTypedJson(r: AnyRecord): Record<string, unknown> {')
  L.push('  return { ...r.value, $type: r.$nsid } as Record<string, unknown>;')
  L.push('}')
  return `${L.join('\n')}\n`
}

// --------------------------------------------------------------------------
// Driver
// --------------------------------------------------------------------------

/** All `*.json` under a directory, recursively, sorted lexicographically. */
function findJson(root) {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.json')) out.push(full)
    }
  }
  walk(root)
  return out.sort()
}

function main() {
  const docs = findJson(LEX_ROOT).map((p) => JSON.parse(readFileSync(p, 'utf8')))
  const emitDocs = docs.filter(fileEmits)
  const recordDocs = emitDocs.filter((d) => d.defs.main && d.defs.main.type === 'record')

  const files = emitDocs.map(emitLexiconFile)
  files.push(...emitBarrels(files.map((f) => f.relPath)))
  files.push({ relPath: 'family.ts', content: emitFamily(recordDocs) })
  files.push({ relPath: 'examples.ts', content: `${EXAMPLES_STUB}\n` })

  rmSync(OUT_DIR, { recursive: true, force: true })
  for (const { relPath, content } of files) {
    const dest = join(OUT_DIR, relPath)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, content)
  }
  process.stdout.write(`generated ${files.length} files into ${OUT_DIR}\n`)
}

main()
