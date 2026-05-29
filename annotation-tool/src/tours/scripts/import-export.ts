/**
 * Tour 10 — "Import & export" (see plan §4).
 *
 * Short bonus tour. Can also be folded as a final two-step coda to
 * Tour 1, but ships as its own tile so the catalog visibly covers the
 * import/export surface (which is critical for any team migrating in
 * existing annotations).
 */

import type { TourScript } from '../engine/types'

export const importExportTour: TourScript = {
  id: 'import-export',
  title: 'Import & export',
  description:
    'Pull in COCO, CSV, or Fovea-native dumps; review what landed with conflict resolution; export filtered by persona, time range, or type.',
  durationMinutes: 2,
  tags: ['import', 'export', 'data-management'],
  fixtureBundle: 'import-export',
  recap:
    'Annotations are portable. Export is filtered; import surfaces conflicts before applying.',
  // No followUpTourId — Tour 10 is the end of the catalog; the post-tour
  // page suggests the menu instead.
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
