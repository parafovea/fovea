/**
 * Bounded metric label values.
 *
 * Every distinct combination of label values on a metric is a separate time
 * series in Prometheus, so a label fed from request data (a URL, a value a
 * browser reports) grows the store without bound. These helpers keep every
 * label to a bounded set of values: request routes use the matched route
 * template, client-reported paths are normalized, and each label admits at
 * most {@link MAX_VALUES_PER_LABEL} distinct values per process, after which
 * further values are reported as {@link OVERFLOW_LABEL}.
 *
 * @module
 */

/** The route label for a request that matched no registered route. */
export const UNMATCHED_ROUTE = 'unmatched'

/** The value reported once a label has admitted its maximum distinct values. */
export const OVERFLOW_LABEL = 'other'

/** Distinct values one label may take per process before overflowing. */
export const MAX_VALUES_PER_LABEL = 200

/** The longest label value kept, in characters. */
const MAX_LABEL_LENGTH = 100

const seenValues = new Map<string, Set<string>>()

/**
 * Admits `value` for the label `key`, or returns {@link OVERFLOW_LABEL} once
 * the label already holds {@link MAX_VALUES_PER_LABEL} other values.
 *
 * @param key - the label's name, scoped by metric where values differ by metric
 * @param value - the candidate label value
 * @returns the value to record
 */
export function boundedLabel(key: string, value: string): string {
  const trimmed = value.length > MAX_LABEL_LENGTH ? value.slice(0, MAX_LABEL_LENGTH) : value
  let seen = seenValues.get(key)
  if (!seen) {
    seen = new Set()
    seenValues.set(key, seen)
  }
  if (seen.has(trimmed)) return trimmed
  if (seen.size >= MAX_VALUES_PER_LABEL) return OVERFLOW_LABEL
  seen.add(trimmed)
  return trimmed
}

/**
 * The route label for a server request: its matched route template (for
 * instance `/api/videos/:videoId`), or {@link UNMATCHED_ROUTE} when no route
 * matched. The raw URL is never used, because it carries ids, query strings,
 * and arbitrary paths from scanners.
 *
 * @param request - the request, with Fastify's matched route options
 * @returns the bounded route label
 */
export function routeLabel(request: { routeOptions?: { url?: string } }): string {
  return boundedLabel('route', request.routeOptions?.url || UNMATCHED_ROUTE)
}

/** A path segment that identifies a record rather than naming a page. */
const ID_SEGMENT = /^(?:\d+|[0-9a-f]{8,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

/**
 * Normalizes a page path a browser reports (for instance `/videos/3fa9…?t=4`)
 * into a bounded label: the query and fragment are dropped, record-id segments
 * become `:id`, and the result is admitted through {@link boundedLabel}.
 *
 * @param path - the reported path, possibly absent
 * @returns the bounded route label
 */
export function clientRouteLabel(path: string | undefined): string {
  if (!path) return boundedLabel('client_route', 'unknown')
  const withoutQuery = path.split(/[?#]/, 1)[0]
  const normalized = withoutQuery
    .split('/')
    .map((segment) => (ID_SEGMENT.test(segment) ? ':id' : segment))
    .join('/')
  return boundedLabel('client_route', normalized || '/')
}

/** Clears every admitted value. For tests. */
export function resetBoundedLabels(): void {
  seenValues.clear()
}
