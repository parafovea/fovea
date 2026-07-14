/**
 * The "Welcome to FOVEA" splash tour.
 *
 * Two beats: what FOVEA is (the backronym reading) and where the
 * four-layer model lives in the UI (persona ontology, world layer,
 * annotations, claims). The first tile a QR-code visitor on
 * demo.fovea.video sees, so the narration assumes zero prior context.
 *
 * Content-neutral: the narration references the FOVEA brand directly,
 * which is invariant across admin tailoring, so no content bundle slot
 * is threaded through.
 */

import type { Tour } from '../engine/tourSchema'

export function buildWelcomeTour(): Tour {
  return {
    id: 'welcome',
    title: 'Welcome to FOVEA',
    description:
      'Two-minute orientation. What FOVEA is, what the four-layer model gives you, and how the rest of the tours fit together.',
    durationMinutes: 2,
    tags: ['orientation', 'intro'],
    recap:
      'FOVEA is a Flexible Ontology Visual Event Analyzer. Annotation is structured language tied to structured pixels.',
    followUpTourId: 'first-annotation',
    startRoute: '/app',
    steps: [
      {
        anchor: 'app-shell',
        route: '/app',
        narration:
          'FOVEA: Flexible Ontology Visual Event Analyzer. Annotation is structured language tied to structured pixels.',
      },
      {
        anchor: 'app-shell',
        route: '/app',
        narration:
          'Four layers stack together: persona ontologies (what types exist), world objects (what specific instances exist), annotations (boxes on frames), and claims (sentences about the video). The other tours walk each layer.',
      },
      {
        anchor: 'app-shell',
        route: '/app',
        narration:
          'When the demo runs the model service offline, the mocked outputs you see are realistic almost-there results an analyst would then polish. The point of every tour is the editing loop between proposal and final form.',
      },
    ],
  }
}
