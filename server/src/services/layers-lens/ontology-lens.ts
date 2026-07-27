/**
 * The FOVEA persona-ontology surface as a `@panproto/core` lens plus a
 * multi-record composition and a record<->row adapter.
 *
 * A persona ontology projects onto a `pub.layers.ontology.ontology` record, one
 * `pub.layers.ontology.typeDef` per declared type, and — for every type whose
 * gloss carries reference segments — a gloss STAND-OFF: a derived
 * `pub.layers.expression.expression` holding the flattened gloss text, a span
 * `pub.layers.annotation.annotationLayer` over that text, and one
 * `pub.layers.annotation.defs#annotation` per reference segment. This module
 * builds all of them from the persona-ontology aggregate and distributes them to
 * the Prisma-row shape the persistence boundary uses, wiring the cross-record
 * references (the ontology id, the derived TypeDef row id, the gloss expression /
 * layer ids) by deterministic id.
 *
 * The value/structure transform at the heart of the surface is the per-gloss-
 * reference-segment regroup: the view-model carries each gloss segment's span as
 * flat integer `byteStart/byteEnd/charStart/charEnd`, and the layers span
 * annotation nests that span under an `anchor.textSpan`. {@link buildGlossRegroupLens}
 * authors that regroup as a panproto lens document (a `compute_field` anchored at
 * the gloss-segment item vertex) whose round-trip laws hold and whose complement
 * requirement is empty; the lens is the verified specification of the regroup.
 * {@link composeGlossStandoff} applies the same regroup to move data, because the
 * installed `@panproto/core` (0.65.0) does not surface a value-transform lens's
 * output to JavaScript — see {@link GLOSS_REGROUP_LENS_DOC} and the surrounding
 * notes.
 *
 * The `typeDef` and `ontology` records carry no per-array-item structural
 * transform a lens step can express: a type's `allowedRoles`, `knowledgeRefs`, and
 * `features` are each folded from an array of child objects up onto the parent
 * record, and the gloss-text flatten joins the segments, so all four are resolved
 * by the composition rather than a lens (a parent-level fold over an array of
 * child objects is not expressible at panproto 0.65). The gloss segment byte/char
 * offsets are likewise a running fold over the preceding segments and are resolved
 * before the lens, which then only nests them.
 *
 * @module
 */

import { z } from 'zod'

import type { GlossItem } from '@models/types.js'

import {
  deriveId,
  glossExpressionId,
  glossLayerId,
  glossRefAnnotationId,
  layersOntologyForPersonaId,
} from '../layers-id-map.js'
import { getPanproto, loadFoveaSchema } from './panproto-registry.js'
import type { LensHandle, ProtolensChainHandle } from '@panproto/core'
import type {
  GlossStandoff,
  MappedGlossAnnotation,
  MappedOntology,
  MappedTypeDef,
  OntologyLayersScope,
  OntologyMeta,
  PersonaOntologyAggregate,
} from '../ontology-layers-mapper.js'

// --------------------------------------------------------------------------
// Ontology view-model (the composition source)
// --------------------------------------------------------------------------

/** The four type buckets, paired with the layers type kind each maps to. */
const TYPE_BUCKETS = [
  ['entityTypes', 'entity-type'],
  ['eventTypes', 'situation-type'],
  ['roleTypes', 'role-type'],
  ['relationTypes', 'relation-type'],
] as const

type TypeBucket = (typeof TYPE_BUCKETS)[number][0]

/**
 * The reserved roleName of the sentinel roleSlot that carries a type's declared
 * constraints when the type has no natural argument slot (entity / role / relation
 * types). The leading NUL keeps it from colliding with a real role name.
 */
const CONSTRAINT_SLOT = '\u0000fovea:constraints'

/** The reserved roleNames of a relation type's domain and range slots. */
const SOURCE_SLOT = ' fovea:source'
const TARGET_SLOT = ' fovea:target'

