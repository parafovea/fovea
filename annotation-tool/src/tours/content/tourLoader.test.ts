/**
 * Verifies how `loadTours` merges first-party tours with admin tours served
 * from `/tours/index.json`: an override replaces the built-in sharing its id, a
 * tour flagged `enabled: false` drops out, and a malformed admin tour aborts the
 * load with a field-anchored validation message.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Tour } from '../engine'
import type { TourContentBundle } from './types'

const builtInTours: Tour[] = [
  {
    id: 'first-annotation',
    title: 'First annotation',
    description: 'Built-in on-ramp.',
    durationMinutes: 2,
    steps: [{ anchor: 'app-shell', narration: 'Welcome to the workspace.' }],
  },
  {
    id: 'ontology-authoring',
    title: 'Ontology authoring',
    description: 'Built-in ontology tour.',
    durationMinutes: 3,
    steps: [{ anchor: 'app-sidebar', narration: 'Open the ontology editor.' }],
  },
]

vi.mock('../scripts', () => ({
  getBuiltInTours: () => builtInTours,
}))

const { loadTours } = await import('./tourLoader')

/** A bundle stub; the mocked `getBuiltInTours` ignores it. */
const bundle = {} as TourContentBundle

/** A minimal headers stub exposing `get('content-type')`. */
function headersWith(contentType: string): Headers {
  return { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) } as Headers
}

/** Build a `fetch` mock from a manifest response and a map of file responses. */
function mockFetch(
  manifest: { status?: number; body?: unknown; contentType?: string },
  files: Record<string, unknown>,
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/tours/index.json') {
        const status = manifest.status ?? 200
        return {
          ok: status >= 200 && status < 300,
          status,
          headers: headersWith(manifest.contentType ?? 'application/json'),
          json: async () => manifest.body,
        } as Response
      }
      if (url in files) {
        return {
          ok: true,
          status: 200,
          headers: headersWith('application/json'),
          json: async () => files[url],
        } as Response
      }
      return { ok: false, status: 404, headers: headersWith('text/html'), json: async () => undefined } as Response
    }),
  )
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('loadTours', () => {
  it('returns only built-ins when no manifest is present', async () => {
    mockFetch({ status: 404 }, {})

    const tours = await loadTours(bundle)

    expect(tours.map((t) => t.id)).toEqual(['first-annotation', 'ontology-authoring'])
  })

  it('returns only built-ins when the manifest path serves the SPA index.html fallback', async () => {
    mockFetch({ status: 200, contentType: 'text/html', body: undefined }, {})

    const tours = await loadTours(bundle)

    expect(tours.map((t) => t.id)).toEqual(['first-annotation', 'ontology-authoring'])
  })

  it('replaces a built-in with an admin override sharing its id, in place', async () => {
    const override: Tour = {
      id: 'first-annotation',
      title: 'Admin first annotation',
      description: 'Override of the on-ramp.',
      durationMinutes: 4,
      steps: [{ anchor: 'app-shell', narration: 'Admin-authored welcome.' }],
    }
    mockFetch({ body: ['first-annotation.json'] }, { '/tours/first-annotation.json': override })

    const tours = await loadTours(bundle)

    expect(tours.map((t) => t.id)).toEqual(['first-annotation', 'ontology-authoring'])
    expect(tours[0].title).toBe('Admin first annotation')
    expect(tours[0].durationMinutes).toBe(4)
  })

  it('appends an admin tour with a new id after the built-ins', async () => {
    const extra: Tour = {
      id: 'admin-extra',
      title: 'Admin extra tour',
      description: 'A tour only this deployment ships.',
      durationMinutes: 1,
      steps: [{ anchor: 'app-shell', narration: 'A bespoke step.' }],
    }
    mockFetch({ body: ['extra.json'] }, { '/tours/extra.json': extra })

    const tours = await loadTours(bundle)

    expect(tours.map((t) => t.id)).toEqual(['first-annotation', 'ontology-authoring', 'admin-extra'])
  })

  it('drops a built-in disabled by an override with enabled false', async () => {
    const disable: Tour = {
      id: 'ontology-authoring',
      title: 'Ontology authoring',
      description: 'Disabled for this deployment.',
      durationMinutes: 3,
      enabled: false,
      steps: [{ anchor: 'app-sidebar', narration: 'Open the ontology editor.' }],
    }
    mockFetch({ body: ['disable.json'] }, { '/tours/disable.json': disable })

    const tours = await loadTours(bundle)

    expect(tours.map((t) => t.id)).toEqual(['first-annotation'])
  })

  it('throws a field-anchored validation error for a malformed admin tour', async () => {
    const malformed = {
      id: 'broken',
      title: 'Broken tour',
      description: 'Missing required step fields.',
      durationMinutes: 1,
      steps: [{ narration: 'No anchor here.' }],
    }
    mockFetch({ body: ['broken.json'] }, { '/tours/broken.json': malformed })

    await expect(loadTours(bundle)).rejects.toThrow(/steps\.0\.anchor/)
    await expect(loadTours(bundle)).rejects.toThrow('/tours/broken.json')
  })

  it('throws when the manifest is present but not a JSON array of strings', async () => {
    mockFetch({ body: { tours: [] } }, {})

    await expect(loadTours(bundle)).rejects.toThrow(/array of tour file URLs/)
  })

  it('throws when a manifest names a file that cannot be fetched', async () => {
    mockFetch({ body: ['missing.json'] }, {})

    await expect(loadTours(bundle)).rejects.toThrow(/\/tours\/missing\.json fetch failed \(404\)/)
  })
})
