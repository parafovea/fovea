/**
 * The `Tour` schema: the single contract for a tour definition.
 *
 * `z.infer<typeof tourSchema>` is the `Tour` type, so first-party tours are
 * compile-checked. `parseTour()` runs the same schema as a runtime validator, so
 * an admin's tour JSON is validated at load and rejected with a field-anchored
 * message (and near-match suggestions for an unknown anchor).
 *
 * A tour is fully serializable data; it carries no functions. A step that needs
 * the workspace in a particular state declares a `driver` (a capability id plus
 * params, resolved against the capability registry), so an admin authors the
 * same tours an engineer does.
 *
 * Anchors are validated against the published `anchorCatalog`. The `anchor`
 * field's type is `AnchorId`, so a first-party tour referencing a missing anchor
 * fails to compile and an admin tour fails to load.
 */
import { z } from 'zod'

import { type AnchorId, allAnchorIds, isAnchorId } from './anchorCatalog'

/** Near-match suggestions for an unknown anchor id, ranked by token overlap. */
function suggestAnchors(value: string): string {
  const v = value.toLowerCase()
  const tokens = v.split(/[^a-z0-9]+/).filter((t) => t.length > 2)
  const ranked = allAnchorIds
    .map((id) => {
      const lid = id.toLowerCase()
      let score = 0
      if (lid.includes(v) || v.includes(lid)) score += 5
      for (const t of tokens) if (lid.includes(t)) score += 1
      return { id, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.id)
  return ranked.length ? ` Did you mean: ${ranked.join(', ')}?` : ''
}

/**
 * An anchor id. The output type is the `AnchorId` union (so first-party tours
 * are typed); the runtime check accepts any catalog id and otherwise fails with a
 * near-match suggestion.
 */
export const anchorIdSchema = z
  .string()
  .superRefine((val, ctx) => {
    if (!isAnchorId(val)) {
      ctx.addIssue({ code: 'custom', message: `Unknown tour anchor ${JSON.stringify(val)}.${suggestAnchors(val)}` })
    }
  })
  .transform((val) => val as AnchorId)

/** A capability the engine runs to put the workspace into the state a step needs. */
export const tourDriverSchema = z
  .object({
    /** Capability id, resolved against the capability registry (e.g. 'seed-annotation'). */
    capability: z.string().min(1),
    /** Opaque params passed to the capability. */
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

export const tourStepSchema = z
  .object({
    /** The surface to spotlight. */
    anchor: anchorIdSchema,
    /** The caption shown on the step card (a short phrase, not a paragraph). */
    narration: z.string().min(1),
    /** Markdown body rendered under the narration. */
    body: z.string().optional(),
    /** React Router path the step's anchor lives on; the engine navigates here first. */
    route: z.string().optional(),
    /** Values for `:param` placeholders in `route`. */
    routeParams: z.record(z.string(), z.string()).optional(),
    /** The action the engine simulates and the visitor is expected to take. */
    expectAction: z.enum(['click', 'draw', 'type', 'hover', 'scrub', 'none']).optional(),
    /** Text the engine types when `expectAction` is `'type'`. */
    typeText: z.string().optional(),
    /** Render a modal spotlight that blocks click-through on this step. */
    modal: z.boolean().optional(),
    /** Capability that puts the workspace into the state this step needs. */
    driver: tourDriverSchema.optional(),
  })
  .strict()

/** The audience a tour is shown to. */
export const tourTargetingSchema = z
  .object({
    /** Show only to users holding one of these roles. */
    roles: z.array(z.string()).optional(),
    /** Show only in these deployment modes (e.g. 'multi-user', 'public-demo'). */
    deploymentModes: z.array(z.string()).optional(),
    /** Show only when these features are enabled. */
    features: z.array(z.string()).optional(),
  })
  .strict()

export const tourSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string(),
    durationMinutes: z.number().nonnegative(),
    /** Feature-area chips shown on the catalogue tile. */
    tags: z.array(z.string()).optional(),
    /** Route the engine navigates to before the first step (default `/app`). */
    startRoute: z.string().optional(),
    /** Persona pre-selected before the runner mounts, matched by name. */
    personaName: z.string().optional(),
    /** One- or two-sentence recap shown on the post-tour page. */
    recap: z.string().optional(),
    /** Suggested next tour id, offered on the recap page. */
    followUpTourId: z.string().optional(),
    /** The audience this tour is shown to. */
    targeting: tourTargetingSchema.optional(),
    /** A value of `false` hides this tour; an admin override file sets it to disable a shipped tour. */
    enabled: z.boolean().optional(),
    steps: z.array(tourStepSchema).min(1),
  })
  .strict()

/** A validated tour. First-party tours are authored as `Tour`. */
export type Tour = z.infer<typeof tourSchema>
export type TourStep = z.infer<typeof tourStepSchema>
export type TourDriver = z.infer<typeof tourDriverSchema>
export type TourTargeting = z.infer<typeof tourTargetingSchema>

/** Thrown when a tour fails schema validation; the message names each offending field. */
export class TourValidationError extends Error {
  constructor(
    message: string,
    readonly issues: z.ZodError['issues'],
    readonly source?: string,
  ) {
    super(message)
    this.name = 'TourValidationError'
  }
}

/** Render zod issues as a field-anchored, multi-line message. */
function formatIssues(issues: z.ZodError['issues'], source?: string): string {
  const where = source ? ` in ${source}` : ''
  const lines = issues.map((i) => {
    const path = i.path.length ? i.path.join('.') : '(root)'
    return `  • ${path}: ${i.message}`
  })
  return `Invalid tour${where}:\n${lines.join('\n')}`
}

/** Validate a tour, throwing `TourValidationError` with a field-anchored message on failure. */
export function parseTour(data: unknown, source?: string): Tour {
  const result = tourSchema.safeParse(data)
  if (!result.success) {
    throw new TourValidationError(formatIssues(result.error.issues, source), result.error.issues, source)
  }
  return result.data
}

/** Validate a tour, returning the tour or the formatted error message without throwing. */
export function safeParseTour(data: unknown, source?: string): { ok: true; tour: Tour } | { ok: false; error: string } {
  const result = tourSchema.safeParse(data)
  return result.success
    ? { ok: true, tour: result.data }
    : { ok: false, error: formatIssues(result.error.issues, source) }
}
