/**
 * TanStack Query hooks for layers expressions: reading a single expression's
 * detail, creating a text expression from pasted text, and materializing a
 * video's projected text expressions (metadata text and ASR transcript).
 *
 * Payload shapes come from `@fovea/layers-schema`; the wire responses are the
 * flattened database projections the server returns.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { AppError } from '@lib/errors'
import { logError } from '@services/errorLogging'

import type { LayersExpressionDetail } from './useLayersAnnotations'

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

/** Query key factory for layers expressions. */
export const expressionKeys = {
  all: ['layers-expressions'] as const,
  detail: (id: string) => [...expressionKeys.all, 'detail', id] as const,
  byVideo: (videoId: string) => [...expressionKeys.all, 'video', videoId] as const,
}

/** An expression with its token decomposition (tokenizations and segmentations). */
export interface LayersExpressionWithTokens {
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
}

/** Fields accepted when creating a text expression (a document). */
export interface CreateExpressionInput {
  id?: string
  text: string
  title?: string
  languages?: string[]
  projectId?: string | null
  metadata?: unknown
  features?: unknown
}

/** Fetch an expression's full detail graph. */
async function fetchExpression(id: string): Promise<LayersExpressionDetail> {
  const response = await fetch(`/api/layers/expressions/${id}`, { credentials: 'include' })
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to fetch expression')
  }
  return response.json()
}

/** Create a text expression from pasted text plus a whitespace tokenization. */
async function createExpression(input: CreateExpressionInput): Promise<LayersExpressionWithTokens> {
  const response = await fetch('/api/layers/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to create expression')
  }
  return response.json()
}

/** Materialize and fetch a video's projected text expressions. */
async function fetchVideoTextExpressions(videoId: string): Promise<LayersExpressionWithTokens[]> {
  const response = await fetch(`/api/layers/videos/${videoId}/text-expressions`, {
    credentials: 'include',
  })
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to fetch video text expressions')
  }
  return response.json()
}

/**
 * Hook to fetch a single expression's detail graph.
 *
 * @param id - the expression id; the query is disabled when absent
 */
export function useExpression(id: string | undefined) {
  return useQuery({
    queryKey: id ? expressionKeys.detail(id) : [...expressionKeys.all, 'disabled'],
    queryFn: () => fetchExpression(id as string),
    enabled: !!id && id.trim() !== '',
    staleTime: 30000,
  })
}

/**
 * Hook to materialize and fetch a video's projected text expressions (its
 * metadata text and ASR transcript).
 *
 * @param videoId - the source video id; the query is disabled when absent
 */
export function useVideoTextExpressions(videoId: string | undefined) {
  return useQuery({
    queryKey: videoId ? expressionKeys.byVideo(videoId) : [...expressionKeys.all, 'disabled'],
    queryFn: () => fetchVideoTextExpressions(videoId as string),
    enabled: !!videoId && videoId.trim() !== '',
    staleTime: 30000,
  })
}

/**
 * Hook to create a text expression from pasted text. Invalidates the created
 * expression's detail query on success.
 */
export function useCreateExpression() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateExpressionInput) => createExpression(input),
    onSuccess: (expression) => {
      queryClient.invalidateQueries({ queryKey: expressionKeys.detail(expression.id) })
    },
    onError: (error, input) => {
      logError(error as Error, undefined, {
        component: 'useCreateExpression',
        expressionId: input.id,
        textLength: input.text.length,
      })
    },
  })
}
