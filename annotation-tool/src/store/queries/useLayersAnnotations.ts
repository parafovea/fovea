/**
 * TanStack Query hooks for the layers annotation store: reading an expression's
 * annotation layers (with their annotations and relations) and mutating layers,
 * annotations, and relations.
 *
 * Payload shapes come from `@fovea/layers-schema`; the wire response rows are the
 * flattened database projections the server returns (JSON columns pass through
 * as typed fields). Mutations invalidate the owning expression's detail query so
 * the editing surface refetches the consistent graph.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Anchor } from '@fovea/layers-schema'

import { AppError } from '@lib/errors'
import { logError } from '@services/errorLogging'

/** Parse a fetch error response into an AppError, preserving the server error hierarchy. */
async function parseFetchError(response: Response, fallbackMessage: string): Promise<AppError> {
  let errorData: { error?: string; message?: string; details?: unknown }
  try {
    errorData = await response.json()
  } catch {
    const text = await response.text().catch(() => '')
    errorData = { error: 'FETCH_FAILED', message: text || fallbackMessage }
  }
  return new AppError(
    errorData.error || 'FETCH_FAILED',
    errorData.message || fallbackMessage,
    errorData.details,
  )
}

/** Query key factory for layers annotations, scoped by expression. */
export const layersAnnotationKeys = {
  all: ['layers-annotations'] as const,
  byExpression: (expressionUri: string) =>
    [...layersAnnotationKeys.all, 'expression', expressionUri] as const,
}

// ============= Response shapes =============

/** One layers annotation row as returned by the server (flattened projection). */
export interface LayersAnnotationRow {
  id: string
  layerId: string
  tokenizationId: string | null
  anchor: Anchor | null
  tokenIndex: number | null
  label: string | null
  value: string | null
  text: string | null
  parentAnnotationId: string | null
  childIds: unknown
  headIndex: number | null
  targetIndex: number | null
  arguments: unknown
  confidence: number | null
  ontologyTypeRefId: string | null
  denotesNodeId: string | null
  knowledgeRefs: unknown
  temporal: unknown
  spatial: unknown
  features: unknown
  startMs: number | null
  endMs: number | null
  projectId?: string | null
  createdByUserId?: string | null
  layersUri?: string | null
  createdAt: string
  updatedAt: string
}

/** One text-annotation-relation row (a labeled directed edge between annotations). */
export interface TextAnnotationRelationRow {
  id: string
  layerId: string
  sourceAnnotationId: string
  targetAnnotationId: string
  relationTypeRef: unknown
  label: string | null
  features: unknown
  projectId?: string | null
  createdByUserId?: string | null
  layersUri?: string | null
  createdAt: string
  updatedAt: string
}

/** One annotation layer with its nested annotations and relations. */
export interface LayersAnnotationLayerRow {
  id: string
  expressionId: string
  kind: string
  subkind: string | null
  formalism: string | null
  sourceMethod: string
  labelSet: string | null
  tokenizationId: string | null
  ontologyId: string | null
  parentLayerId: string | null
  personaId: string | null
  metadata: unknown
  features: unknown
  languages: string[]
  projectId?: string | null
  createdByUserId?: string | null
  createdAt: string
  updatedAt: string
  annotations: LayersAnnotationRow[]
  relations: TextAnnotationRelationRow[]
}

/** The full expression detail returned by GET /api/layers/expressions/:id. */
export interface LayersExpressionDetail {
  id: string
  layersId: string
  kind: string
  sourceKind: string
  text: string | null
  languages: string[]
  projectId: string | null
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
  tokenizations: unknown[]
  segmentations: unknown[]
  annotationLayers: LayersAnnotationLayerRow[]
}

// ============= Mutation payloads =============

/** Create/idempotent-update fields for an annotation layer (POST annotation-layers). */
export interface UpsertLayerInput {
  id?: string
  expressionId: string
  kind: string
  subkind?: string | null
  formalism?: string | null
  sourceMethod?: string
  labelSet?: string | null
  tokenizationId?: string | null
  ontologyId?: string | null
  parentLayerId?: string | null
  personaId?: string | null
  metadata?: unknown
  features?: unknown
  languages?: string[]
  layersUri?: string | null
}

/** Create/idempotent-update fields for a layers annotation (POST annotations). */
export interface UpsertAnnotationInput {
  id?: string
  layerId: string
  tokenizationId?: string | null
  anchor?: Anchor
  tokenIndex?: number | null
  label?: string | null
  value?: string | null
  text?: string | null
  parentAnnotationId?: string | null
  childIds?: unknown
  headIndex?: number | null
  targetIndex?: number | null
  arguments?: unknown
  confidence?: number | null
  ontologyTypeRefId?: string | null
  denotesNodeId?: string | null
  knowledgeRefs?: unknown
  temporal?: unknown
  spatial?: unknown
  features?: unknown
  layersUri?: string | null
}

/** Create/idempotent-update fields for a text annotation relation (POST annotation-relations). */
export interface CreateRelationInput {
  id?: string
  layerId: string
  sourceAnnotationId: string
  targetAnnotationId: string
  relationTypeRef: unknown
  label?: string | null
  features?: unknown
  layersUri?: string | null
}

// ============= Fetchers =============

