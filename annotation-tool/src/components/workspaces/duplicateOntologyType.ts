/**
 * Build the payload an `useAdd*ToPersona` mutation expects from an
 * existing ontology type that the user wants to duplicate.
 *
 * Ontology types (EntityType / RoleType / EventType / RelationType) are
 * persisted as elements of a persona's ontology JSON blob rather than as
 * top-level rows, so the server keeps no per-type timestamps and we do
 * not strip `createdAt` / `updatedAt`. We do generate a fresh `id` so the
 * duplicate is a distinct ontology entry, append a `(copy)` suffix to
 * `name` for visual distinction, and strip `wikidataId` / `wikibaseId` /
 * `wikidataUrl` so the duplicate is treated as a freshly user-authored
 * type rather than a re-import of the same Wikidata concept (which would
 * collide with the source on the ontology's `(personaId, wikidataId)`
 * uniqueness invariant the augmenter relies on).
 *
 * The caller supplies the `newId` so this helper stays pure and is
 * trivially testable; production code passes `generateId()`.
 */
const STRIPPED_FIELDS = ['wikidataId', 'wikibaseId', 'wikidataUrl'] as const

export function buildDuplicateOntologyType<T extends { id: string; name: string }>(
  source: T,
  newId: string,
): T {
  const cloned: Record<string, unknown> = { ...(source as unknown as Record<string, unknown>) }
  for (const k of STRIPPED_FIELDS) {
    delete cloned[k]
  }
  cloned.id = newId
  if (typeof cloned.name === 'string') cloned.name = `${cloned.name} (copy)`
  return cloned as unknown as T
}
