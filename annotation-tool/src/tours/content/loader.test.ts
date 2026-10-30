import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadTourContentBundle } from './loader'

describe('tour document content validation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rejects a missing document slot before resolving videos', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetch)
    await expect(loadTourContentBundle()).rejects.toMatchObject({
      name: 'TourContentLoadError', cause: { message: 'documentAnnotation.documentId is required' },
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
