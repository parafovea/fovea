import { describe, it, expect } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { ImportHandler } from '../../src/services/import-handler.js'
import { ImportLine, Resolution } from '../../src/services/import-types.js'

/**
 * Pure-unit coverage for ImportHandler.remapIds. No database needed: the
 * remap operates on parsed JSONL lines via an in-memory idMap, so we
 * construct a stub PrismaClient and exercise the structure-agnostic
 * id-shape substitution directly.
 *
 * The exhaustive surface this asserts is the contract behind the
 * cross-user import fix: every substring of every string value in the
 * payload that is itself a key of idMap (case-insensitive) is rewritten
 * to the importer's regenerated id, no matter what field carries it,
 * how deeply it is nested, whether it appears alone or embedded in
 * prose, or whether the prose is itself a JSON-encoded blob.
 */

const prisma = {} as PrismaClient

const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'
const ID_C = '33333333-3333-4333-8333-333333333333'
const ID_D = '44444444-4444-4444-8444-444444444444'

const NEW_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NEW_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NEW_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const NEW_D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const RESOLUTIONS: Resolution[] = [
  { conflictType: 'persona' as never, strategy: 'create-new', originalId: ID_A, newId: NEW_A, action: 'create-new' },
  { conflictType: 'entity' as never,  strategy: 'create-new', originalId: ID_B, newId: NEW_B, action: 'create-new' },
  { conflictType: 'claim' as never,   strategy: 'create-new', originalId: ID_C, newId: NEW_C, action: 'create-new' },
  { conflictType: 'summary' as never, strategy: 'create-new', originalId: ID_D, newId: NEW_D, action: 'create-new' },
]

function line(type: string, data: ImportLine['data']): ImportLine {
  return { type: type as ImportLine['type'], data, lineNumber: 1 }
}

function run(lines: ImportLine[]): ImportLine[] {
  const handler = new ImportHandler(prisma, 'importer-user')
  return handler.remapIds(lines, RESOLUTIONS)
}