/** OWL property-class identifiers grounding a relation type's algebraic flags. */
const OWL_SYMMETRIC = 'owl:SymmetricProperty'
const OWL_TRANSITIVE = 'owl:TransitiveProperty'
const OWL_URI: Record<string, string> = {
  [OWL_SYMMETRIC]: 'http://www.w3.org/2002/07/owl#SymmetricProperty',
  [OWL_TRANSITIVE]: 'http://www.w3.org/2002/07/owl#TransitiveProperty',
}

/** The expression `kind` and `sourceKind` a gloss expression carries. */
const GLOSS_EXPRESSION_KIND = 'phrase'
const GLOSS_SOURCE_KIND = 'ontology-gloss'

/** The expression format each FOVEA constraint variant serializes under. */
const CONSTRAINT_FORMAT: Record<string, string> = {
  allowedTypes: 'type-ref',
  requiredProperties: 'json-logic',
  valueRange: 'json-logic',
}

/** The derived TypeDef row id a (ontology, kind, original id) triple fans out from. */
export function typeDefRowId(ontologyId: string, typeKind: string, originalId: string): string {
  return deriveId('typedef', ontologyId, typeKind, originalId)
}

// --- small readers ----------------------------------------------------------

/** Reads a JSON value expected to hold an array, tolerating null/non-array. */
function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

/** Reads a string field, returning null when absent or non-string. */
function stringField(object: Record<string, unknown>, key: string): string | null {
  const value = object[key]
  return typeof value === 'string' ? value : null
}

/** Reads a type's gloss field as a GlossItem[], tolerating null/non-array. */
function glossItemsOf(object: Record<string, unknown>): GlossItem[] {
  const gloss = object.gloss
  return Array.isArray(gloss) ? (gloss as GlossItem[]) : []
}

/**
 * Flattens a gloss (rich-text/reference segments) to plain text by concatenating
 * each segment's content. Returns null for an empty or absent gloss.
 */
function glossToText(gloss: GlossItem[]): string | null {
  if (gloss.length === 0) return null
  const text = gloss.map((segment) => (typeof segment.content === 'string' ? segment.content : '')).join('')
  return text.length > 0 ? text : null
}

/** True when a gloss carries at least one non-text (reference) segment. */
function hasReferenceSegments(gloss: GlossItem[]): boolean {
  return gloss.some((segment) => segment.type !== 'text')
}

// --------------------------------------------------------------------------
// The gloss reference-segment regroup lens
// --------------------------------------------------------------------------

/**
 * The Zod schema for the gloss regroup's source: the flattened gloss text and each
 * segment carrying its span as flat integer offsets. The lens only restructures the
 * offsets; the text and the surrounding annotation scalars pass through.
 */
export const glossRegroupSourceSchema = z.object({
  glossText: z.string(),
  segments: z.array(
    z.object({
      label: z.string(),
      text: z.string(),
      byteStart: z.number().int(),
      byteEnd: z.number().int(),
      charStart: z.number().int(),
      charEnd: z.number().int(),
    }),
  ),
})

/**
 * The lens document for the per-segment regroup: anchored at the gloss-segment
 * item vertex, it computes an `anchor` record nesting the item's flat
 * `byteStart/byteEnd/charStart/charEnd` under a `textSpan`. This is the ontology
 * surface's core value/structure transform expressed as a panproto lens — its
 * round-trip laws hold and its complement requirement is empty (native).
 *
 * The offset nesting is the only part of the gloss->span-annotation mapping a
 * gloss-item lens step can express: the running byte/char offsets are already
 * resolved onto the item, and the label/text/ontologyTypeRef/arguments/features
 * are resolved by the composition (see {@link composeGlossStandoff}). A value-
 * derived scalar such as `ontologyTypeRefId` (a projection of the segment kind) is
 * not an invertible lens step — adding it breaks PutGet — so it is composed.
 */
export const GLOSS_REGROUP_LENS_DOC = {
  id: 'fovea.ontology.gloss-regroup.v1',
  source: 'fovea.ontology.gloss',
  target: 'pub.layers.annotation.annotationLayer',
  steps: [
    {
      compute_field: {
        target: 'anchor',
        expr: '{ textSpan = { byteStart = byteStart, byteEnd = byteEnd, charStart = charStart, charEnd = charEnd } }',
      },
    },
  ],
} as const

