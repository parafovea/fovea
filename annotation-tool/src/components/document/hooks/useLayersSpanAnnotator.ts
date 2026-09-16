/**
 * Binds the span annotator to the layers annotation store for one expression.
 *
 * Loads the expression's detail graph, derives the tokenized element, spans,
 * and relations from its layers, and returns create/delete handlers that write
 * back through the layers mutation hooks. Span and relation layers are created
 * on demand the first time a span or relation is added, so a fresh document
 * needs no preparation step.
 *
 * @module
 */

import { useCallback, useMemo, useRef } from 'react'

import { subject } from '@casl/ability'

import {
  useCreateLayersRelation,
  useDeleteLayersAnnotation,
  useDeleteLayersRelation,
  useLayersAnnotations,
  useUpsertLayer,
  useUpsertLayersAnnotation,
  usePersonaOntology,
  useWorld,
} from '@store/queries'
import type { LayersAnnotationLayerRow } from '@store/queries'
import type { SpanRelation, TextSpan, TokenizedElement } from '@/lib/spans'
import type { RelationType } from '@models/ontology'
import { useAbility } from '@/lib/ability'

import type { RelationDraftCommit, SpanDraft } from '../SpanAnnotator'
import type { SpanLabelOption } from '../SpanLabelPicker'
import {
  pickPrimaryTokenization,
  rowsToRelations,
  rowsToSpanGroups,
  toTokenizedElement,
  type SpanLabelResolvers,
  type TaggedSpanLayer,
} from '../tokenization'

/** The span annotator's data and handlers, sourced from the layers store. */
export interface LayersSpanAnnotatorController {
  /** The load status of the underlying expression. */
  status: 'loading' | 'ready' | 'empty' | 'error'
  /** The tokenized element, or `null` before it loads. */
  element: TokenizedElement | null
  /** The expression text. */
  text: string | null
  /** The spans over the element. */
  spans: TextSpan[]
  /** The relations between spans. */
  relations: SpanRelation[]
  /** The persona's relation types. */
  relationTypes: RelationType[]
  /** Quick labels (the persona's first entity types) applied by digit keys. */
  quickLabels: SpanLabelOption[]
  /**
   * Whether the current user may edit this document's spans. Mirrors the subject
   * the server authorizes annotation writes on, so a viewer who can read but not
   * update these annotations sees the surface read-only.
   */
  canEdit: boolean
  /** Create a span from a label picker choice. */
  onCreateSpan: (draft: SpanDraft) => void
  /** Delete a span and every denotation on its token range. */
  onDeleteSpan: (spanId: string) => void
  /** Delete a single denotation on a span by its backing annotation id. */
  onDeleteLabel: (annotationId: string) => void
  /** Create a relation from the relation builder. */
  onCreateRelation: (commit: RelationDraftCommit) => void
  /** Delete a relation by id. */
  onDeleteRelation: (relationId: string) => void
}

/**
 * Selects the span layers to read spans from and tags each with its persona.
 *
 * By default this reads the active persona's type layer plus the persona-free
 * base layer (which carries span identity and world-object labels), so a span
 * shows its own persona's types and its objects. With `showAllPersonas`, every
 * persona's type layer is included so the same token range surfaces the types
 * assigned across personas.
 */
function readableSpanLayers(
  layers: LayersAnnotationLayerRow[],
  personaId: string | null,
  showAllPersonas: boolean,
): TaggedSpanLayer[] {
  const spanLayers = layers.filter((layer) => layer.kind === 'span')
  const selected = showAllPersonas
    ? spanLayers
    : spanLayers.filter((layer) => layer.personaId == null || layer.personaId === personaId)
  return selected.map((layer) => ({ personaId: layer.personaId ?? null, rows: layer.annotations }))
}

/** Returns a stable client-minted layer id for a scope key, creating one once. */
function stableLayerId(cache: Map<string, string>, key: string): string {
  let id = cache.get(key)
  if (!id) {
    id = crypto.randomUUID()
    cache.set(key, id)
  }
  return id
}

