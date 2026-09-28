/**
 * "Document annotation: spans and relations" — Fovea annotates text, not only
 * video.
 *
 * Walks a visitor through the document library, opening a document into the span
 * annotator, selecting a token span, labeling it, and reading the relations that
 * connect spans. The span and relation surfaces mirror the video workspace: a
 * selection gesture stands in for drawing a box, a label picker stands in for
 * the type picker, and a list-alongside-canvas layout stands in for the timeline.
 *
 * Content comes from `TourDocumentAnnotationContent`, so a deployment can retheme
 * the running example (the demo document's title, text, and the type/relation
 * names the narration suggests) without touching anchors.
 */

import type { TourDocumentAnnotationContent } from '../content/types'
import type { Tour } from '../engine/tourSchema'

export function buildDocumentAnnotationTour(c: TourDocumentAnnotationContent): Tour {
  const documentsRoute = '/app/documents'
  const documentRoute = '/app/documents/:documentId'
  const documentParams = { documentId: c.documentId }
  // Every per-document driver receives the demo document's id and text so it can
  // create the row idempotently and route to it.
  const driverParams = {
    documentId: c.documentId,
    title: c.documentTitle,
    text: c.documentText,
  }
  return {
    id: 'document-annotation',
    startRoute: '/app/documents',
    title: 'Document annotation: spans and relations',
    description:
      'Fovea annotates text as well as video. Open a document, select a token span, label it, and connect spans with relations.',
    durationMinutes: 3,
    tags: ['documents', 'spans', 'relations', 'text'],
    personaName: c.personaName,
    recap:
      'Token spans and span relations are the text-side of the same annotation model: a selection is a box, a label is a type, and relations are the edges between them.',
    steps: [
      {
        anchor: 'document-browser',
        route: documentsRoute,
        narration:
          'Fovea annotates text as well as video. The document library holds every text expression you can open for token-span annotation.',
        expectAction: 'none',
      },
      {
        anchor: 'document-card-first',
        route: documentsRoute,
        driver: { capability: 'ensure-demo-document', params: driverParams },
        narration: `Open a document to annotate its tokens. This tour works on '${c.documentTitle}'.`,
        expectAction: 'click',
      },
      {
        anchor: 'span-annotator',
        route: documentRoute,
        routeParams: documentParams,
        driver: { capability: 'open-demo-document', params: driverParams },
        narration:
          'The span annotator tokenizes the text. Drag across tokens to select a span, the same gesture you use to draw a box on a video frame.',
        expectAction: 'none',
      },
      {
        anchor: 'span-label-picker',
        route: documentRoute,
        routeParams: documentParams,
        driver: { capability: 'select-token-span', params: driverParams },
        narration: `Labeling a span mirrors typing a video annotation: pick an ontology TYPE (say '${c.spanTypeName}') or link the span to a specific world OBJECT.`,
        expectAction: 'none',
      },
      {
        anchor: 'relation-arc-overlay',
        route: documentRoute,
        routeParams: documentParams,
        driver: { capability: 'open-demo-document', params: driverParams },
        narration: `Relations connect two spans, drawn as arcs over the text. Start a relation from a span, pick its target, then choose a relation type (like '${c.relationTypeName}') in the picker.`,
        expectAction: 'none',
      },
      {
        anchor: 'relation-side-panel',
        route: documentRoute,
        routeParams: documentParams,
        driver: { capability: 'open-demo-document', params: driverParams },
        narration:
          'Every relation lands in the relations panel beside the spans, the same list-alongside-canvas layout as the video timeline.',
        expectAction: 'none',
      },
    ],
  }
}