/** The body vertex the regroup binds to: each gloss segment array item. */
export const GLOSS_REGROUP_BODY_VERTEX = 'root.segments:items'

/** A compiled gloss regroup lens with its schema-independent chain. */
export interface GlossRegroupLens {
  /** The schema-independent compiled chain. */
  chain: ProtolensChainHandle
  /** The chain instantiated at the view-model source schema. */
  lens: LensHandle
  /** The complement-requirement kind at the source schema (`empty` is native). */
  requirementKind: string
  /** The field transforms the chain carries, keyed by parent vertex. */
  fieldTransforms: Record<string, unknown[]>
}

/**
 * Compiles the gloss regroup lens against the view-model source schema and reports
 * its native-ness signals. The returned {@link GlossRegroupLens.lens} answers
 * `checkGetPut`/`checkPutGet` for a parsed source record.
 *
 * @returns the compiled chain, the instantiated lens, and its native-ness signals
 */
export async function buildGlossRegroupLens(): Promise<GlossRegroupLens> {
  const p = await getPanproto()
  const source = await loadFoveaSchema(glossRegroupSourceSchema)
  const chain = p.compileLensDocument(GLOSS_REGROUP_LENS_DOC, GLOSS_REGROUP_BODY_VERTEX)
  return {
    chain,
    lens: chain.instantiate(source),
    requirementKind: chain.requirements(source).kind,
    fieldTransforms: chain.fieldTransforms(),
  }
}

// --------------------------------------------------------------------------
// Gloss stand-off composition (the lens-driven surface)
// --------------------------------------------------------------------------

/** A gloss segment resolved for the regroup: flat offsets plus the ref scalars. */
interface GlossSegment {
  /** The segment kind (`text`/`typeRef`/`objectRef`/`annotationRef`/`claimRef`). */
  label: GlossItem['type']
  /** The segment's surface content. */
  text: string
  byteStart: number
  byteEnd: number
  charStart: number
  charEnd: number
  /** The segment's index among all gloss segments (the annotation id fans off it). */
  index: number
  refType: string | null
  refPersonaId: string | null
  refClaimId: string | null
}

/**
 * Resolves a gloss into its flattened text and its segments carrying flat byte/
 * char offsets, folding the running cursors over every segment (text and
 * reference alike) so the offsets match the flattened text. The fold is resolved
 * here, before the lens, because a running offset over the preceding segments is
 * not expressible as a per-item lens step.
 *
 * @param gloss - the type's gloss segments
 * @returns the flattened text and the segments with resolved offsets
 */
function toGlossSegments(gloss: GlossItem[]): { text: string | null; segments: GlossSegment[] } {
  const text = glossToText(gloss)
  const segments: GlossSegment[] = []
  let charCursor = 0
  let byteCursor = 0
  gloss.forEach((segment, index) => {
    const content = typeof segment.content === 'string' ? segment.content : ''
    const charStart = charCursor
    const byteStart = byteCursor
    charCursor += content.length
    byteCursor += Buffer.byteLength(content, 'utf8')
    segments.push({
      label: segment.type,
      text: content,
      byteStart,
      byteEnd: byteCursor,
      charStart,
      charEnd: charCursor,
      index,
      refType: typeof segment.refType === 'string' ? segment.refType : null,
      refPersonaId: segment.refPersonaId != null ? segment.refPersonaId : null,
      refClaimId: typeof segment.refClaimId === 'string' ? segment.refClaimId : null,
    })
  })
  return { text, segments }
}

/** The flat gloss-segment shape the regroup lens binds to. */
export interface GlossRegroupSegment {
  label: string
  text: string
  byteStart: number
  byteEnd: number
  charStart: number
  charEnd: number
}

/**
 * Builds the gloss regroup lens's source record from a gloss: the flattened text
 * and every segment (text and reference alike) carrying its flat span offsets. The
 * lens binds to `segments:items`, so its round-trip laws range over each segment.
 *
 * @param gloss - the type's gloss segments
 * @returns the regroup source record
 */
