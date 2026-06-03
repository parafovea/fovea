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
  void c
  return {
    id: 'summaries-and-claims',
    title: 'Summaries, transcripts, and claim extraction',
    description:
      'Generate a structured summary, browse the transcript, extract claims anchored to their source span — annotation is structured language tied to structured pixels.',
    durationMinutes: 4,
    tags: ['summaries', 'transcripts', 'claims', 'extraction'],
    fixtureBundle: 'summaries-and-claims',
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
        narration: 'Transcript is synced to the video; click a line to jump.',
        expectAction: 'click',
        requiresFixture: false,
      },
      {
        anchor: 'transcript-viewer',
        narration:
          "Segment 2 has the lowest confidence: the model heard 'snatched' but the eyewitness said 'grabbed'. Double-click to edit, fix the word, and accept.",
        expectAction: 'type',
        requiresFixture: false,
      },
      {
        anchor: 'transcript-viewer',
        narration:
          "Same segment is on the wrong speaker. Click the speaker chip to flip it from SPEAKER_00 to SPEAKER_01.",
        expectAction: 'click',
        requiresFixture: false,
      },
      {
        anchor: 'video-summary-editor',
        narration: 'Write or generate a structured summary of the clip.',
        expectAction: 'click',
      },
      {
        anchor: 'video-summary-editor',
        narration:
          "The VLM placed the woman 'above the right-field line'. She was actually behind home plate. Edit the summary text before saving.",
        expectAction: 'type',
        requiresFixture: false,
      },
      {
        anchor: 'video-summary-card',
        narration:
          'Summaries live as first-class objects, browsable across clips.',
        requiresFixture: false,
      },
      {
        anchor: 'claims-extraction-dialog',
        narration: 'Extract claims from the summary or the transcript.',
        expectAction: 'click',
        requiresFixture: false,
      },
      {
        anchor: 'claims-extraction-dialog',
        narration:
          "The extractor returned one compound claim conflating three facts. Click 'Split into atomic claims' to break it into three rows the analyst can edit and confirm independently.",
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
}
