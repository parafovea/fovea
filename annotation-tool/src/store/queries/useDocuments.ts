/**
 * TanStack Query hooks for the layers document library: listing document
 * expressions the caller can read and creating a document from pasted text.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { AppError } from '@lib/errors'
import { logError } from '@services/errorLogging'

import type { CreateExpressionInput, LayersExpressionWithTokens } from './useExpressions'

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

/** Query key factory for layers documents. */
export const documentKeys = {
  all: ['layers-documents'] as const,
  list: (limit: number, offset: number) => [...documentKeys.all, 'list', limit, offset] as const,
}

/** Fields accepted when creating a document expression. */
export type CreateDocumentInput = CreateExpressionInput

/** A bare document-expression row as returned in the document list. */
export interface LayersDocumentRow {
  id: string
  layersId: string
  kind: string
  sourceKind: string
  text: string | null
  languages: string[]
  metadata: unknown
  features: unknown
  projectId: string | null
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
}

/** A page of the document library. */
export interface DocumentListResponse {
  items: LayersDocumentRow[]
  total: number
  limit: number
  offset: number
}

/** Pagination for the document library. */
export interface DocumentListOptions {
  limit?: number
  offset?: number
}

/** Fetch a page of document expressions. */
async function fetchDocuments(options: DocumentListOptions): Promise<DocumentListResponse> {
  const params = new URLSearchParams()
  if (options.limit !== undefined) params.set('limit', String(options.limit))
  if (options.offset !== undefined) params.set('offset', String(options.offset))
  const query = params.toString()
  const url = query ? `/api/layers/documents?${query}` : '/api/layers/documents'
  const response = await fetch(url, { credentials: 'include' })
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to fetch documents')
  }
  return response.json()
}

/** Create a document expression from pasted text. */
async function createDocument(input: CreateDocumentInput): Promise<LayersExpressionWithTokens> {
  const response = await fetch('/api/layers/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to create document')
  }
  return response.json()
}

/**
 * Hook to list document expressions the caller can read.
 *
 * @param options - pagination limit and offset
 */
export function useDocuments(options: DocumentListOptions = {}) {
  const limit = options.limit ?? 50
  const offset = options.offset ?? 0
  return useQuery({
    queryKey: documentKeys.list(limit, offset),
    queryFn: () => fetchDocuments({ limit, offset }),
    staleTime: 30000,
  })
}

/**
 * Hook to create a document expression. Invalidates the document library on
 * success so the new document appears in the list.
 */
export function useCreateDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateDocumentInput) => createDocument(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all })
    },
    onError: (error, input) => {
      logError(error as Error, undefined, {
        component: 'useCreateDocument',
        documentId: input.id,
        textLength: input.text.length,
      })
    },
  })
}
