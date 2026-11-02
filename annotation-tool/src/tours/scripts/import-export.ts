/**
 * "Import & export" tour.
 *
 * A short tour over the import/export surface, which any team migrating
 * in existing annotations depends on. It ships as its own catalogue
 * tile so the import/export path is visibly covered.
 *
 * The bundle path the visitor would upload comes from the deployment's
 * content bundle; the default microvent bundle points at its own
 * filtered export. The tour narrates the import and export dialogs
 * without performing a real upload, so it reads no slot from the
 * content bundle directly.
 */

import type { Tour } from '../engine/tourSchema'
import type { TourImportExportContent } from '../content/types'

export function buildImportExportTour(
  c: TourImportExportContent,
): Tour {
  void c
  return {
    id: 'import-export',
    title: 'Import & export',
    description:
      'Pull in COCO, CSV, or Fovea-native dumps. Review what landed with conflict resolution. Export filtered by persona, time range, or type.',
    durationMinutes: 2,
    tags: ['import', 'export', 'data-management'],
    startRoute: '/app',
    recap:
      'Annotations are portable. Export is filtered. Import surfaces conflicts before applying.',
    steps: [
      {
        anchor: 'import-dialog',
        route: '/app',
        narration: 'Pull in COCO, CSV, or Fovea-native dumps.',
        expectAction: 'click',
      },
      {
        // The format-spec accordion lives inside the open import
        // dialog and documents the on-the-wire shape (including the
        // annotationType / typeId fields the importer's conflict
        // detector keys on). The import-result dialog only mounts
        // after a real upload completes, so a public-catalogue tour
        // narrates the format spec instead.
        anchor: 'import-format-spec-trigger',
        route: '/app',
        narration:
          'Expand the format spec to see what the importer reads. Fields, references, conflict keys.',
        expectAction: 'click',
        driver: { capability: 'open-import-dialog' },
      },
      {
        anchor: 'export-dialog',
        route: '/app',
        narration: 'Export filtered by persona, time range, or type.',
        expectAction: 'click',
      },
    ],
  }
}
