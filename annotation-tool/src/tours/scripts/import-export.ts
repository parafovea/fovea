/**
 * Tour 10 — "Import & export" (see plan §4).
 *
 * Short bonus tour. Can also be folded as a final two-step coda to
 * Tour 1, but ships as its own tile so the catalog visibly covers the
 * import/export surface (which is critical for any team migrating in
 * existing annotations).
 *
 * The bundle path the visitor uploads at step 1 comes from the
 * deployment's TourContentBundle. Default microvent uploads its own
 * filtered v2 export (annotation-tool/test/e2e/fixtures/
 * microvent-seed.jsonl). Admins for other domains supply a different
 * bundle URL their visitors can download + upload during the tour.
 */

import type { TourScript } from '../engine/types'
import type { TourImportExportContent } from '../content/types'

export function buildImportExportTour(
  c: TourImportExportContent,
): TourScript {
  void c
  return {
    id: 'import-export',
    title: 'Import & export',
    description:
      'Pull in COCO, CSV, or Fovea-native dumps. Review what landed with conflict resolution. Export filtered by persona, time range, or type.',
    durationMinutes: 2,
    tags: ['import', 'export', 'data-management'],
    fixtureBundle: 'import-export',
    startRoute: '/app',
    recap:
      'Annotations are portable. Export is filtered. Import surfaces conflicts before applying.',
    steps: [
      {
        anchor: 'import-dialog',
        route: '/app',
        // The import-dialog is a Radix DialogContent that only
        // mounts after the header Import button is clicked. The
        // engine synthesizes that click via revealBy before
        // running waitForAnchor.
        revealBy: 'import-trigger',
        narration: 'Pull in COCO, CSV, or Fovea-native dumps.',
        expectAction: 'click',
        requiresFixture: false,
      },
      {
        // The import-result-dialog only mounts after a real upload
        // completes, so a public-catalogue tour cannot count on it
        // being present. The format-spec accordion inside the same
        // open import-dialog is always there and documents the
        // on-the-wire shape (including the annotationType / typeId
        // fields the importer's conflict detector keys on), so
        // narrate that surface instead. The actual conflict-resolution
        // UI is exercised by the E2E spec, which performs a real
        // upload.
        anchor: 'import-format-spec-trigger',
        route: '/app',
        revealBy: 'import-trigger',
        narration:
          'Expand the format spec to see what the importer reads. Fields, references, conflict keys.',
        expectAction: 'click',
        requiresFixture: false,
      },
      {
        anchor: 'export-dialog',
        route: '/app',
        // Same idea — the export-dialog only mounts after the
        // header Export button is clicked. The engine opens it
        // via revealBy before polling for the dialog anchor.
        revealBy: 'export-trigger',
        narration: 'Export filtered by persona, time range, or type.',
        expectAction: 'click',
        requiresFixture: false,
      },
    ],
  }
}
