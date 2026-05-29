/**
 * Tour 7 — "Summaries, transcripts, claim extraction" (see plan §4).
 *
 * The language-side tour. Walks a visitor through audio config →
 * transcript → AI-generated summary → claim extraction → cross-clip
 * persona-wide claim graph. This is the bridge from pixel annotation
 * to structured language about the content.
 */

import type { TourScript } from '../engine/types'

export const summariesAndClaimsTour: TourScript = {
  id: 'summaries-and-claims',
  title: 'Summaries, transcripts, and claim extraction',
  description:
    "Generate a structured summary, browse the transcript, extract claims anchored to their source span — annotation is structured language tied to structured pixels.",
  durationMinutes: 4,
  tags: ['summaries', 'transcripts', 'claims', 'extraction'],
  fixtureBundle: 'tour-summaries-and-claims',
  recap: 'Annotation is structured language tied to structured pixels.',
  followUpTourId: 'collaboration',
  steps: [
    {
      anchor: 'audio-config-panel',
      narration:
        'Audio is configurable per clip — language, diarization, transcription model.',
      requiresFixture: false,
    },
    {
      anchor: 'transcript-viewer',
      narration: 'Transcript is synced to the video — click a line to jump.',
      expectAction: 'click',
      requiresFixture: false,
    },
    {
      anchor: 'video-summary-editor',
      narration: 'Write or generate a structured summary of the clip.',
      expectAction: 'click',
    },
    {
      anchor: 'video-summary-card',
      narration: 'Summaries live as first-class objects, browsable across clips.',
      requiresFixture: false,
    },
    {
      anchor: 'claims-extraction-dialog',
      narration: 'Extract claims from the summary or the transcript.',
      expectAction: 'click',
      requiresFixture: false,
    },
    {
      anchor: 'claim-span-highlighter',
      narration: 'Each claim is anchored to its source span.',
      expectAction: 'hover',
      requiresFixture: false,
    },
    {
      anchor: 'claims-viewer',
      narration:
        'Claims aggregate across clips into a persona-wide knowledge graph.',
    },
  ],
}