export function glossRegroupSourceRecord(gloss: GlossItem[]): { glossText: string; segments: GlossRegroupSegment[] } {
  const { text, segments } = toGlossSegments(gloss)
  return {
    glossText: text ?? '',
    segments: segments.map((s) => ({
      label: s.label,
      text: s.text,
      byteStart: s.byteStart,
      byteEnd: s.byteEnd,
      charStart: s.charStart,
      charEnd: s.charEnd,
    })),
  }
}

/**
 * Nests a resolved gloss segment's flat offsets under an `anchor.textSpan`. This is
 * the executable image of {@link GLOSS_REGROUP_LENS_DOC}: the lens verifies the
 * regroup is a lawful bidirectional transform, and this reproduces it to move data,
 * because `@panproto/core` 0.65.0 does not surface a `compute_field` lens's output
 * to JavaScript (its `get` view retains the source structure).
 *
 * @param segment - the resolved gloss segment
 * @returns the span annotation's textSpan anchor
 */
function anchorFromSegment(segment: GlossSegment): { textSpan: { byteStart: number; byteEnd: number; charStart: number; charEnd: number } } {
  return {
    textSpan: {
      byteStart: segment.byteStart,
      byteEnd: segment.byteEnd,
      charStart: segment.charStart,
      charEnd: segment.charEnd,
    },
  }
}

/**
 * Projects a type's gloss onto stand-off rows, or null when the gloss carries no
 * reference segments (a text-only gloss round-trips from the type's flattened
 * `gloss` text alone).
 *
 * Each reference segment becomes one span annotation anchored by the regrouped
 * byte/char offsets: a `typeRef` sets `ontologyTypeRefId` and carries its
 * refType/refPersonaId as flat features; object/claim/annotation refs point at
 * their target through `arguments`.
 *
 * @param rowId - the derived TypeDef row id the gloss ids fan out from
 * @param gloss - the type's gloss segments
 * @param ontologyId - the owning ontology, bound onto the span layer
 * @param personaId - the persona whose ontology owns the layer
 * @param scope - the scope columns every produced row carries
 * @returns the stand-off rows, or null for a text-only or empty gloss
 */
export function composeGlossStandoff(
  rowId: string,
  gloss: GlossItem[],
  ontologyId: string,
  personaId: string,
  scope: OntologyLayersScope,
): GlossStandoff | null {
  const { text, segments } = toGlossSegments(gloss)
  if (text === null || !hasReferenceSegments(gloss)) return null

  const expressionId = glossExpressionId(rowId)
  const layerId = glossLayerId(rowId)

  const annotations: MappedGlossAnnotation[] = []
  for (const segment of segments) {
    if (segment.label === 'text') continue

    const featureEntries: Array<{ key: string; value: string }> = []
    if (segment.refType !== null) featureEntries.push({ key: 'fovea.refType', value: segment.refType })
    if (segment.refPersonaId !== null) featureEntries.push({ key: 'fovea.refPersonaId', value: segment.refPersonaId })
    if (segment.refClaimId !== null) featureEntries.push({ key: 'fovea.refClaimId', value: segment.refClaimId })

    const isTypeRef = segment.label === 'typeRef'
    annotations.push({
      id: glossRefAnnotationId(rowId, segment.index),
      layerId,
      anchor: anchorFromSegment(segment),
      label: segment.label,
      text: segment.text,
      ontologyTypeRefId: isTypeRef ? segment.text : null,
      arguments: isTypeRef
        ? null
        : [{ role: 'denotes', target: { localId: { value: segment.refClaimId ?? segment.text } } }],
      features: featureEntries.length > 0 ? { entries: featureEntries } : null,
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    })
  }

  return {
    expression: {
      id: expressionId,
      layersId: expressionId,
      kind: GLOSS_EXPRESSION_KIND,
      text,
      sourceKind: GLOSS_SOURCE_KIND,
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    },
    layer: {
      id: layerId,
      expressionId,
      kind: 'span',
      subkind: 'gloss',
      ontologyId,
      personaId,
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    },
    annotations,
  }
}

// --------------------------------------------------------------------------
// TypeDef derivations (composed: parent-level folds, not lens-expressible)
// --------------------------------------------------------------------------

/** A layers constraint value-object. */
interface Constraint {
  expression: string
  expressionFormat: string
  scope?: string
  context?: string[]
  description?: string
}

