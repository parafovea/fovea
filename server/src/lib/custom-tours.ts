/**
 * Custom-tour loader — reads tour scripts from $FOVEA_TOURS_DIR on
 * server boot and merges them into the manifest returned by /api/tours.
 *
 * Per the plan §6.5:
 *   - one file per tour, JSON or YAML
 *   - validated against a published JSON Schema (docs/tour-schema.json,
 *     to be added when custom tours become a supported public surface)
 *   - directory listing is the menu — no separate config required
 *   - malformed files are skipped with a loud log line; the menu shows
 *     a small "N custom tours failed to load" notice
 *   - no file-watching: server restart picks up new files (config-as-code
 *     workflow). The operational cost of hot-reloading isn't worth it.
 *
 * This module is intentionally narrow: it knows how to find, parse, and
 * shape tour files into the same TourSummary the built-in catalog uses.
 * Anything more elaborate (per-persona filtering, validation against the
 * current build's anchor inventory, etc.) lives one layer up.
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'

export interface CustomTourSummary {
  id: string
  title: string
  description: string
  durationMinutes: number
  tags?: string[]
}

export interface LoaderResult {
  tours: CustomTourSummary[]
  failures: Array<{ path: string; reason: string }>
}

const VALID_EXTS = new Set(['.json', '.yaml', '.yml'])

/**
 * Load all tour files from $FOVEA_TOURS_DIR. Returns an empty result
 * (with no failures) if the env var is unset, the directory does not
 * exist, or it contains no parseable tour files. A self-hoster who has
 * never authored a custom tour pays nothing.
 */
export async function loadCustomTours(): Promise<LoaderResult> {
  const dir = process.env.FOVEA_TOURS_DIR
  if (!dir || dir.length === 0) {
    return { tours: [], failures: [] }
  }

  let entries: string[]
  try {
    const s = await stat(dir)
    if (!s.isDirectory()) {
      return { tours: [], failures: [{ path: dir, reason: 'not a directory' }] }
    }
    entries = await readdir(dir)
  } catch (err) {
    // Missing directory is silent (a self-hoster who didn't set the var
    // shouldn't see a failure notice); permission errors etc. surface.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { tours: [], failures: [] }
    }
    return {
      tours: [],
      failures: [{ path: dir, reason: `cannot read directory: ${(err as Error).message}` }],
    }
  }

  const tours: CustomTourSummary[] = []
  const failures: LoaderResult['failures'] = []

  for (const name of entries) {
    if (!VALID_EXTS.has(extname(name).toLowerCase())) continue
    const path = join(dir, name)
    try {
      const raw = await readFile(path, 'utf-8')
      const parsed = extname(name).toLowerCase() === '.json' ? JSON.parse(raw) : parseYamlMinimal(raw)
      const validated = validateTour(parsed)
      if (validated.kind === 'error') {
        failures.push({ path, reason: validated.message })
        continue
      }
      tours.push(validated.value)
    } catch (err) {
      failures.push({ path, reason: (err as Error).message })
    }
  }

  return { tours, failures }
}

interface ValidationOk {
  kind: 'ok'
  value: CustomTourSummary
}
interface ValidationError {
  kind: 'error'
  message: string
}

function validateTour(input: unknown): ValidationOk | ValidationError {
  if (!input || typeof input !== 'object') {
    return { kind: 'error', message: 'tour file did not parse to an object' }
  }
  const o = input as Record<string, unknown>
  if (typeof o.id !== 'string' || o.id.length === 0) {
    return { kind: 'error', message: 'missing or empty `id`' }
  }
  if (typeof o.title !== 'string' || o.title.length === 0) {
    return { kind: 'error', message: 'missing or empty `title`' }
  }
  if (typeof o.description !== 'string') {
    return { kind: 'error', message: 'missing `description`' }
  }
  if (typeof o.durationMinutes !== 'number' || !Number.isFinite(o.durationMinutes)) {
    return { kind: 'error', message: 'missing or non-numeric `durationMinutes`' }
  }
  const tags = Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : undefined
  return {
    kind: 'ok',
    value: {
      id: o.id,
      title: o.title,
      description: o.description,
      durationMinutes: o.durationMinutes,
      tags,
    },
  }
}

/**
 * Minimal YAML parser — only handles the flat shape a tour summary
 * needs (id, title, description, durationMinutes, tags). We don't want
 * to take a `js-yaml` dependency just for this — most teams will write
 * JSON anyway, and a YAML-needing team can drop in `js-yaml` and swap
 * this implementation behind the same function name.
 */
function parseYamlMinimal(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = yaml.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue
    const m = /^([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*(.*)$/.exec(line)
    if (!m) continue
    const [, key, rawValue] = m
    if (rawValue.length === 0) {
      // Could be a list (tags: \n - foo \n - bar) — collect subsequent indented lines.
      const items: string[] = []
      while (i + 1 < lines.length) {
        const next = lines[i + 1]
        const listMatch = /^\s*-\s*(.+?)\s*$/.exec(next)
        if (!listMatch) break
        items.push(stripQuotes(listMatch[1]))
        i++
      }
      if (items.length > 0) result[key] = items
      continue
    }
    const cleaned = stripQuotes(rawValue.trim())
    const asNumber = Number(cleaned)
    result[key] = !Number.isNaN(asNumber) && cleaned.length > 0 ? asNumber : cleaned
  }
  return result
}

function stripQuotes(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1)
  }
  return s
}
