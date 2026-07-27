import { describe, it, expect } from 'vitest'

import type { GlossItem } from '@models/types.js'

import {
  ontologyToLayers,
  glossStandoffFor,
  layersToOntology,
  glossFromStandoff,
  edgeToOntologyRelation,
  type PersonaOntologyAggregate,
  type OntologyMeta,
  type OntologyLayersScope,
  type GlossStandoff,
  type GlossRefRow,
  type TypeDefRow,
} from '../../ontology-layers-mapper.js'
import { typeDefRowId as bridgeTypeDefRowId } from '../../layers-bridge/ontology-bridge.js'
import { glossExpressionId, glossLayerId, layersOntologyForPersonaId } from '../../layers-id-map.js'
import { getPanproto, loadFoveaSchema } from '../panproto-registry.js'
import { assertOracleParity, type LayersRow } from '../oracle-parity.js'
import {
  buildGlossRegroupLens,
  foveaOntologyToLayersRows,
  glossRegroupSourceRecord,
  glossRegroupSourceSchema,
  type OntologyLayersRows,
} from '../ontology-lens.js'

/**
 * Verifies the FOVEA persona-ontology surface's lens+adapter path against the
 * committed hand-rolled forward mapper (the oracle: `ontologyToLayers` plus
 * `glossStandoffFor`): the gloss reference-segment regroup compiles to a native
 * panproto lens whose round-trip laws hold, and the composition + adapter reproduce
 * the oracle's rows exactly over a corpus of representative persona ontologies.
 */

const SCOPE: OntologyLayersScope = { projectId: 'project-1', createdByUserId: 'user-1' }
const META: OntologyMeta = { name: 'News ontology', description: 'A test ontology.', domain: 'news' }

/** A gloss carrying a typeRef reference segment (drives the stand-off). */
const ENTITY_GLOSS: GlossItem[] = [
  { type: 'text', content: 'A person, such as a ' },
  { type: 'typeRef', content: 'entity-journalist', refType: 'entity', refPersonaId: 'persona-1' },
  { type: 'text', content: '.' },
]

/** A gloss carrying object and claim reference segments. */
const EVENT_GLOSS: GlossItem[] = [
  { type: 'text', content: 'The act of reporting on ' },
  { type: 'objectRef', content: 'obj-election-2024' },
  { type: 'text', content: ', as claimed by ' },
  { type: 'claimRef', content: 'the source', refClaimId: 'claim-9' },
]

/** A text-only gloss (no reference segments -> no stand-off rows). */
const ROLE_GLOSS: GlossItem[] = [{ type: 'text', content: 'The entity that performs the action.' }]

/** A persona ontology exercising every branch of the forward map. */
const RICH: PersonaOntologyAggregate = {
  entityTypes: [
    {
      id: 'e1',
      name: 'Person',
      gloss: ENTITY_GLOSS,
      sharedTypeId: 'shared-person',
      wikidataId: 'Q5',
      wikidataUrl: 'https://www.wikidata.org/wiki/Q5',
      constraints: [{ type: 'allowedTypes', value: ['e2', 'e3'] }],
      examples: ['a journalist', 'a witness'],
      importedFrom: 'export-42',
      importedAt: '2026-01-01T00:00:00.000Z',
    },
    { id: 'e2', name: 'Organization', gloss: [], wikibaseId: 'WB-100' },
  ],
  eventTypes: [
    {
      id: 'ev1',
      name: 'Reporting',
      gloss: EVENT_GLOSS,
      roles: [
        { roleTypeId: 'r1', optional: false, minOccurrences: 1, maxOccurrences: 1 },
        { roleTypeId: 'r2', optional: true, excludes: ['r1'] },
      ],
      examples: ['broke the story'],
    },
    { id: 'ev2', name: 'Investigation', gloss: [], parentEventId: 'ev1', roles: [] },
  ],
  roleTypes: [
    { id: 'r1', name: 'Reporter', gloss: ROLE_GLOSS, allowedFillerTypes: ['entity'] },
    { id: 'r2', name: 'Subject', gloss: [], allowedFillerTypes: ['entity', 'event'] },
  ],
  relationTypes: [
    {
      id: 'rel1',
      name: 'covers',
      gloss: [],
      sourceTypes: ['entity'],
      targetTypes: ['event'],
      symmetric: false,
      transitive: true,
      constraints: [{ type: 'valueRange', value: { min: 0, max: 5 } }],
    },
    {
      id: 'rel2',
      name: 'coauthorOf',
      gloss: [{ type: 'text', content: 'Symmetric coauthorship between ' }, { type: 'typeRef', content: 'e1', refType: 'entity' }],
      sourceTypes: ['entity'],
      targetTypes: ['entity'],
      symmetric: true,
    },
  ],
}

/** A second, sparse ontology: a single type with an empty gloss. */
const SPARSE: PersonaOntologyAggregate = {
  entityTypes: [{ id: 'x1', name: 'Thing', gloss: [] }],
  eventTypes: [],
  roleTypes: [],
  relationTypes: [],
}