/** A layers roleSlot value-object. */
interface RoleSlot {
  roleName: string
  required?: boolean
  constraints?: Constraint[]
  features?: { entries: Array<{ key: string; value: string }> }
}

/** A layers knowledgeRef value-object. */
interface KnowledgeRef {
  source: string
  identifier: string
  uri?: string
  label?: string
}

/** Projects one FOVEA type constraint onto a layers constraint value-object. */
function typeConstraintToConstraint(type: string, value: unknown): Constraint {
  return {
    expression: JSON.stringify(value),
    expressionFormat: CONSTRAINT_FORMAT[type] ?? 'json-logic',
    scope: 'slot',
    description: type,
  }
}

/** Coerces a raw constraint object to a layers constraint value-object, or null. */
function constraintOf(raw: Record<string, unknown>): Constraint | null {
  const type = stringField(raw, 'type')
  if (type !== 'allowedTypes' && type !== 'requiredProperties' && type !== 'valueRange') return null
  return typeConstraintToConstraint(type, raw.value)
}

/** A relation type's domain/range roleSlot enumerating its allowed kinds. */
function domainRoleSlot(roleName: string, kinds: unknown): RoleSlot {
  const list = Array.isArray(kinds) ? (kinds as string[]) : []
  return {
    roleName,
    constraints: [{ expression: JSON.stringify(list), expressionFormat: 'type-ref', scope: 'slot', description: 'domain' }],
  }
}

/**
 * Projects one event role onto a layers roleSlot: the role type's name labels the
 * slot (the id is kept in features for exact recovery), optionality inverts to
 * `required`, and cardinality/exclusion become constraint value-objects.
 */
function eventRoleToRoleSlot(role: Record<string, unknown>, roleTypeName: string | null): RoleSlot {
  const constraints: Constraint[] = []
  const minOccurrences = typeof role.minOccurrences === 'number' ? role.minOccurrences : undefined
  const maxOccurrences = typeof role.maxOccurrences === 'number' ? role.maxOccurrences : undefined
  if (minOccurrences !== undefined || maxOccurrences !== undefined) {
    const cardinality: { min?: number; max?: number } = {}
    if (minOccurrences !== undefined) cardinality.min = minOccurrences
    if (maxOccurrences !== undefined) cardinality.max = maxOccurrences
    constraints.push({
      expression: JSON.stringify(cardinality),
      expressionFormat: 'json-logic',
      scope: 'slot',
      description: 'cardinality',
    })
  }
  const excludes = Array.isArray(role.excludes) ? (role.excludes as string[]) : []
  if (excludes.length > 0) {
    constraints.push({
      expression: JSON.stringify(excludes),
      expressionFormat: 'json-logic',
      scope: 'slot',
      context: excludes,
      description: 'excludes',
    })
  }
  const roleTypeId = stringField(role, 'roleTypeId') ?? ''
  const slot: RoleSlot = {
    roleName: roleTypeName ?? roleTypeId,
    required: role.optional !== true,
    features: { entries: [{ key: 'fovea.roleTypeId', value: roleTypeId }] },
  }
  if (constraints.length > 0) slot.constraints = constraints
  return slot
}

/** The allowedRoles roleSlot[] and allowedValues a type projects to. */
function rolesAndValuesFor(
  bucket: TypeBucket,
  type: Record<string, unknown>,
  roleTypeNames: Map<string, string>,
): { allowedRoles: RoleSlot[] | null; allowedValues: string[] | null } {
  const roleSlots: RoleSlot[] = []
  let allowedValues: string[] | null = null

  if (bucket === 'eventTypes') {
    for (const role of asArray(type.roles)) {
      const roleTypeId = stringField(role, 'roleTypeId') ?? ''
      roleSlots.push(eventRoleToRoleSlot(role, roleTypeNames.get(roleTypeId) ?? null))
    }
  } else if (bucket === 'roleTypes') {
    if (Array.isArray(type.allowedFillerTypes)) allowedValues = type.allowedFillerTypes as string[]
  } else if (bucket === 'relationTypes') {
    roleSlots.push(domainRoleSlot(SOURCE_SLOT, type.sourceTypes))
    roleSlots.push(domainRoleSlot(TARGET_SLOT, type.targetTypes))
  }

  const constraints = asArray(type.constraints)
    .map((raw) => constraintOf(raw))
    .filter((c): c is Constraint => c !== null)
  if (constraints.length > 0) {
    roleSlots.push({ roleName: CONSTRAINT_SLOT, constraints })
  }

  return { allowedRoles: roleSlots.length > 0 ? roleSlots : null, allowedValues }
}

