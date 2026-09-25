/**
 * TanStack Query hooks for layers corpus interchange: listing corpora, importing
 * a bead or layers JSONL corpus, and exporting a corpus (or all readable records)
 * back out as a JSONL artifact.
 *
 * Import and export proxy to the model-service codec through the server's
 * `/api/layers/import` and `/api/layers/export` routes. Import sends the raw
 * uploaded JSONL text plus a `format` discriminator; the server normalizes and
 * persists the records, so a successful import invalidates the corpus, expression,
 * and document caches. Export returns a JSONL artifact this module downloads as a
 * file.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { AppError } from '@lib/errors'
import { logError } from '@services/errorLogging'

import { documentKeys } from './useDocuments'
import { expressionKeys } from './useExpressions'

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

/** Query key factory for layers corpora. */
export const corpusKeys = {
  all: ['layers-corpora'] as const,
  list: () => [...corpusKeys.all, 'list'] as const,
}

/** The interchange formats the import route accepts. */
export type CorpusImportFormat = 'layers-jsonl' | 'bead'

/** A corpus as returned by `GET /api/layers/corpora`. */
export interface LayersCorpus {
  id: string
  name: string
  description: string | null
  version: string | null
  domain: string | null
  ontologyRefs: unknown
  languages: string[]
  metadata: unknown
  projectId: string | null
  createdByUserId: string | null
  layersUri: string | null
  createdAt: string
  updatedAt: string
}

/** A single normalized layers record: the `(local_id, nsid, value_json)` triple. */
export interface NormalizedCorpusRecord {
  local_id: string
  nsid: string
  value_json: string
}

/** Fields accepted when importing a corpus. */
export interface ImportCorpusInput {
  /** The interchange format of the uploaded payload. */
  format: CorpusImportFormat
  /** The raw uploaded JSONL text. */
  payload: string
  /** Optional source filename, for provenance and the result summary. */
  filename?: string
}

/** The import summary the route returns after persisting the normalized records. */
export interface ImportCorpusResult {
  importId: string
  source: string
  persisted: number
  skipped: number
  byNsid: Record<string, number>
}

/** Fields accepted when exporting a corpus (a stored corpus, by id or name). */
export interface ExportLayersInput {
  /** Export a specific corpus by id (takes precedence over name). */
  corpusId?: string
  /** Export a corpus by name when no id is supplied. */
  corpusName?: string
}

/** Fetch the corpora the caller is authorized to read. */
async function fetchCorpora(): Promise<LayersCorpus[]> {
  const response = await fetch('/api/layers/corpora', { credentials: 'include' })
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to fetch corpora')
  }
  return response.json()
}

/** Normalize and persist an uploaded corpus payload through the model-service. */
async function importCorpus(input: ImportCorpusInput): Promise<ImportCorpusResult> {
  // The upload is raw JSONL text; the interchange route takes an array of source
  // records (the model-service codec interprets them per `source`), so parse the
  // non-empty lines into records here and pass the format tag as `source`.
  const records = input.payload
    .split('\n')
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line }) => line.length > 0)
    .map(({ line, lineNumber }) => {
      try {
        return JSON.parse(line) as unknown
      } catch (cause) {
        throw new AppError(
          'INVALID_JSONL',
          `Line ${lineNumber} of the corpus is not valid JSON`,
          cause,
        )
      }
    })

  const response = await fetch('/api/layers/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ records, source: input.format, filename: input.filename }),
  })
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to import corpus')
  }
  return response.json()
}

/**
 * Serialize a corpus into a JSONL artifact and download it as a file.
 *
 * The server responds with the JSONL text; this reads it, derives a filename
 * from the `Content-Disposition` header when present, and triggers a browser
 * download so the caller receives a `.jsonl` file.
 */
async function exportLayers(input: ExportLayersInput): Promise<void> {
  const body: Record<string, unknown> = {}
  if (input.corpusId) body.corpusId = input.corpusId
  if (input.corpusName) body.corpusName = input.corpusName

  const response = await fetch('/api/layers/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to export corpus')
  }

  // The export route returns the model-service artifact as JSON. Serialize it to
  // JSONL for download: an array (or a `{ records }` wrapper) becomes one record
  // per line; anything else is written as pretty JSON.
  const artifact = (await response.json()) as unknown
  const artifactRecords = Array.isArray(artifact)
    ? artifact
    : artifact &&
        typeof artifact === 'object' &&
        Array.isArray((artifact as { records?: unknown[] }).records)
      ? (artifact as { records: unknown[] }).records
      : null
  const text = artifactRecords
    ? artifactRecords.map((record) => JSON.stringify(record)).join('\n') + '\n'
    : JSON.stringify(artifact, null, 2)
  const filename = `${input.corpusName || input.corpusId || 'fovea-corpus'}.jsonl`

  const blob = new Blob([text], { type: 'application/x-ndjson' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

/**
 * Hook to list the corpora the caller can read.
 */
export function useCorpora() {
  return useQuery({
    queryKey: corpusKeys.list(),
    queryFn: fetchCorpora,
    staleTime: 30000,
  })
}

/**
 * Hook to import a bead or layers JSONL corpus. On success the server has
 * persisted the normalized records, so the corpus, expression, and document
 * caches are invalidated to surface the imported content.
 */
export function useImportCorpus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ImportCorpusInput) => importCorpus(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: corpusKeys.all })
      queryClient.invalidateQueries({ queryKey: expressionKeys.all })
      queryClient.invalidateQueries({ queryKey: documentKeys.all })
    },
    onError: (error, input) => {
      logError(error as Error, undefined, {
        component: 'useImportCorpus',
        format: input.format,
        filename: input.filename,
        payloadLength: input.payload.length,
      })
    },
  })
}

/**
 * Hook to export a corpus (or an explicit record set) as a downloadable JSONL
 * artifact.
 */
export function useExportLayers() {
  return useMutation({
    mutationFn: (input: ExportLayersInput) => exportLayers(input),
    onError: (error, input) => {
      logError(error as Error, undefined, {
        component: 'useExportLayers',
        corpusId: input.corpusId,
        corpusName: input.corpusName,
      })
    },
  })
}
