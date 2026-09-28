/**
 * The summaries-and-claims tour: audio config, transcript, AI-generated
 * summary, and claim extraction.
 *
 * The language-side walkthrough: it bridges pixel annotation to structured
 * language about the content. The visitor runs transcription, browses the
 * diarized transcript, writes or generates a structured summary, corrects a
 * model error, and inspects the claims Fovea extracts from the summary text.
 *
 * The summary and claim text the narration cites come from the deployment's
 * content bundle. The default microvent text is one of microvent's real
 * VideoSummary contents about the Phillies-Karen ball-grab incident. A
 * deployment for another domain supplies summary and claim text from its own
 * annotation history.
 *
 * Steps targeting conditional surfaces declare a `driver`: a capability that
 * seeds an annotation so the toolbar mounts, runs transcription so the
 * transcript dialog populates, or opens the summary editor. The engine derives
 * the click chain that opens each surface from the anchor catalog.
 */

import type { Tour } from '../engine/tourSchema'
import type { TourSummariesAndClaimsContent } from '../content/types'

export function buildSummariesAndClaimsTour(
  c: TourSummariesAndClaimsContent,
): Tour {
  const annotateRoute = '/app/annotate/:videoId'
  const annotateParams = { videoId: c.videoId }
  return {
    id: 'summaries-and-claims',
    title: 'Summaries, transcripts, and claim extraction',
    description:
      'Generate a structured summary, browse the transcript, extract claims anchored to their source span. Annotation is structured language tied to structured pixels.',
    durationMinutes: 4,
    tags: ['summaries', 'transcripts', 'claims', 'extraction'],
    personaName: c.personaName,
    recap: 'Annotation is structured language tied to structured pixels.',
    followUpTourId: 'collaboration',
    startRoute: '/app',
    steps: [
      {
        anchor: 'transcribe-audio-button',
        route: annotateRoute,
        routeParams: annotateParams,
        narration:
          "Click Transcribe Audio on the workspace toolbar to run ASR + speaker diarization on demand. The dialog opens with the transcript scoped to the currently selected clip.",
        expectAction: 'click',
        driver: { capability: 'ensure-annotation-exists' },
      },
      {
        anchor: 'transcript-dialog',
        route: annotateRoute,
        routeParams: annotateParams,
        narration:
          'Coloured chips show who said what. Click any timestamp to jump the video to that segment. The current segment highlights as the video plays.',
        driver: { capability: 'run-transcription' },
      },
      {
        anchor: 'video-summary-editor',
        route: annotateRoute,
        routeParams: annotateParams,
        narration: 'Write or generate a structured summary of the clip.',
        expectAction: 'click',
        driver: { capability: 'open-summary-editor' },
      },
      {
        anchor: 'video-summary-editor',
        route: annotateRoute,
        routeParams: annotateParams,
        narration:
          "The VLM placed the woman 'above the right-field line'. She was actually behind home plate. Edit the summary text before saving.",
        expectAction: 'type',
        driver: { capability: 'open-summary-editor' },
      },
      {
        anchor: 'summary-tab-claims',
        route: annotateRoute,
        routeParams: annotateParams,
        narration:
          "Switch to the Claims tab to see the structured claims Fovea extracted from the summary text. Each claim links back to its source span and can reference other claims through the gloss-reference system.",
        driver: { capability: 'open-summary-editor' },
      },
    ],
  }
}