/**
 * Builds a type's knowledgeRefs from its wikidata/wikibase identifiers and, for
 * relation types, its OWL algebraic-property groundings. Returns null when the type
 * grounds to nothing.
 */
function knowledgeRefsFor(type: Record<string, unknown>, bucket: TypeBucket): KnowledgeRef[] | null {
  const refs: KnowledgeRef[] = []
  const wikidataId = stringField(type, 'wikidataId')
  if (wikidataId) {
    const ref: KnowledgeRef = { source: 'wikidata', identifier: wikidataId }
    const url = stringField(type, 'wikidataUrl')
    if (url) ref.uri = url
    refs.push(ref)
  }
  const wikibaseId = stringField(type, 'wikibaseId')
  if (wikibaseId) refs.push({ source: 'custom', identifier: wikibaseId, label: 'wikibase' })
  if (bucket === 'relationTypes') {
    if (type.symmetric === true) refs.push({ source: 'custom', identifier: OWL_SYMMETRIC, uri: OWL_URI[OWL_SYMMETRIC] })
    if (type.transitive === true) refs.push({ source: 'custom', identifier: OWL_TRANSITIVE, uri: OWL_URI[OWL_TRANSITIVE] })
  }
  return refs.length > 0 ? refs : null
}

/**
 * Builds a TypeDef's flat-scalar `features`: the original type id, its bucket
 * ordinal (for stable order), and the open provenance scalars (sharedTypeId,
 * examples, import provenance).
 */
function typeFeatures(type: Record<string, unknown>, originalId: string, ordinal: number): Record<string, unknown> {
  const features: Record<string, unknown> = { typeId: originalId, ordinal }
  const sharedTypeId = stringField(type, 'sharedTypeId')
  if (sharedTypeId) features.sharedTypeId = sharedTypeId
  const importedFrom = stringField(type, 'importedFrom')
  if (importedFrom) features.importedFrom = importedFrom
  const importedAt = stringField(type, 'importedAt')
  if (importedAt) features.importedAt = importedAt
  if (Array.isArray(type.examples) && type.examples.length > 0) features.examples = type.examples
  return features
}

// --------------------------------------------------------------------------
// Multi-record composition
// --------------------------------------------------------------------------

/**
 * The layers records a persona ontology composes into: one LayersOntology, one
 * TypeDef per declared type (each keyed by its original id, with the derived row
 * id its gloss stand-off fans off), and the gloss stand-off rows for every type
 * whose gloss carries reference segments.
 */
export interface OntologyLayersRecords {
  /** The LayersOntology record. */
  ontology: MappedOntology
  /** One TypeDef per declared type, in bucket then declaration order. */
  typeDefs: MappedTypeDef[]
  /** The gloss stand-off rows, one entry per reference-bearing type gloss. */
  glossStandoffs: GlossStandoff[]
}

/**
 * Composes a persona ontology into its layers records: the LayersOntology, a
 * TypeDef per declared type, and the gloss stand-off (Expression + span layer +
 * reference annotations) for every reference-bearing type gloss. The gloss
 * stand-off ids fan off the derived TypeDef row id ({@link typeDefRowId}), so a
 * re-composition of the same ontology reuses the same rows.
 *
 * @param aggregate - the four type-array buckets
 * @param personaId - the persona the ontology belongs to
 * @param meta - the persona-derived ontology metadata
 * @param scope - the scope columns every produced row carries
 * @returns the composed layers records
 */