/** An empty ontology (no types at all). */
const EMPTY: PersonaOntologyAggregate = { entityTypes: [], eventTypes: [], roleTypes: [], relationTypes: [] }

const CORPUS: Array<{ name: string; personaId: string; aggregate: PersonaOntologyAggregate }> = [
  { name: 'rich persona ontology', personaId: 'persona-1', aggregate: RICH },
  { name: 'sparse persona ontology', personaId: 'persona-2', aggregate: SPARSE },
  { name: 'empty persona ontology', personaId: 'persona-3', aggregate: EMPTY },
]

/** Runs the oracle forward mapper (ontologyToLayers + glossStandoffFor) end to end. */
function oracleRows(aggregate: PersonaOntologyAggregate, personaId: string): OntologyLayersRows {
  const { ontology, typeDefs } = ontologyToLayers(aggregate, personaId, META, SCOPE)
  const ontologyId = layersOntologyForPersonaId(personaId)
  const standoffs: GlossStandoff[] = []
  for (const typeDef of typeDefs) {
    const rowId = bridgeTypeDefRowId(ontologyId, typeDef.typeKind, typeDef.id)
    const standoff = glossStandoffFor(rowId, typeDef.glossItems, ontologyId, personaId, SCOPE)
    if (standoff) standoffs.push(standoff)
  }
  return {
    ontology,
    typeDefs,
    glossExpressions: standoffs.map((s) => s.expression),
    glossLayers: standoffs.map((s) => s.layer),
    glossAnnotations: standoffs.flatMap((s) => s.annotations),
  }
}

/** Flattens a row set into tagged Prisma-table rows for the multiset comparison. */
function taggedRows(rows: OntologyLayersRows): LayersRow[] {
  const tagged: LayersRow[] = [{ __table: 'LayersOntology', ...rows.ontology }]
  for (const typeDef of rows.typeDefs) tagged.push({ __table: 'TypeDef', ...typeDef })
  for (const expression of rows.glossExpressions) tagged.push({ __table: 'Expression', ...expression })
  for (const layer of rows.glossLayers) tagged.push({ __table: 'AnnotationLayer', ...layer })
  for (const annotation of rows.glossAnnotations) tagged.push({ __table: 'LayersAnnotation', ...annotation })
  return tagged
}

/** Rebuilds the reconstruction inputs (TypeDef rows + reconstructed gloss map) from a row set. */
function reconstructionInputs(
  rows: OntologyLayersRows,
  personaId: string,
): { typeDefRows: TypeDefRow[]; glossMap: Map<string, GlossItem[]> } {
  const ontologyId = layersOntologyForPersonaId(personaId)
  // Mirror the bridge's row distribution: the persisted TypeDef id is the derived
  // row id, and a parent ref resolves to the parent's derived row id.
  const typeDefRows: TypeDefRow[] = rows.typeDefs.map((typeDef) => ({
    id: bridgeTypeDefRowId(ontologyId, typeDef.typeKind, typeDef.id),
    name: typeDef.name,
    typeKind: typeDef.typeKind,
    gloss: typeDef.gloss,
    parentTypeId: typeDef.parentTypeId ? bridgeTypeDefRowId(ontologyId, typeDef.typeKind, typeDef.parentTypeId) : null,
    allowedRoles: typeDef.allowedRoles as TypeDefRow['allowedRoles'],
    allowedValues: typeDef.allowedValues as TypeDefRow['allowedValues'],
    knowledgeRefs: typeDef.knowledgeRefs as TypeDefRow['knowledgeRefs'],
    features: typeDef.features as TypeDefRow['features'],
  }))

  // Walk the gloss back from the stand-off, keyed by the TypeDef row id the gloss
  // expression and span-layer ids fan off (mirrors the bridge's readGlossMap).
  const expressionIdToRow = new Map<string, string>()
  const layerIdToRow = new Map<string, string>()
  for (const row of typeDefRows) {
    expressionIdToRow.set(glossExpressionId(row.id), row.id)
    layerIdToRow.set(glossLayerId(row.id), row.id)
  }

  const refsByRow = new Map<string, GlossRefRow[]>()
  for (const annotation of rows.glossAnnotations) {
    const rowId = layerIdToRow.get(annotation.layerId)
    if (!rowId) continue
    const list = refsByRow.get(rowId) ?? []
    list.push({
      anchor: annotation.anchor,
      label: annotation.label,
      text: annotation.text,
      ontologyTypeRefId: annotation.ontologyTypeRefId,
      arguments: annotation.arguments,
      features: annotation.features,
    })
    refsByRow.set(rowId, list)
  }

  const glossMap = new Map<string, GlossItem[]>()
  for (const expression of rows.glossExpressions) {
    const rowId = expressionIdToRow.get(expression.id)
    if (!rowId) continue
    glossMap.set(rowId, glossFromStandoff(expression.text, refsByRow.get(rowId) ?? []))
  }
  return { typeDefRows, glossMap }
}

