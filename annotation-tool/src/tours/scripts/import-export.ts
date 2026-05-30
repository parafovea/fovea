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
      'Pull in COCO, CSV, or Fovea-native dumps; review what landed with conflict resolution; export filtered by persona, time range, or type.',
    durationMinutes: 2,
    tags: ['import', 'export', 'data-management'],
    fixtureBundle: 'import-export',
    recap:
      'Annotations are portable. Export is filtered; import surfaces conflicts before applying.',
    steps: [
      {
        anchor: 'import-dialog',
        narration: 'Pull in COCO, CSV, or Fovea-native dumps.',
        expectAction: 'click',
        requiresFixture: false,
      },
      {
        anchor: 'import-result-dialog',
        narration: 'See exactly what landed, with conflict resolution.',
        requiresFixture: false,
      },
      {
        anchor: 'export-dialog',
        narration: 'Export filtered by persona, time range, or type.',
        expectAction: 'click',
        requiresFixture: false,
      },
    ],
  }
}