/** Finds the relation layer for a persona, or the first relation layer, in a detail graph. */
function findRelationLayer(
  layers: LayersAnnotationLayerRow[],
  personaId?: string | null,
): LayersAnnotationLayerRow | undefined {
  const relationLayers = layers.filter((layer) => layer.kind === 'relation')
  if (personaId) {
    return relationLayers.find((layer) => layer.personaId === personaId) ?? relationLayers[0]
  }
  return relationLayers[0]
}

/**
 * Wires the span annotator to one expression's layers annotations.
 *
 * @param expressionUri - the expression id/uri to annotate; disables the hook when absent
 * @param personaId - the active persona, scoping layers and backing type labels
 * @param showAllPersonas - when `true`, read every persona's type labels, not just the active one's
 * @returns the annotator's data, load status, and persistence handlers
 */
export function useLayersSpanAnnotator(
  expressionUri: string | undefined,
  personaId?: string | null,
  showAllPersonas = false,
): LayersSpanAnnotatorController {
  const { data: detail, isLoading, isError } = useLayersAnnotations(expressionUri)
  const { data: ontology } = usePersonaOntology(personaId)
  const { data: world } = useWorld()
  const ability = useAbility()

  const upsertLayer = useUpsertLayer()
  const upsertAnnotation = useUpsertLayersAnnotation()
  const deleteAnnotation = useDeleteLayersAnnotation()
  const createRelation = useCreateLayersRelation()
  const deleteRelation = useDeleteLayersRelation()

  const personaLayerPromiseRef = useRef<Promise<string> | null>(null)
  const baseLayerPromiseRef = useRef<Promise<string> | null>(null)
  const relationLayerPromiseRef = useRef<Promise<string> | null>(null)
  const spanLayerIdRef = useRef<Map<string, string>>(new Map())
  const relationLayerIdRef = useRef<Map<string, string>>(new Map())

  const tokenization = useMemo(
    () => (detail ? pickPrimaryTokenization(detail.tokenizations) : null),
    [detail],
  )
  const tokenizationId = tokenization?.id ?? null

  const element = useMemo<TokenizedElement | null>(
    () => (tokenization ? toTokenizedElement(tokenization, detail?.text) : null),
    [tokenization, detail?.text],
  )

  const resolvers = useMemo<SpanLabelResolvers>(() => {
    const typeNames = new Map<string, string>()
    for (const type of ontology?.entities ?? []) typeNames.set(type.id, type.name)
    for (const type of ontology?.roles ?? []) typeNames.set(type.id, type.name)
    for (const type of ontology?.events ?? []) typeNames.set(type.id, type.name)
    const objectNames = new Map<string, string>()
    for (const entity of world?.entities ?? []) objectNames.set(entity.id, entity.name)
    for (const event of world?.events ?? []) objectNames.set(event.id, event.name)
    for (const time of world?.times ?? []) if (time.label) objectNames.set(time.id, time.label)
    return { typeName: (id) => typeNames.get(id), objectName: (id) => objectNames.get(id) }
  }, [ontology, world])

  const layers = useMemo(() => detail?.annotationLayers ?? [], [detail])
  const relationLayer = findRelationLayer(layers, personaId)

  // The persona's own type layer, and the persona-free base layer holding span
  // identity plus world-object labels: types route to the former, objects to the
  // latter (a persona-scoped layer would drop the object's world-node ref).
  const personaSpanLayer = useMemo(
    () => (personaId ? layers.find((l) => l.kind === 'span' && l.personaId === personaId) : undefined),
    [layers, personaId],
  )
  const baseSpanLayer = useMemo(
    () => layers.find((l) => l.kind === 'span' && l.personaId == null),
    [layers],
  )
  const spanLayer = personaSpanLayer ?? baseSpanLayer

  const spanLayerRows = useMemo<TaggedSpanLayer[]>(
    () => readableSpanLayers(layers, personaId ?? null, showAllPersonas),
    [layers, personaId, showAllPersonas],
  )

  const spans = useMemo<TextSpan[]>(() => {
    if (!tokenizationId) return []
    return rowsToSpanGroups(spanLayerRows, tokenizationId, resolvers)
  }, [spanLayerRows, tokenizationId, resolvers])

  // Every backing annotation id per span group, so deleting a span removes its
  // base placeholder and all of its type/object denotations at once. Held in a
  // ref so the delete callback stays stable across renders.
  const annotationIdsBySpanRef = useRef<Map<string, string[]>>(new Map())
  annotationIdsBySpanRef.current = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const span of spans) {
      const ids = new Set<string>([span.id])
      for (const label of span.labels ?? []) ids.add(label.annotationId)
      map.set(span.id, [...ids])
    }
    return map
  }, [spans])

  const symmetricByTypeId = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const type of ontology?.relationTypes ?? []) map.set(type.id, type.symmetric === true)
    return map
  }, [ontology])

  const relations = useMemo<SpanRelation[]>(
    () => layers.flatMap((layer) => rowsToRelations(layer.relations, symmetricByTypeId)),
    [layers, symmetricByTypeId],
  )

  const relationTypes = ontology?.relationTypes ?? []

  const canEdit = useMemo(() => {
    // A fresh document has no span layer yet; the user will own whatever they
    // create, so annotation is allowed. Once a span layer exists, mirror the
    // subject the server authorizes annotation writes on (a LayersAnnotation
    // scoped by createdByUserId + projectId) and gate on `update`, so a reader
    // who cannot update another user's spans sees them read-only.
    if (!spanLayer) return true
    return ability.can(
      'update',
      subject('LayersAnnotation', {
        createdByUserId: spanLayer.createdByUserId ?? null,
        projectId: spanLayer.projectId ?? null,
      }),
    )
  }, [ability, spanLayer])

  const quickLabels = useMemo<SpanLabelOption[]>(
    () =>
      (ontology?.entities ?? []).slice(0, 9).map((type) => ({
        id: type.id,
        label: type.name,
        category: 'Entity Types',
        type: 'entity',
      })),
    [ontology],
  )

  const ensurePersonaSpanLayerId = useCallback(async (): Promise<string> => {
    if (!personaId) throw new Error('A type label needs an active persona')
    if (personaSpanLayer) return personaSpanLayer.id
    if (!expressionUri || !detail) throw new Error('Expression not loaded')
    if (!personaLayerPromiseRef.current) {
      const clientId = stableLayerId(spanLayerIdRef.current, `${expressionUri}::${personaId}`)
      personaLayerPromiseRef.current = upsertLayer
        .mutateAsync({
          expressionUri,
          input: {
            id: clientId,
            expressionId: detail.id,
            kind: 'span',
            sourceMethod: 'manual',
            tokenizationId,
            personaId,
          },
        })
        .then((row) => row.id)
        .finally(() => {
          personaLayerPromiseRef.current = null
        })
    }
    return personaLayerPromiseRef.current
  }, [personaId, personaSpanLayer, expressionUri, detail, upsertLayer, tokenizationId])

  const ensureBaseSpanLayerId = useCallback(async (): Promise<string> => {
    if (baseSpanLayer) return baseSpanLayer.id
    if (!expressionUri || !detail) throw new Error('Expression not loaded')
    if (!baseLayerPromiseRef.current) {
      const clientId = stableLayerId(spanLayerIdRef.current, `${expressionUri}::base`)
      baseLayerPromiseRef.current = upsertLayer
        .mutateAsync({
          expressionUri,
          input: {
            id: clientId,
            expressionId: detail.id,
            kind: 'span',
            sourceMethod: 'manual',
            tokenizationId,
            personaId: null,
          },
        })
        .then((row) => row.id)
        .finally(() => {
          baseLayerPromiseRef.current = null
        })
    }
    return baseLayerPromiseRef.current
  }, [baseSpanLayer, expressionUri, detail, upsertLayer, tokenizationId])

  const ensureRelationLayerId = useCallback(async (): Promise<string> => {
    if (relationLayer) return relationLayer.id
    if (!expressionUri || !detail) throw new Error('Expression not loaded')
    if (!relationLayerPromiseRef.current) {
      const clientId = stableLayerId(
        relationLayerIdRef.current,
        `${expressionUri}::${personaId ?? ''}`,
      )
      relationLayerPromiseRef.current = upsertLayer
        .mutateAsync({
          expressionUri,
          input: {
            id: clientId,
            expressionId: detail.id,
            kind: 'relation',
            sourceMethod: 'manual',
            tokenizationId,
            personaId: personaId ?? null,
          },
        })
        .then((row) => row.id)
        .finally(() => {
          relationLayerPromiseRef.current = null
        })
    }
    return relationLayerPromiseRef.current
  }, [relationLayer, expressionUri, detail, upsertLayer, tokenizationId, personaId])

  const onCreateSpan = useCallback(
    (draft: SpanDraft) => {
      if (!expressionUri || !tokenizationId) return
      const indexes = [...new Set(draft.segments.flatMap((segment) => segment.tokenIndexes))].sort(
        (a, b) => a - b,
      )
      if (indexes.length === 0) return
      const anchor = {
        tokenRefSequence: { tokenIndexes: indexes, tokenizationId: { value: tokenizationId } },
      }
      // Labeling adds a denotation over the span's range as its own annotation,
      // so a span can carry several types (one per persona) plus a world object.
      // A type routes to the active persona's layer; an object routes to the
      // persona-free base layer, which keeps its world-node ref. A release with
      // no choice persists the bare span (the base placeholder) under its draft
      // id, so the token range stays visible and stable until it is labeled.
      if (draft.option && draft.mode) {
        const isObject = draft.mode === 'object'
        const ensureLayerId = isObject ? ensureBaseSpanLayerId : ensurePersonaSpanLayerId
        void ensureLayerId().then((layerId) => {
          upsertAnnotation.mutate({
            expressionUri,
            input: {
              id: crypto.randomUUID(),
              layerId,
              tokenizationId,
              anchor,
              label: draft.option?.label,
              ontologyTypeRefId: isObject ? undefined : draft.option?.id,
              denotesNodeId: isObject ? draft.option?.id : undefined,
            },
          })
        })
        return
      }
      void ensureBaseSpanLayerId().then((layerId) => {
        upsertAnnotation.mutate({
          expressionUri,
          input: { id: draft.id, layerId, tokenizationId, anchor },
        })
      })
    },
    [expressionUri, tokenizationId, ensureBaseSpanLayerId, ensurePersonaSpanLayerId, upsertAnnotation],
  )

  const onDeleteSpan = useCallback(
    (spanId: string) => {
      if (!expressionUri) return
      const ids = annotationIdsBySpanRef.current.get(spanId) ?? [spanId]
      for (const annotationId of ids) {
        deleteAnnotation.mutate({ expressionUri, annotationId })
      }
    },
    [expressionUri, deleteAnnotation],
  )

  const onDeleteLabel = useCallback(
    (annotationId: string) => {
      if (!expressionUri) return
      deleteAnnotation.mutate({ expressionUri, annotationId })
    },
    [expressionUri, deleteAnnotation],
  )

  const onCreateRelation = useCallback(
    (commit: RelationDraftCommit) => {
      if (!expressionUri) return
      void ensureRelationLayerId().then((layerId) => {
        createRelation.mutate({
          expressionUri,
          input: {
            layerId,
            sourceAnnotationId: commit.sourceSpanId,
            targetAnnotationId: commit.targetSpanId,
            relationTypeRef: { id: commit.relationTypeId },
            label: commit.relationTypeName,
          },
        })
      })
    },
    [expressionUri, ensureRelationLayerId, createRelation],
  )

  const onDeleteRelation = useCallback(
    (relationId: string) => {
      if (!expressionUri) return
      deleteRelation.mutate({ expressionUri, relationId })
    },
    [expressionUri, deleteRelation],
  )

  const status: LayersSpanAnnotatorController['status'] = isError
    ? 'error'
    : isLoading
      ? 'loading'
      : element
        ? 'ready'
        : 'empty'

  return {
    status,
    element,
    text: detail?.text ?? null,
    spans,
    relations,
    relationTypes,
    quickLabels,
    canEdit,
    onCreateSpan,
    onDeleteSpan,
    onDeleteLabel,
    onCreateRelation,
    onDeleteRelation,
  }
}
