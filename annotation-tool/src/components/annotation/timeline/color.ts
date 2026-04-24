/**
 * Deterministic track coloring.
 *
 * Annotations should keep the same color across reloads and re-orderings,
 * so the hue is derived from the annotation id (FNV-1a). HSL gives
 * consistent perceptual separation without running WCAG calculations —
 * all track colors sit at the same lightness + saturation, only the hue
 * cycles around the wheel.
 */

function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  return hash >>> 0
}

/**
 * Return an HSL color for a given annotation id.
 *
 * Values cluster around the primary accent range (blues/cyans/violets) to
 * stay coherent with the rest of the app; orange and red are avoided to
 * keep the destructive/warning palette free for UI semantics.
 */
export function colorForId(id: string): string {
  // 360° / 12 slots = 30° steps; offset so slot 0 lands on electric blue.
  const slot = fnv1a(id) % 12
  const hue = (200 + slot * 30) % 360
  return `hsl(${hue} 78% 60%)`
}

/**
 * Segment colors keyed by interpolation type. Unknown types fall through
 * to the linear color so missing cases are visible but not crashy.
 */
export const INTERPOLATION_COLORS: Readonly<Record<string, string>> = Object.freeze({
  linear: 'hsl(210 80% 60%)',
  'ease-in': 'hsl(150 65% 50%)',
  'ease-out': 'hsl(30 80% 55%)',
  'ease-in-out': 'hsl(280 60% 65%)',
  hold: 'hsl(215 15% 50%)',
  bezier: 'hsl(330 70% 60%)',
  parametric: 'hsl(190 70% 55%)',
})

/**
 * Human-facing labels for interpolation types. Used in tooltips.
 */
export const INTERPOLATION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  linear: 'Linear',
  'ease-in': 'Ease In',
  'ease-out': 'Ease Out',
  'ease-in-out': 'Ease In–Out',
  hold: 'Hold',
  bezier: 'Bezier',
  parametric: 'Parametric',
})
