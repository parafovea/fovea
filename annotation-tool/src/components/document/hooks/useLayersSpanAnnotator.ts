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
  rowsToSpans,
  toTokenizedElement,
  type SpanLabelResolvers,
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
  /** Delete a span by id. */
  onDeleteSpan: (spanId: string) => void
  /** Create a relation from the relation builder. */
  onCreateRelation: (commit: RelationDraftCommit) => void
  /** Delete a relation by id. */
  onDeleteRelation: (relationId: string) => void
}

/** Finds the span layer for a persona, or the first span layer, in a detail graph. */
function findSpanLayer(
  layers: LayersAnnotationLayerRow[],
  personaId?: string | null,
): LayersAnnotationLayerRow | undefined {
  const spanLayers = layers.filter((layer) => layer.kind === 'span')
  if (personaId) {
    return spanLayers.find((layer) => layer.personaId === personaId) ?? spanLayers[0]
  }
  return spanLayers[0]
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
 * @returns the annotator's data, load status, and persistence handlers
 */
export function useLayersSpanAnnotator(
  expressionUri: string | undefined,
  personaId?: string | null,
): LayersSpanAnnotatorController {
  const { data: detail, isLoading, isError } = useLayersAnnotations(expressionUri)
  const { data: ontology } = usePersonaOntology(personaId)
  const ability = useAbility()

  const upsertLayer = useUpsertLayer()
  const upsertAnnotation = useUpsertLayersAnnotation()
  const deleteAnnotation = useDeleteLayersAnnotation()
  const createRelation = useCreateLayersRelation()
  const deleteRelation = useDeleteLayersRelation()

  const spanLayerPromiseRef = useRef<Promise<string> | null>(null)
  const relationLayerPromiseRef = useRef<Promise<string> | null>(null)

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
    const names = new Map<string, string>()
    for (const type of ontology?.entities ?? []) names.set(type.id, type.name)
    for (const type of ontology?.roles ?? []) names.set(type.id, type.name)
    for (const type of ontology?.events ?? []) names.set(type.id, type.name)
    return { typeName: (id) => names.get(id) }
  }, [ontology])

  const layers = useMemo(() => detail?.annotationLayers ?? [], [detail])
  const spanLayer = findSpanLayer(layers, personaId)
  const relationLayer = findRelationLayer(layers, personaId)

  const spans = useMemo<TextSpan[]>(() => {
    if (!spanLayer || !tokenizationId) return []
    return rowsToSpans(spanLayer.annotations, tokenizationId, resolvers)
  }, [spanLayer, tokenizationId, resolvers])

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

  const ensureSpanLayerId = useCallback(async (): Promise<string> => {
    if (spanLayer) return spanLayer.id
    if (!expressionUri || !detail) throw new Error('Expression not loaded')
    if (!spanLayerPromiseRef.current) {
      spanLayerPromiseRef.current = upsertLayer
        .mutateAsync({
          expressionUri,
          input: {
            expressionId: detail.id,
            kind: 'span',
            sourceMethod: 'manual',
            tokenizationId,
            personaId: personaId ?? null,
          },
        })
        .then((row) => row.id)
        .finally(() => {
          spanLayerPromiseRef.current = null
        })
    }
    return spanLayerPromiseRef.current
  }, [spanLayer, expressionUri, detail, upsertLayer, tokenizationId, personaId])

  const ensureRelationLayerId = useCallback(async (): Promise<string> => {
    if (relationLayer) return relationLayer.id
    if (!expressionUri || !detail) throw new Error('Expression not loaded')
    if (!relationLayerPromiseRef.current) {
      relationLayerPromiseRef.current = upsertLayer
        .mutateAsync({
          expressionUri,
          input: {
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
      void ensureSpanLayerId().then((layerId) => {
        upsertAnnotation.mutate({
          expressionUri,
          input: {
            layerId,
            tokenizationId,
            anchor: {
              tokenRefSequence: { tokenIndexes: indexes, tokenizationId: { value: tokenizationId } },
            },
            label: draft.option.label,
            ontologyTypeRefId: draft.mode === 'type' ? draft.option.id : undefined,
            denotesNodeId: draft.mode === 'object' ? draft.option.id : undefined,
          },
        })
      })
    },
    [expressionUri, tokenizationId, ensureSpanLayerId, upsertAnnotation],
  )

  const onDeleteSpan = useCallback(
    (spanId: string) => {
      if (!expressionUri) return
      deleteAnnotation.mutate({ expressionUri, annotationId: spanId })
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
    onCreateRelation,
    onDeleteRelation,
  }
}
