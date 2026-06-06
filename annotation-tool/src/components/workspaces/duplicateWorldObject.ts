/**
 * Build the payload an `useAdd*` mutation expects from an existing world
 * object that the user wants to duplicate.
 *
 * Strips server-managed fields (`id`, `createdAt`, `updatedAt`) so the
 * mutation generates a fresh id and stamps fresh timestamps. Strips
 * Wikidata-provenance fields (`wikidataId`, `wikibaseId`, `wikidataUrl`)
 * so the duplicate is treated as a freshly user-authored record rather
 * than a re-import of the same Wikidata entity — otherwise the duplicate
 * would collide on the API's `(userId, wikidataId)` ownership index.
 * Appends a `(copy)` suffix to whichever name-bearing field the item
 * carries (entities / events / locations / collections use `name`; times
 * use `label`) so the duplicate is visually distinguishable in the list.
 *
 * The returned shape is `Record<string, unknown>` because the five
 * `useAdd*` mutations each expect a distinct `Omit<T, 'id' | ...>` shape;
 * the call-site narrows via the appropriate cast based on which workspace
 * tab is active.
 */
const STRIPPED_FIELDS = [
  'id',
  'createdAt',
  'updatedAt',
  'wikidataId',
  'wikibaseId',
  'wikidataUrl',
] as const

export function buildDuplicatePayload(item: unknown): Record<string, unknown> {
  const renamed: Record<string, unknown> = { ...(item as Record<string, unknown>) }
  for (const k of STRIPPED_FIELDS) {
    delete renamed[k]
  }
  if (typeof renamed.name === 'string') renamed.name = `${renamed.name} (copy)`
  if (typeof renamed.label === 'string') renamed.label = `${renamed.label} (copy)`
  return renamed
}
