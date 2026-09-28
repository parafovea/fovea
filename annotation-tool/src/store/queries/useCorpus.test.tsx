/**
 * Tests for corpus interchange hooks.
 *
 * The import path parses the uploaded JSONL locally before posting the records,
 * so a malformed line must be reported with its true 1-based position in the
 * original text — including any blank lines that precede it, which are dropped
 * before the records array is built.
 */

import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'

import { AppError } from '@lib/errors'

import { useImportCorpus } from './useCorpus'

// Mock error logging so the mutation's onError does not touch the real logger.
vi.mock('@services/errorLogging', () => ({
  logError: vi.fn(),
  logWarning: vi.fn(),
}))

/** Wrap hooks in a QueryClient that does not retry, so failures surface at once. */
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useImportCorpus', () => {
  it('reports the original-text line number when a leading blank line precedes a malformed record', async () => {
    const { result } = renderHook(() => useImportCorpus(), { wrapper: createWrapper() })

    // Two blank lines, then a malformed record: the bad JSON is on line 3.
    result.current.mutate({ format: 'layers-jsonl', payload: '\n\n{not valid json' })

    await waitFor(() => expect(result.current.isError).toBe(true))

    const error = result.current.error as AppError
    expect(error).toBeInstanceOf(AppError)
    expect(error.code).toBe('INVALID_JSONL')
    expect(error.message).toContain('Line 3')
    // The compacted-array index (the pre-fix line number) would be 1, not 3.
    expect(error.message).not.toContain('Line 1')
  })

  it('counts blank lines interleaved between valid records when locating a malformed line', async () => {
    const { result } = renderHook(() => useImportCorpus(), { wrapper: createWrapper() })

    // Valid record on line 1, blank lines 2-3, malformed record on line 4.
    result.current.mutate({
      format: 'layers-jsonl',
      payload: '{"local_id":"a","nsid":"n","value_json":"{}"}\n\n\nnope',
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    const error = result.current.error as AppError
    expect(error.code).toBe('INVALID_JSONL')
    expect(error.message).toContain('Line 4')
  })

  it('surfaces the correct line for a malformed record deep in the payload', async () => {
    const { result } = renderHook(() => useImportCorpus(), { wrapper: createWrapper() })

    // Lines 1-3 valid, blank line 4, malformed record on line 5.
    const good = '{"local_id":"x","nsid":"n","value_json":"{}"}'
    result.current.mutate({
      format: 'bead',
      payload: `${good}\n${good}\n${good}\n\n{oops`,
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    const error = result.current.error as AppError
    expect(error.message).toContain('Line 5')
  })
})