export function composeOntologyRecords(
  aggregate: PersonaOntologyAggregate,
  personaId: string,
  meta: OntologyMeta,
  scope: OntologyLayersScope,
): OntologyLayersRecords {
  const ontologyId = layersOntologyForPersonaId(personaId)

  // Role type id -> name, so an event role slot can carry the role's label.
  const roleTypeNames = new Map<string, string>()
  for (const raw of asArray(aggregate.roleTypes)) {
    const id = stringField(raw, 'id')
    const name = stringField(raw, 'name')
    if (id && name) roleTypeNames.set(id, name)
  }

  const typeDefs: MappedTypeDef[] = []
  const glossStandoffs: GlossStandoff[] = []
  for (const [bucket, typeKind] of TYPE_BUCKETS) {
    const types = asArray(aggregate[bucket])
    types.forEach((type, index) => {
      const id = stringField(type, 'id')
      if (id === null) return
      const { allowedRoles, allowedValues } = rolesAndValuesFor(bucket, type, roleTypeNames)
      const gloss = glossItemsOf(type)
      typeDefs.push({
        id,
        ontologyId,
        name: stringField(type, 'name') ?? '',
        typeKind,
        gloss: glossToText(gloss),
        glossItems: gloss,
        parentTypeId: bucket === 'eventTypes' ? stringField(type, 'parentEventId') : null,
        allowedRoles,
        allowedValues,
        knowledgeRefs: knowledgeRefsFor(type, bucket),
        features: typeFeatures(type, id, index),
        projectId: scope.projectId,
        createdByUserId: scope.createdByUserId,
      })

      const standoff = composeGlossStandoff(typeDefRowId(ontologyId, typeKind, id), gloss, ontologyId, personaId, scope)
      if (standoff) glossStandoffs.push(standoff)
    })
  }

  return {
    ontology: {
      id: ontologyId,
      name: meta.name,
      description: meta.description,
      domain: meta.domain,
      personaId,
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    },
    typeDefs,
    glossStandoffs,
  }
}

// --------------------------------------------------------------------------
// Record <-> Prisma-row adapter
// --------------------------------------------------------------------------

/** A gloss stand-off flattened to its component Prisma rows. */
export interface OntologyLayersRows {
  ontology: MappedOntology
  typeDefs: MappedTypeDef[]
  glossExpressions: GlossStandoff['expression'][]
  glossLayers: GlossStandoff['layer'][]
  glossAnnotations: MappedGlossAnnotation[]
}

/**
 * Distributes the composed layers records to the Prisma-row shape the persistence
 * boundary uses: the ontology and type-def records ride through unchanged, and each
 * gloss stand-off explodes into its expression row, its span-layer row, and its
 * reference-segment annotation rows.
 *
 * @param records - the composed layers records
 * @returns the flat row set
 */
export function ontologyRecordsToRows(records: OntologyLayersRecords): OntologyLayersRows {
  const glossExpressions: GlossStandoff['expression'][] = []
  const glossLayers: GlossStandoff['layer'][] = []
  const glossAnnotations: MappedGlossAnnotation[] = []
  for (const standoff of records.glossStandoffs) {
    glossExpressions.push(standoff.expression)
    glossLayers.push(standoff.layer)
    glossAnnotations.push(...standoff.annotations)
  }
  return {
    ontology: records.ontology,
    typeDefs: records.typeDefs,
    glossExpressions,
    glossLayers,
    glossAnnotations,
  }
}

/**
 * The end-to-end new path for one persona ontology: compose the layers records and
 * distribute them to rows. Equivalent, row for row, to the committed hand-rolled
 * forward mapper (the oracle: `ontologyToLayers` plus `glossStandoffFor`) — the
 * parity test asserts this over a corpus.
 *
 * @param aggregate - the four type-array buckets
 * @param personaId - the persona the ontology belongs to
 * @param meta - the persona-derived ontology metadata
 * @param scope - the scope columns every produced row carries
 * @returns the flat row set
 */
export function foveaOntologyToLayersRows(
  aggregate: PersonaOntologyAggregate,
  personaId: string,
  meta: OntologyMeta,
  scope: OntologyLayersScope,
): OntologyLayersRows {
  return ontologyRecordsToRows(composeOntologyRecords(aggregate, personaId, meta, scope))
}
