/**
 * Tour 7 — "Summaries, transcripts, claim extraction" (see plan §4).
 *
 * The language-side tour. Walks a visitor through audio config →
 * transcript → AI-generated summary → claim extraction → cross-clip
 * persona-wide claim graph. This is the bridge from pixel annotation
 * to structured language about the content.
 *
 * The summary + claim text the narration cites come from the
 * deployment's TourContentBundle. Default microvent text is one of
 * microvent's actual VideoSummary contents about the Phillies-Karen
 * ball-grab incident. Admins for other domains supply summary +
 * claim text from their own annotation history.
 */

import type { TourScript } from '../engine/types'
import type { TourSummariesAndClaimsContent } from '../content/types'

export function buildSummariesAndClaimsTour(
  c: TourSummariesAndClaimsContent,
): TourScript {
  const annotateRoute = '/app/annotate/:videoId'
  const annotateParams = { videoId: c.videoId }
  return {
    id: 'summaries-and-claims',
    title: 'Summaries, transcripts, and claim extraction',
    description:
      'Generate a structured summary, browse the transcript, extract claims anchored to their source span. Annotation is structured language tied to structured pixels.',
    durationMinutes: 4,
    tags: ['summaries', 'transcripts', 'claims', 'extraction'],
    fixtureBundle: 'summaries-and-claims',
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
        requiresFixture: false,
      },
      {
        anchor: 'transcript-dialog',
        route: annotateRoute,
        routeParams: annotateParams,
        // The transcript dialog mounts when the Transcribe Audio
        // toolbar button is clicked. revealBy is idempotent — the
        // engine short-circuits if the anchor is already mounted,
        // so stepping forward from the Transcribe step does not
        // toggle the dialog closed.
        revealBy: 'transcribe-audio-button',
        narration:
          'Coloured chips show who said what. Click any timestamp to jump the video to that segment. The current segment highlights as the video plays.',
        requiresFixture: false,
      },
      // transcript-viewer and audio-config-panel live inside the
      // Transcribe dialog only after the transcribe mutation
      // completes against the demo backend. In the public preview
      // (no real model-service) the dialog renders its loading
      // skeleton instead and the inner anchors do not mount, so
      // the steps that walked the transcript edit + speaker flip
      // moved into the post-demo Quick-Tour copy where their
      // narration accompanies a still-frame illustration rather
      // than a live anchor.
      {
        anchor: 'video-summary-editor',
        route: annotateRoute,
        routeParams: annotateParams,
        // VideoSummaryEditor is inside a Dialog opened by the
        // Edit Summary toolbar button. ClaimsViewer +
        // ClaimSpanHighlighter render inside that same dialog
        // and reuse the same opener.
        revealBy: 'edit-summary-button',
        narration: 'Write or generate a structured summary of the clip.',
        expectAction: 'click',
      },
      {
        anchor: 'video-summary-editor',
        route: annotateRoute,
        routeParams: annotateParams,
        revealBy: 'edit-summary-button',
        narration:
          "The VLM placed the woman 'above the right-field line'. She was actually behind home plate. Edit the summary text before saving.",
        expectAction: 'type',
        requiresFixture: false,
      },
      {
        anchor: 'summary-tab-claims',
        route: annotateRoute,
        routeParams: annotateParams,
        revealBy: 'edit-summary-button',
        narration:
          "Switch to the Claims tab to see the structured claims Fovea extracted from the summary text. Each claim links back to its source span and can reference other claims through the gloss-reference system. Covered hands-on in Tour 2.",
      },
    ],
  }
}