describe('ImportHandler.remapIds — id-shape substitution', () => {
  it('rewrites an id that fills an entire string value, regardless of field name', () => {
    const out = run([
      line('persona', { id: ID_A }),
      line('annotation', { personaId: ID_A, linkedEntityId: ID_B }),
      line('claim', { id: ID_C, subjectEntity: ID_B }),
    ])
    expect(out[0].data.id).toBe(NEW_A)
    expect(out[1].data.personaId).toBe(NEW_A)
    expect(out[1].data.linkedEntityId).toBe(NEW_B)
    expect(out[2].data.id).toBe(NEW_C)
    expect(out[2].data.subjectEntity).toBe(NEW_B)
  })

  it('rewrites inline id mentions embedded in surrounding prose', () => {
    const out = run([
      line('claim', {
        id: ID_C,
        text: `Entity ${ID_B} attempts to break a gate near entity ${ID_A}.`,
        comment: `See also entity ${ID_B} earlier in the timeline.`,
      }),
    ])
    expect(out[0].data.text).toBe(`Entity ${NEW_B} attempts to break a gate near entity ${NEW_A}.`)
    expect(out[0].data.comment).toBe(`See also entity ${NEW_B} earlier in the timeline.`)
  })

  it('rewrites ids in every free-form field the export schema can populate', () => {
    const out = run([
      line('persona', {
        id: ID_A,
        informationNeed: `Track ${ID_B} across all videos.`,
        details: `Persona observes entity ${ID_B} alongside claim ${ID_C}.`,
      }),
      line('ontology', {
        types: [
          { id: ID_B, description: `Used in conjunction with entity ${ID_B}.` },
        ],
      }),
      line('world-state', {
        entities: [
          { id: ID_B, name: `Sibling of ${ID_B}`, description: `Mirrors entity ${ID_B} above.` },
        ],
      }),
      line('summary', {
        id: ID_D,
        text: `Summary mentioning entity ${ID_B} and claim ${ID_C}.`,
      }),
      line('claim-relation', {
        subjectClaim: ID_C,
        objectClaim: ID_C,
        relationDescription: `Connects ${ID_C} to ${ID_B}.`,
      }),
    ])
    expect(out[0].data.informationNeed).toBe(`Track ${NEW_B} across all videos.`)
    expect(out[0].data.details).toBe(`Persona observes entity ${NEW_B} alongside claim ${NEW_C}.`)
    expect((out[1].data.types as Array<{ description: string }>)[0].description)
      .toBe(`Used in conjunction with entity ${NEW_B}.`)
    expect((out[2].data.entities as Array<{ name: string; description: string }>)[0].name)
      .toBe(`Sibling of ${NEW_B}`)
    expect((out[2].data.entities as Array<{ description: string }>)[0].description)
      .toBe(`Mirrors entity ${NEW_B} above.`)
    expect(out[3].data.text).toBe(`Summary mentioning entity ${NEW_B} and claim ${NEW_C}.`)
    expect(out[4].data.relationDescription).toBe(`Connects ${NEW_C} to ${NEW_B}.`)
  })

  it('rewrites ids nested arbitrarily deep, including through arrays', () => {
    const out = run([
      line('claim', {
        id: ID_C,
        gloss: {
          items: [
            { type: 'objectRef', content: ID_B },
            { type: 'text', content: `references ${ID_B}` },
            { type: 'typeRef', refType: 'entity-object', content: ID_B },
            { type: 'group', children: [{ type: 'objectRef', content: ID_A }] },
          ],
        },
      }),
    ])
    const items = (out[0].data.gloss as { items: Array<{ type: string; content?: string; children?: Array<{ content: string }> }> }).items
    expect(items[0].content).toBe(NEW_B)
    expect(items[1].content).toBe(`references ${NEW_B}`)
    expect(items[2].content).toBe(NEW_B)
    expect(items[3].children![0].content).toBe(NEW_A)
  })

  it('rewrites each element of *Ids arrays, members arrays, and ordinary string arrays', () => {
    const out = run([
      line('annotation', {
        entityIds: [ID_A, ID_B, ID_C],
        tags: [`primary:${ID_A}`, `secondary:${ID_B}`],
      }),
      line('entity-collection', {
        members: [ID_A, ID_B],
      }),
    ])
    expect(out[0].data.entityIds).toEqual([NEW_A, NEW_B, NEW_C])
    expect(out[0].data.tags).toEqual([`primary:${NEW_A}`, `secondary:${NEW_B}`])
    expect(out[1].data.members).toEqual([NEW_A, NEW_B])
  })

  it('rewrites multiple ids in a single string', () => {
    const out = run([
      line('claim', {
        text: `${ID_A} → ${ID_B} → ${ID_C} → ${ID_A} (cycle)`,
      }),
    ])
    expect(out[0].data.text).toBe(`${NEW_A} → ${NEW_B} → ${NEW_C} → ${NEW_A} (cycle)`)
  })

  it('rewrites ids embedded as substrings inside larger tokens', () => {
    const out = run([
      line('claim', {
        text: `claim_${ID_C}_v2 references entity-${ID_B}.png and url=https://x/${ID_A}?q=1`,
      }),
    ])
    expect(out[0].data.text).toBe(
      `claim_${NEW_C}_v2 references entity-${NEW_B}.png and url=https://x/${NEW_A}?q=1`,
    )
  })

  it('rewrites ids whose case differs from the exporter-side originalId', () => {
    const out = run([
      line('claim', {
        text: `Refers to ${ID_B.toUpperCase()} and to ${ID_C.toUpperCase()}.`,
        someId: ID_A.toUpperCase(),
      }),
    ])
    expect(out[0].data.text).toBe(`Refers to ${NEW_B} and to ${NEW_C}.`)
    expect(out[0].data.someId).toBe(NEW_A)
  })

  it('rewrites ids embedded inside a JSON-encoded blob carried as a string', () => {
    const encoded = JSON.stringify({ ref: ID_B, note: `near ${ID_C}` })
    const out = run([
      line('claim', { rawPayload: encoded }),
    ])
    expect(out[0].data.rawPayload).toBe(
      JSON.stringify({ ref: ID_B, note: `near ${ID_C}` })
        .replace(ID_B, NEW_B)
        .replace(ID_C, NEW_C),
    )
  })

  it('passes id-shaped substrings that are NOT in the idMap through unchanged', () => {
    const stranger = 'deadbeef-dead-4bee-8eef-feedfacecafe'
    const out = run([
      line('claim', {
        id: ID_C,
        text: `Imported claim sits next to ${stranger}, an id this import has never seen.`,
      }),
    ])
    expect(out[0].data.id).toBe(NEW_C)
    expect(out[0].data.text).toBe(
      `Imported claim sits next to ${stranger}, an id this import has never seen.`,
    )
  })

  it('passes strings whose substrings are not in the map through unchanged (no false positives)', () => {
    const out = run([
      line('claim', {
        text: 'plain prose with hex 0a09067725832030 and short ids abc-123',
        nonsense: '11111111-1111-1111-1111-1111111111ZZ',
      }),
    ])
    expect(out[0].data.text).toBe('plain prose with hex 0a09067725832030 and short ids abc-123')
    expect(out[0].data.nonsense).toBe('11111111-1111-1111-1111-1111111111ZZ')
  })

  it('is a strict no-op when no resolutions request create-new', () => {
    const handler = new ImportHandler(prisma, 'importer')
    const lines: ImportLine[] = [
      line('claim', { id: ID_C, text: `mentions ${ID_B}` }),
    ]
    const out = handler.remapIds(lines, [
      { conflictType: 'claim' as never, strategy: 'skip', originalId: ID_C, action: 'skip' },
    ])
    expect(out).toEqual(lines)
  })

  it('leaves primitive non-string, non-object values (numbers, booleans, null) untouched', () => {
    const out = run([
      line('annotation', {
        startFrame: 0,
        endFrame: 240,
        isApproved: true,
        deletedAt: null,
        text: `linked to ${ID_B}`,
      }),
    ])
    expect(out[0].data.startFrame).toBe(0)
    expect(out[0].data.endFrame).toBe(240)
    expect(out[0].data.isApproved).toBe(true)
    expect(out[0].data.deletedAt).toBeNull()
    expect(out[0].data.text).toBe(`linked to ${NEW_B}`)
  })
})
