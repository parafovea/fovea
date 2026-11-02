/**
 * Unit tests for the source normalization the 0.5-to-0.6 copy and its verifier
 * share: legacy ontology types that carry a string `description` instead of a
 * `gloss`, and the equivalences the verifier accepts (empty text items, empty
 * lists the view-model defaults) without masking real field differences.
 *
 * @module
 */

import { describe, it, expect } from 'vitest'

import { legacyTypeOf, legacyTypesOf } from '../backfill-ontologies.js'
import { auditDroppedFields, droppedPaths, reconMatchesSource } from '../verify.js'

describe('legacyTypeOf', () => {
  it('carries a string description as a single text gloss item', () => {
    expect(legacyTypeOf({ id: 't', name: 'T', description: 'A thing', color: '#fff' })).toEqual({
      id: 't',
      name: 'T',
      description: 'A thing',
      color: '#fff',
      gloss: [{ type: 'text', content: 'A thing' }],
    })
  })

  it('maps a blank description to an empty gloss', () => {
    expect(legacyTypeOf({ id: 't', name: 'T', description: '  ' })).toMatchObject({ gloss: [] })
  })

  it('leaves a type that already has a gloss unchanged', () => {
    const type = { id: 't', name: 'T', description: 'ignored', gloss: [{ type: 'text', content: 'kept' }] }
    expect(legacyTypeOf(type)).toBe(type)
  })

  it('normalizes a bucket and treats a missing bucket as empty', () => {
    expect(legacyTypesOf([{ id: 'a', name: 'A', description: 'x' }])).toEqual([
      { id: 'a', name: 'A', description: 'x', gloss: [{ type: 'text', content: 'x' }] },
    ])
    expect(legacyTypesOf(undefined)).toEqual([])
  })
})

describe('reconMatchesSource', () => {
  it('accepts an empty reconstructed list for a field the source omits', () => {
    expect(reconMatchesSource({ id: 'r', roles: [] }, { id: 'r' })).toBe(true)
  })

  it('rejects a non-empty reconstructed list for a field the source omits', () => {
    expect(reconMatchesSource({ id: 'r', roles: [{ roleTypeId: 'x' }] }, { id: 'r' })).toBe(false)
  })

  it('treats an empty text item as absent', () => {
    expect(reconMatchesSource({ description: [] }, { description: [{ type: 'text', content: '' }] })).toBe(true)
  })

  it('still rejects differing text content', () => {
    expect(
      reconMatchesSource(
        { gloss: [{ type: 'text', content: 'a' }] },
        { gloss: [{ type: 'text', content: 'b' }] },
      ),
    ).toBe(false)
  })

  it('still rejects a dropped non-empty item', () => {
    expect(reconMatchesSource({ gloss: [] }, { gloss: [{ type: 'text', content: 'kept' }] })).toBe(false)
  })

  it('ignores source-only fields the view-model does not carry', () => {
    expect(reconMatchesSource({ id: 't', name: 'T' }, { id: 't', name: 'T', color: '#fff' })).toBe(true)
  })
})

describe('field audit', () => {
  it('reports a content-bearing field the reconstruction lacks, with its path', () => {
    expect(droppedPaths({ a: 1, b: { c: 'x', d: '' } }, { a: 1, b: {} })).toEqual([{ path: 'b.c', value: 'x' }])
  })

  it('reports dropped fields inside list elements', () => {
    expect(droppedPaths({ boxes: [{ x: 1, note: 'n' }] }, { boxes: [{ x: 1 }] })).toEqual([
      { path: 'boxes[].note', value: 'n' },
    ])
  })

  it('fails a record that drops an unlisted field', () => {
    const mismatches: string[] = []
    expect(auditDroppedFields('worldObject', 'World entity e', { id: 'e', globe: 'Q2' }, { id: 'e' }, mismatches)).toBe(
      false,
    )
    expect(mismatches[0]).toContain('would lose field globe')
  })

  it('passes a listed drop', () => {
    const mismatches: string[] = []
    expect(auditDroppedFields('ontologyType', 'type', { id: 't', color: '#fff' }, { id: 't' }, mismatches)).toBe(true)
    expect(mismatches).toEqual([])
  })

  it('applies a value-limited drop only to the accepted value', () => {
    const accepted: string[] = []
    expect(auditDroppedFields('ontologyType', 'type', { id: 't', symmetric: false }, { id: 't' }, accepted)).toBe(true)
    const rejected: string[] = []
    expect(auditDroppedFields('ontologyType', 'type', { id: 't', symmetric: true }, { id: 't' }, rejected)).toBe(false)
  })
})
