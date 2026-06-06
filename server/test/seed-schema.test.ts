/**
 * validateSeedBundle unit tests — exercises the validator in isolation
 * (no Fastify, no Prisma, no filesystem) so failure modes are easy to
 * read in CI output. The integration tests in test/seed.test.ts cover
 * the HTTP + database paths; these cover the rejection branches the
 * integration tests can't show clean diffs for.
 */

import { describe, it, expect } from 'vitest'
import { validateSeedBundle } from '../src/demo/seed-schema.js'

describe('validateSeedBundle', () => {
  it('rejects non-object input', () => {
    expect(validateSeedBundle(null).ok).toBe(false)
    expect(validateSeedBundle('string').ok).toBe(false)
    expect(validateSeedBundle([]).ok).toBe(false)
  })

  it('requires a non-empty tourId', () => {
    const r = validateSeedBundle({ tourId: '', personas: [{ name: 'a', role: 'r' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/tourId/i)
  })

  it('requires at least one persona', () => {
    const r = validateSeedBundle({ tourId: 'x', personas: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/persona/i)
  })

  it('rejects personas without name or role', () => {
    const r = validateSeedBundle({
      tourId: 'x',
      personas: [{ name: '', role: 'r' }],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/name/i)

    const r2 = validateSeedBundle({
      tourId: 'x',
      personas: [{ name: 'a' }],
    })
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.reason).toMatch(/role/i)
  })

  it('drops an ontology block whose personaIndex points outside personas[]', () => {
    const r = validateSeedBundle({
      tourId: 'x',
      personas: [{ name: 'a', role: 'r' }],
      ontology: { personaIndex: 5, entityTypes: [{ name: 'P', gloss: 'g' }] },
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.bundle.ontology).toBeUndefined()
  })

  it('preserves an ontology block with valid personaIndex and filtered types', () => {
    const r = validateSeedBundle({
      tourId: 'x',
      personas: [{ name: 'a', role: 'r' }],
      ontology: {
        personaIndex: 0,
        entityTypes: [
          { name: 'Person', gloss: 'individual human' },
          // Malformed types are silently dropped so a typo in one entry
          // doesn't tank the rest of the bundle.
          { name: '', gloss: 'invalid' },
          { name: 'Object' /* missing gloss */ },
        ],
        eventTypes: [],
        roles: [],
        relationTypes: [],
      },
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.bundle.ontology?.personaIndex).toBe(0)
      expect(r.bundle.ontology?.entityTypes).toHaveLength(1)
      expect(r.bundle.ontology?.entityTypes?.[0].name).toBe('Person')
    }
  })

  it('accepts forward-compatible extra fields without dropping them', () => {
    // `annotations` and `summaries` are accepted as untyped arrays.
    const r = validateSeedBundle({
      tourId: 'x',
      personas: [{ name: 'a', role: 'r' }],
      annotations: [{ foo: 'bar' }],
      summaries: [{ baz: 'qux' }],
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.bundle.annotations).toHaveLength(1)
      expect(r.bundle.summaries).toHaveLength(1)
    }
  })

  it('defaults isDefault to false when omitted', () => {
    const r = validateSeedBundle({
      tourId: 'x',
      personas: [{ name: 'a', role: 'r' }],
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.bundle.personas[0].isDefault).toBe(false)
  })
})
