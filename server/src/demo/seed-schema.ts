/**
 * Demo fixture bundle schema.
 *
 * One JSON file per tour, loaded by the seed handler. The shape is
 * deliberately minimal — additional fields (annotations, summaries,
 * model-state, etc.) are accepted as untyped pass-throughs and ignored
 * by the seeder until their loaders land. That way:
 *
 *   - bundles authored today against an evolving spec stay valid as
 *     new sections are added,
 *   - the seeder can be implemented incrementally without breaking
 *     existing fixtures,
 *   - a malformed bundle is rejected before any database write.
 *
 * Keep this in sync with annotation-tool/demo/fixtures/README.md.
 */

export interface SeedBundle {
  tourId: string
  personas: SeedPersona[]
  ontology?: SeedOntology
  world?: SeedWorld
  videos?: SeedVideoRef[]
  annotations?: unknown[]
  summaries?: unknown[]
}

export interface SeedPersona {
  name: string
  role: string
  /** Optional persona description; defaults to a generic placeholder. */
  informationNeed?: string
  /** If true (and exactly one persona has it), mark as default in the UI. */
  isDefault?: boolean
}

export interface SeedOntology {
  /** Index into personas[] this ontology attaches to. */
  personaIndex: number
  entityTypes?: SeedTypeDecl[]
  eventTypes?: SeedTypeDecl[]
  roles?: SeedTypeDecl[]
  relationTypes?: SeedTypeDecl[]
}

export interface SeedTypeDecl {
  name: string
  gloss: string
}

export interface SeedWorld {
  personaIndex: number
  entities?: unknown[]
  events?: unknown[]
  times?: unknown[]
  locations?: unknown[]
}

export interface SeedVideoRef {
  videoId: string
}

export interface ValidationResult {
  ok: true
  bundle: SeedBundle
}

export interface ValidationError {
  ok: false
  reason: string
}

/**
 * Validate a parsed JSON bundle. Returns a structured result rather
 * than throwing so the seed handler can map failures to a clean HTTP
 * 400 instead of a 500. Type-narrows on `ok: true` for the caller.
 */
export function validateSeedBundle(input: unknown): ValidationResult | ValidationError {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: 'bundle must be a JSON object' }
  }
  const o = input as Record<string, unknown>

  if (typeof o.tourId !== 'string' || o.tourId.length === 0) {
    return { ok: false, reason: 'missing or empty `tourId`' }
  }
  if (!Array.isArray(o.personas) || o.personas.length === 0) {
    return { ok: false, reason: 'bundle must include at least one persona' }
  }

  const personas: SeedPersona[] = []
  for (let i = 0; i < o.personas.length; i++) {
    const p = o.personas[i] as Record<string, unknown> | undefined
    if (!p || typeof p !== 'object') {
      return { ok: false, reason: `personas[${i}] must be an object` }
    }
    if (typeof p.name !== 'string' || p.name.length === 0) {
      return { ok: false, reason: `personas[${i}].name missing` }
    }
    if (typeof p.role !== 'string' || p.role.length === 0) {
      return { ok: false, reason: `personas[${i}].role missing` }
    }
    personas.push({
      name: p.name,
      role: p.role,
      informationNeed: typeof p.informationNeed === 'string' ? p.informationNeed : undefined,
      isDefault: p.isDefault === true,
    })
  }

  const bundle: SeedBundle = {
    tourId: o.tourId,
    personas,
    ontology: validateOntology(o.ontology, personas.length),
    world: validateWorld(o.world, personas.length),
    videos: Array.isArray(o.videos)
      ? (o.videos as unknown[])
          .filter((v): v is { videoId: string } => !!v && typeof (v as { videoId?: unknown }).videoId === 'string')
          .map((v) => ({ videoId: v.videoId }))
      : undefined,
    annotations: Array.isArray(o.annotations) ? (o.annotations as unknown[]) : undefined,
    summaries: Array.isArray(o.summaries) ? (o.summaries as unknown[]) : undefined,
  }

  return { ok: true, bundle }
}

function validateOntology(raw: unknown, personaCount: number): SeedOntology | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const idx = typeof o.personaIndex === 'number' ? o.personaIndex : 0
  if (idx < 0 || idx >= personaCount) return undefined
  return {
    personaIndex: idx,
    entityTypes: validateTypeArray(o.entityTypes),
    eventTypes: validateTypeArray(o.eventTypes),
    roles: validateTypeArray(o.roles),
    relationTypes: validateTypeArray(o.relationTypes),
  }
}

function validateWorld(raw: unknown, personaCount: number): SeedWorld | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const idx = typeof o.personaIndex === 'number' ? o.personaIndex : 0
  if (idx < 0 || idx >= personaCount) return undefined
  return {
    personaIndex: idx,
    entities: Array.isArray(o.entities) ? (o.entities as unknown[]) : undefined,
    events: Array.isArray(o.events) ? (o.events as unknown[]) : undefined,
    times: Array.isArray(o.times) ? (o.times as unknown[]) : undefined,
    locations: Array.isArray(o.locations) ? (o.locations as unknown[]) : undefined,
  }
}

function validateTypeArray(raw: unknown): SeedTypeDecl[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: SeedTypeDecl[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    // Empty strings are rejected to match the JSON schema's minLength: 1
    // contract — a type with no name or no gloss is unreadable for the
    // user authoring against an existing ontology.
    if (typeof o.name !== 'string' || o.name.length === 0) continue
    if (typeof o.gloss !== 'string' || o.gloss.length === 0) continue
    out.push({ name: o.name, gloss: o.gloss })
  }
  return out
}