describe('ontology-lens gloss regroup lens', () => {
  it('compiles a native gloss regroup lens carrying the anchor field transform', async () => {
    const { requirementKind, fieldTransforms } = await buildGlossRegroupLens()
    expect(requirementKind).toBe('empty')
    expect(Object.keys(fieldTransforms)).toContain('root.segments:items')
  })

  it("holds the round-trip laws over every corpus type's gloss segments", async () => {
    const p = await getPanproto()
    const source = await loadFoveaSchema(glossRegroupSourceSchema)
    const { lens } = await buildGlossRegroupLens()

    const glosses: Array<{ name: string; gloss: GlossItem[] }> = [
      { name: 'entity typeRef gloss', gloss: ENTITY_GLOSS },
      { name: 'event object/claim gloss', gloss: EVENT_GLOSS },
      { name: 'role text-only gloss', gloss: ROLE_GLOSS },
    ]
    for (const { name, gloss } of glosses) {
      const record = glossRegroupSourceRecord(gloss)
      const bytes = p.parseJson(source, JSON.stringify(record))._bytes
      expect(lens.checkGetPut(bytes).holds, `GetPut for ${name}`).toBe(true)
      expect(lens.checkPutGet(bytes).holds, `PutGet for ${name}`).toBe(true)
    }
  })
})

describe('ontology-lens oracle parity', () => {
  it('reproduces the oracle rows for every corpus ontology', () => {
    const oracle: LayersRow[] = []
    const lens: LayersRow[] = []
    for (const { aggregate, personaId } of CORPUS) {
      oracle.push(...taggedRows(oracleRows(aggregate, personaId)))
      lens.push(...taggedRows(foveaOntologyToLayersRows(aggregate, personaId, META, SCOPE)))
    }
    assertOracleParity(oracle, lens)
  })

  it('composes the gloss stand-off with deterministic-id cross-refs', () => {
    const rows = foveaOntologyToLayersRows(RICH, 'persona-1', META, SCOPE)
    // The rich ontology has three reference-bearing glosses (Person, Reporting,
    // coauthorOf); each yields one Expression + one span AnnotationLayer.
    expect(rows.glossExpressions).toHaveLength(3)
    expect(rows.glossLayers).toHaveLength(3)
    // Every gloss annotation joins its span layer, whose expression it shares.
    for (const layer of rows.glossLayers) {
      const expression = rows.glossExpressions.find((e) => e.id === layer.expressionId)
      expect(expression).toBeDefined()
      expect(expression?.sourceKind).toBe('ontology-gloss')
      expect(layer.subkind).toBe('gloss')
    }
    // The Person typeRef segment sets ontologyTypeRefId; the objectRef/claimRef
    // segments point at their target via arguments.
    const labels = rows.glossAnnotations.map((a) => a.label).sort()
    expect(labels).toEqual(['claimRef', 'objectRef', 'typeRef', 'typeRef'])
    const typeRef = rows.glossAnnotations.find((a) => a.label === 'typeRef')
    expect(typeRef?.ontologyTypeRefId).toBe('entity-journalist')
    const claimRef = rows.glossAnnotations.find((a) => a.label === 'claimRef')
    expect(claimRef?.arguments).toEqual([{ role: 'denotes', target: { localId: { value: 'claim-9' } } }])
  })

  it('reconstructs identically to the oracle backward mapper from the composed rows', () => {
    for (const { name, aggregate, personaId } of CORPUS) {
      const fromOracle = reconstructionInputs(oracleRows(aggregate, personaId), personaId)
      const fromLens = reconstructionInputs(foveaOntologyToLayersRows(aggregate, personaId, META, SCOPE), personaId)
      const reconstructedOracle = layersToOntology(fromOracle.typeDefRows, fromOracle.glossMap)
      const reconstructedLens = layersToOntology(fromLens.typeDefRows, fromLens.glossMap)
      expect(reconstructedLens, `reconstruction for ${name}`).toEqual(reconstructedOracle)
    }
  })

  it('round-trips the rich ontology gloss references through reconstruction', () => {
    const { typeDefRows, glossMap } = reconstructionInputs(
      foveaOntologyToLayersRows(RICH, 'persona-1', META, SCOPE),
      'persona-1',
    )
    const reconstructed = layersToOntology(typeDefRows, glossMap)
    // The Person entity's gloss recovers its typeRef segment (content + refType).
    const person = reconstructed.entityTypes[0] as { name: string; gloss: GlossItem[] }
    expect(person.name).toBe('Person')
    const typeRef = person.gloss.find((g) => g.type === 'typeRef')
    expect(typeRef).toMatchObject({ type: 'typeRef', content: 'entity-journalist', refType: 'entity', refPersonaId: 'persona-1' })
  })

  it('recovers an ontology relation instance from its native graph edge', () => {
    // Relation instances have no lens-expressible transform: the endpoint ids ride
    // verbatim on the graph edge and are read straight back by the oracle.
    const relation = edgeToOntologyRelation({
      edgeType: 'rel1',
      sourceLocalId: 'ent-nyt',
      targetLocalId: 'evt-election',
    })
    expect(relation).toEqual({
      id: relation?.id,
      relationTypeId: 'rel1',
      sourceType: '',
      sourceId: 'ent-nyt',
      targetType: '',
      targetId: 'evt-election',
    })
  })
})