/** Fetch an expression's detail graph (layers, annotations, relations). */
async function fetchExpressionDetail(expressionUri: string): Promise<LayersExpressionDetail> {
  const response = await fetch(`/api/layers/expressions/${expressionUri}`, {
    credentials: 'include',
  })
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to fetch expression annotations')
  }
  return response.json()
}

/** Create or idempotently update an annotation layer. */
async function upsertLayer(input: UpsertLayerInput): Promise<LayersAnnotationLayerRow> {
  const response = await fetch('/api/layers/annotation-layers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to save annotation layer')
  }
  return response.json()
}

/** Create or idempotently update a layers annotation. */
async function upsertAnnotation(input: UpsertAnnotationInput): Promise<LayersAnnotationRow> {
  const response = await fetch('/api/layers/annotations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to save annotation')
  }
  return response.json()
}

/** Delete a layers annotation. The server cascades its relations. */
async function deleteAnnotation(annotationId: string): Promise<void> {
  const response = await fetch(`/api/layers/annotations/${annotationId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to delete annotation')
  }
}

/** Create or idempotently update a text annotation relation. */
async function createRelation(input: CreateRelationInput): Promise<TextAnnotationRelationRow> {
  const response = await fetch('/api/layers/annotation-relations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to create relation')
  }
  return response.json()
}

/** Delete a text annotation relation. */
async function deleteRelation(relationId: string): Promise<void> {
  const response = await fetch(`/api/layers/annotation-relations/${relationId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to delete relation')
  }
}

// ============= Hooks =============

/**
 * Hook to fetch an expression's annotation layers with their annotations and
 * relations.
 *
 * @param expressionUri - the expression id/uri to read; the query is disabled
 *   when absent
 */
export function useLayersAnnotations(expressionUri: string | undefined) {
  return useQuery({
    queryKey: expressionUri
      ? layersAnnotationKeys.byExpression(expressionUri)
      : [...layersAnnotationKeys.all, 'disabled'],
    queryFn: () => fetchExpressionDetail(expressionUri as string),
    enabled: !!expressionUri && expressionUri.trim() !== '',
    staleTime: 30000,
  })
}

/**
 * Hook to create or idempotently update an annotation layer.
 *
 * Variables carry the owning `expressionUri` so the expression detail query is
 * invalidated on success.
 */
export function useUpsertLayer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ input }: { expressionUri: string; input: UpsertLayerInput }) =>
      upsertLayer(input),
    onSuccess: (_, { expressionUri }) => {
      queryClient.invalidateQueries({ queryKey: layersAnnotationKeys.byExpression(expressionUri) })
    },
    onError: (error, variables) => {
      logError(error as Error, undefined, {
        component: 'useUpsertLayer',
        expressionUri: variables.expressionUri,
        layerId: variables.input.id,
      })
    },
  })
}

/**
 * Hook to create or idempotently update a layers annotation (a span).
 *
 * Variables carry the owning `expressionUri` so the expression detail query is
 * invalidated on success.
 */
export function useUpsertAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ input }: { expressionUri: string; input: UpsertAnnotationInput }) =>
      upsertAnnotation(input),
    onSuccess: (_, { expressionUri }) => {
      queryClient.invalidateQueries({ queryKey: layersAnnotationKeys.byExpression(expressionUri) })
    },
    onError: (error, variables) => {
      logError(error as Error, undefined, {
        component: 'useUpsertAnnotation',
        expressionUri: variables.expressionUri,
        layerId: variables.input.layerId,
        annotationId: variables.input.id,
      })
    },
  })
}

/**
 * Hook to delete a layers annotation (a span). The server cascades its
 * relations; the expression detail query is invalidated on success.
 */
export function useDeleteAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ annotationId }: { expressionUri: string; annotationId: string }) =>
      deleteAnnotation(annotationId),
    onSuccess: (_, { expressionUri }) => {
      queryClient.invalidateQueries({ queryKey: layersAnnotationKeys.byExpression(expressionUri) })
    },
    onError: (error, variables) => {
      logError(error as Error, undefined, {
        component: 'useDeleteAnnotation',
        expressionUri: variables.expressionUri,
        annotationId: variables.annotationId,
      })
    },
  })
}

/**
 * Hook to create or idempotently update a text annotation relation.
 *
 * Variables carry the owning `expressionUri` so the expression detail query is
 * invalidated on success.
 */
export function useCreateRelation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ input }: { expressionUri: string; input: CreateRelationInput }) =>
      createRelation(input),
    onSuccess: (_, { expressionUri }) => {
      queryClient.invalidateQueries({ queryKey: layersAnnotationKeys.byExpression(expressionUri) })
    },
    onError: (error, variables) => {
      logError(error as Error, undefined, {
        component: 'useCreateRelation',
        expressionUri: variables.expressionUri,
        layerId: variables.input.layerId,
        relationId: variables.input.id,
      })
    },
  })
}

/**
 * Hook to delete a text annotation relation. The expression detail query is
 * invalidated on success.
 */
export function useDeleteRelation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ relationId }: { expressionUri: string; relationId: string }) =>
      deleteRelation(relationId),
    onSuccess: (_, { expressionUri }) => {
      queryClient.invalidateQueries({ queryKey: layersAnnotationKeys.byExpression(expressionUri) })
    },
    onError: (error, variables) => {
      logError(error as Error, undefined, {
        component: 'useDeleteRelation',
        expressionUri: variables.expressionUri,
        relationId: variables.relationId,
      })
    },
  })
}
