import { describe, it, expect } from 'vitest'

import { allAnchorIds, anchorCatalog, isAnchorId } from './anchorCatalog'
import { parseTour, safeParseTour, TourValidationError } from './tourSchema'

const validTour = {
  id: 'demo',
  title: 'Demo',
  description: 'A demo tour.',
  durationMinutes: 2,
  steps: [
    { anchor: 'app-shell', narration: 'Welcome.' },
    { anchor: 'video-browser-card-first', narration: 'Pick a video.', expectAction: 'click' },
  ],
}

describe('anchorCatalog', () => {
  it('derives a non-empty anchor id set with a working guard', () => {
    expect(allAnchorIds.length).toBeGreaterThan(50)
    expect(isAnchorId('app-shell')).toBe(true)
    expect(isAnchorId('not-a-real-anchor')).toBe(false)
  })

  it('resolves every reachedBy opener to a catalog id', () => {
    for (const [id, meta] of Object.entries(anchorCatalog)) {
      for (const opener of meta.reachedBy ?? []) {
        expect(isAnchorId(opener), `${id}.reachedBy references unknown anchor ${opener}`).toBe(true)
      }
    }
  })
})

describe('parseTour', () => {
  it('accepts a valid tour', () => {
    const tour = parseTour(validTour)
    expect(tour.id).toBe('demo')
    expect(tour.steps).toHaveLength(2)
    expect(tour.steps[1].expectAction).toBe('click')
  })

  it('rejects an unknown anchor and suggests a near match, naming the source', () => {
    const result = safeParseTour({ ...validTour, steps: [{ anchor: 'app-shel', narration: 'x' }] }, 'admin.json')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Unknown tour anchor')
      expect(result.error).toContain('app-shell')
      expect(result.error).toContain('admin.json')
    }
  })

  it('rejects a step missing narration', () => {
    expect(() => parseTour({ ...validTour, steps: [{ anchor: 'app-shell' }] })).toThrow(TourValidationError)
  })

  it('rejects an unknown top-level key', () => {
    expect(safeParseTour({ ...validTour, bogus: 1 }).ok).toBe(false)
  })

  it('rejects an empty steps array', () => {
    expect(safeParseTour({ ...validTour, steps: [] }).ok).toBe(false)
  })
})
