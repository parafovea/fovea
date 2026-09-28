/**
 * Assembles the tour catalogue a deployment runs: the first-party tours built
 * from the active content bundle, merged with an admin's override and extra
 * tours served from `public/tours/`.
 *
 * The admin surface is a manifest at `/tours/index.json` listing relative URLs
 * of tour JSON files (also under `public/tours/`). Each file is fetched, parsed,
 * and validated through `parseTour`, so a malformed admin tour fails loudly with
 * a field-anchored message instead of silently dropping out of the catalogue.
 *
 * Merge rules:
 *   - An admin tour whose `id` matches a built-in replaces that built-in.
 *   - An admin tour with a new `id` is appended.
 *   - Any tour, built-in or admin, with `enabled === false` is dropped.
 *
 * A missing `/tours/index.json` means zero overrides (a fresh deployment ships
 * none). A deployment without a manifest still answers that path, since the SPA
 * history fallback serves `index.html` with a 200; an HTML response is read as
 * "no manifest" rather than a misconfiguration. A manifest the server actually
 * serves as JSON that names a file which is unreachable, not JSON, or not a
 * valid tour throws, so a broken admin configuration surfaces at load.
 */

import type { Tour } from '../engine'
import { parseTour } from '../engine'
import type { TourContentBundle } from './types'
import { getBuiltInTours } from '../scripts'

/** Manifest location: a JSON array of tour file URLs relative to `public/tours/`. */
const TOUR_MANIFEST_URL = '/tours/index.json'

/** Directory the manifest's relative entries resolve against. */
const TOUR_FILE_BASE = '/tours/'

/** Thrown when an admin tour manifest or file is present but cannot be loaded. */
export class TourManifestError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'TourManifestError'
  }
}

/** Resolve a manifest entry to an absolute URL under `public/tours/`. */
function resolveTourUrl(entry: string): string {
  if (entry.startsWith('/') || /^https?:\/\//.test(entry)) return entry
  return `${TOUR_FILE_BASE}${entry}`
}

/**
 * Fetch the manifest. A `404`/`204` (no manifest shipped) yields an empty list;
 * any other transport or shape failure throws, since a present manifest that
 * cannot be read is a misconfiguration the admin needs to see.
 */
async function fetchManifest(): Promise<string[]> {
  let response: Response
  try {
    response = await fetch(TOUR_MANIFEST_URL, { cache: 'no-store' })
  } catch (err) {
    throw new TourManifestError(`${TOUR_MANIFEST_URL} is unreachable.`, err)
  }
  if (response.status === 404 || response.status === 204) return []
  if (!response.ok) {
    throw new TourManifestError(`${TOUR_MANIFEST_URL} fetch failed (${response.status}).`)
  }
  // A deployment that ships no manifest still answers this path: the SPA history
  // fallback serves index.html with a 200 and a text/html content-type. Read an
  // HTML body as "no manifest" rather than a malformed one.
  const contentType = response.headers?.get('content-type') ?? ''
  if (contentType.includes('html')) return []
  let manifest: unknown
  try {
    manifest = await response.json()
  } catch (err) {
    throw new TourManifestError(`${TOUR_MANIFEST_URL} is not valid JSON.`, err)
  }
  if (!Array.isArray(manifest) || !manifest.every((e): e is string => typeof e === 'string')) {
    throw new TourManifestError(`${TOUR_MANIFEST_URL} must be a JSON array of tour file URLs.`)
  }
  return manifest
}

/** Fetch, parse, and validate one admin tour file, throwing on any failure. */
async function fetchTour(url: string): Promise<Tour> {
  let response: Response
  try {
    response = await fetch(url, { cache: 'no-store' })
  } catch (err) {
    throw new TourManifestError(`Tour file ${url} is unreachable.`, err)
  }
  if (!response.ok) {
    throw new TourManifestError(`Tour file ${url} fetch failed (${response.status}).`)
  }
  let data: unknown
  try {
    data = await response.json()
  } catch (err) {
    throw new TourManifestError(`Tour file ${url} is not valid JSON.`, err)
  }
  return parseTour(data, url)
}

/**
 * Build the catalogue: first-party tours from `contentBundle`, then admin
 * overrides and extras from `/tours/index.json`. An override replaces the
 * built-in sharing its `id`; any tour disabled via `enabled === false` is
 * dropped. The returned order keeps built-ins in their catalogue order
 * (replacements in place) followed by new admin tours.
 */
export async function loadTours(contentBundle: TourContentBundle): Promise<Tour[]> {
  const builtIn = getBuiltInTours(contentBundle)

  const manifest = await fetchManifest()
  const overrides = await Promise.all(manifest.map((entry) => fetchTour(resolveTourUrl(entry))))

  const overridesById = new Map<string, Tour>()
  for (const tour of overrides) overridesById.set(tour.id, tour)

  const merged: Tour[] = []
  const seen = new Set<string>()
  for (const tour of builtIn) {
    merged.push(overridesById.get(tour.id) ?? tour)
    seen.add(tour.id)
  }
  for (const tour of overrides) {
    if (!seen.has(tour.id)) {
      merged.push(tour)
      seen.add(tour.id)
    }
  }

  return merged.filter((tour) => tour.enabled !== false)
}
