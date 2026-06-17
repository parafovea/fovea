#!/usr/bin/env node
/**
 * Configuration drift guard for `.env.example`.
 *
 * Enforces two invariants so the committed environment template cannot
 * silently diverge from what the code actually reads:
 *
 *   1. `.env.example` declares no key twice. Duplicate dotenv keys are
 *      silently last-wins, which previously hid a real foot-gun.
 *   2. Every environment variable the backend config module reads through
 *      its declarative `readString`/`readInt`/`readBoolean*` helpers
 *      (`server/src/config.ts`) is present in `.env.example`. Adding a new
 *      backend config key without documenting it in the template now fails
 *      CI rather than shipping an under-specified template.
 *
 * The dynamic reads in `config.ts` (the `MODEL_SERVICE_TIMEOUT_<NAME>_MS`
 * family and the `<PROVIDER>_API_KEY` lookup) are intentionally not part of
 * invariant 2 because they are optional and not enumerable as literals.
 *
 * Run via `pnpm check:env` (or directly with node). Exits non-zero on any
 * violation with a precise, actionable message.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const envExamplePath = join(repoRoot, '.env.example')
const configPath = join(repoRoot, 'server', 'src', 'config.ts')

/**
 * Parse `.env.example` keys.
 *
 * Returns the active keys (uncommented `KEY=` lines, in order, for the
 * duplicate check) and the documented keys (active plus commented
 * `# KEY=` lines, for the coverage check). A commented entry is treated
 * as documentation: optional vars like the S3/CDN block are intentionally
 * shipped commented-out, and that still tells an operator the key exists.
 */
function parseEnvKeys(text) {
  const active = []
  const documented = new Set()
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line === '') continue
    const activeMatch = /^([A-Z_][A-Z0-9_]*)=/.exec(line)
    if (activeMatch) {
      active.push(activeMatch[1])
      documented.add(activeMatch[1])
      continue
    }
    const commentedMatch = /^#\s*([A-Z_][A-Z0-9_]*)=/.exec(line)
    if (commentedMatch) documented.add(commentedMatch[1])
  }
  return { active, documented }
}

/** Env var names read through the declarative `readX('NAME', ...)` helpers. */
function backendConfigKeys(text) {
  const keys = new Set()
  const pattern =
    /read(?:String|StringWithDefault|Int|BooleanStrictTrue|BooleanTrueOrOne|BooleanDefaultTrue)\(\s*'([A-Z_][A-Z0-9_]*)'/g
  let m
  while ((m = pattern.exec(text)) !== null) keys.add(m[1])
  return keys
}

const errors = []

const { active, documented } = parseEnvKeys(readFileSync(envExamplePath, 'utf8'))

// Invariant 1: no duplicate active keys.
const seen = new Set()
const duplicates = new Set()
for (const key of active) {
  if (seen.has(key)) duplicates.add(key)
  seen.add(key)
}
if (duplicates.size > 0) {
  errors.push(
    `.env.example declares these keys more than once (duplicate dotenv keys are silently last-wins): ${[...duplicates].sort().join(', ')}`,
  )
}

// Invariant 2: every declarative backend config key is documented (active or commented).
const configKeys = backendConfigKeys(readFileSync(configPath, 'utf8'))
const missing = [...configKeys].filter((k) => !documented.has(k)).sort()
if (missing.length > 0) {
  errors.push(
    `server/src/config.ts reads these keys but .env.example does not document them: ${missing.join(', ')}\n` +
      `  Add them to .env.example (active or commented, with a comment) so the template stays in sync.`,
  )
}

if (errors.length > 0) {
  console.error('Configuration drift check FAILED:\n')
  for (const e of errors) console.error(`  - ${e}\n`)
  process.exit(1)
}

console.log(
  `Configuration drift check passed: ${active.length} active keys in .env.example, ` +
    `all ${configKeys.size} declarative backend config keys documented, no duplicates.`,
)
