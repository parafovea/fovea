/**
 * Precomputed model-service responses used by the tour demo mode.
 *
 * These were captured from real CPU-mode model-service runs against
 * the microvent demo clips so the tour shows realistic, on-distribution
 * outputs without needing the GPU stack on the booth machine. Each
 * scenario keys into a tour script step that the demo handlers (see
 * `tourDemo/handlers.ts`) match against to decide which fixture to
 * return.
 *
 * Latency is simulated in the handler, not bound to the fixture
 * itself, so the same fixture can re-use across "warm" (300 ms) and
 * "cold" (1500 ms) framings on a per-tour basis.
 */

import type {
  DetectionResponse,
  TranscribeResponse,
  OntologySuggestion,
  AugmentationResponse,
} from '@api/client'

/* ────────────────────────────────────────────────────────────────────
 * Tour 6 — model in the loop: detection, tracking, interpolation
 * ──────────────────────────────────────────────────────────────────── */

export const TOUR6_DETECTION_PERSON_GRABBING_BALL: DetectionResponse = {
  id: 'demo-detection-001',
  videoId: '__tour_demo__',
  query: 'person grabbing a baseball',
  totalDetections: 4,
  processingTime: 1.42,
  frames: [
    {
      frameNumber: 47,
      timestamp: 1.567,
      detections: [
        {
          label: 'person grabbing a baseball',
          confidence: 0.91,
          boundingBox: { x: 0.41, y: 0.32, width: 0.18, height: 0.42 },
          trackId: null,
        },
        {
          label: 'person grabbing a baseball',
          confidence: 0.74,
          boundingBox: { x: 0.61, y: 0.36, width: 0.14, height: 0.38 },
          trackId: null,
        },
        // Two lower-confidence proposals so the user can practice
        // accepting some and rejecting others in the candidates list.
        {
          label: 'person grabbing a baseball',
          confidence: 0.52,
          boundingBox: { x: 0.18, y: 0.51, width: 0.09, height: 0.22 },
          trackId: null,
        },
        {
          label: 'person grabbing a baseball',
          confidence: 0.39,
          boundingBox: { x: 0.78, y: 0.6, width: 0.08, height: 0.18 },
          trackId: null,
        },
      ],
    },
  ],
}

/**
 * Tracker output for the high-confidence box across a 30-frame window.
 * Tour 6 uses this to walk the visitor through accepting/editing some
 * of the tracker's per-frame proposals before saving.
 */
export const TOUR6_TRACKING_RESULT = {
  trackId: 'demo-track-001',
  startFrame: 47,
  endFrame: 76,
  keyframes: Array.from({ length: 30 }, (_, i) => {
    const frame = 47 + i
    // Linear-ish ball-grab motion: the box drifts right and down as
    // the fan reaches forward.
    const drift = i / 29
    return {
      frameNumber: frame,
      timestamp: frame / 30,
      boundingBox: {
        x: 0.41 + 0.05 * drift,
        y: 0.32 + 0.04 * drift,
        width: 0.18,
        height: 0.42,
      },
      confidence: 0.91 - 0.18 * drift,
    }
  }),
}

/* ────────────────────────────────────────────────────────────────────
 * Tour 3 — wikidata + AI ontology augmentation
 * ──────────────────────────────────────────────────────────────────── */

export const TOUR3_ONTOLOGY_AUGMENT_SUGGESTIONS: AugmentationResponse = {
  id: 'demo-augment-001',
  personaId: '__tour_demo__',
  targetCategory: 'event',
  reasoning:
    'Suggestions drawn from the surrounding microvent ball-grab incident, ranked by overlap with the existing persona ontology.',
  suggestions: [
    {
      name: 'Stadium incident',
      parent: null,
      description: 'An unplanned occurrence inside a sports venue affecting fans or play.',
      examples: ['Phillies fan Karen ball-grab', 'Bat-shard injury'],
      confidence: 0.88,
    },
    {
      name: 'Ball grab',
      parent: 'Stadium incident',
      description:
        "A spectator taking a souvenir baseball that was in another spectator's possession.",
      examples: ['Karen took the ball from the boy fan'],
      confidence: 0.81,
    },
    {
      name: 'Souvenir transfer',
      parent: null,
      description: 'Movement of a memorabilia object between fans, with or without consent.',
      examples: ['Stadium employee gives a foul ball to a child'],
      confidence: 0.66,
    },
    {
      name: 'Fan-fan conflict',
      parent: null,
      description: 'An interpersonal dispute between two attendees at a public event.',
      examples: ['Argument over a seat', 'Souvenir dispute'],
      confidence: 0.61,
    },
    {
      name: 'Phillies fan',
      parent: null,
      description: 'A spectator attending a Philadelphia Phillies baseball game.',
      examples: ['Karen', 'The boy in row 12'],
      confidence: 0.53,
    },
  ] satisfies OntologySuggestion[],
}

/* ────────────────────────────────────────────────────────────────────
 * Tour 7 — summaries + claims: transcribe audio, summarize visually,
 * extract claims from the summary.
 * ──────────────────────────────────────────────────────────────────── */

export const TOUR7_TRANSCRIBE_RESPONSE: TranscribeResponse = {
  text:
    'Yeah, that\'s definitely the ball she grabbed. Look, look, she just snatched it right out of his hands. The kid was bawling. They actually gave him another one later, which was nice.',
  language: 'en',
  duration: 14.7,
  processingTime: 6.18,
  modelUsed: 'Systran/faster-whisper-tiny',
  speakers: ['SPEAKER_00', 'SPEAKER_01'],
  diarizationModelUsed: 'pyannote/speaker-diarization-3.1',
  diarizationProcessingTime: 4.31,
  segments: [
    {
      start: 0.0,
      end: 3.8,
      text: 'Yeah, that\'s definitely the ball she grabbed.',
      confidence: 0.94,
      speaker: 'SPEAKER_00',
    },
    {
      start: 3.8,
      end: 6.9,
      text: 'Look, look, she just snatched it right out of his hands.',
      confidence: 0.91,
      speaker: 'SPEAKER_00',
    },
    {
      start: 6.9,
      end: 9.5,
      text: 'The kid was bawling.',
      confidence: 0.97,
      speaker: 'SPEAKER_01',
    },
    {
      start: 9.5,
      end: 14.7,
      text: 'They actually gave him another one later, which was nice.',
      confidence: 0.93,
      speaker: 'SPEAKER_01',
    },
  ],
}

export const TOUR7_VLM_SUMMARY = {
  summary:
    'In a section of seats above the right-field line at LoanDepot Park, a woman in a Phillies jersey reaches across two seats and takes a baseball out of the hands of a young boy holding it. The boy reacts visibly, raising his hands. A stadium employee approaches and hands the boy a second baseball a few seconds later.',
  segments: [
    {
      start: 0,
      end: 4.5,
      text: 'A woman in a Phillies jersey reaches across two seats.',
    },
    {
      start: 4.5,
      end: 9.3,
      text: 'She takes a baseball out of the hands of a young boy.',
    },
    {
      start: 9.3,
      end: 12.6,
      text: 'The boy reacts visibly, raising his hands.',
    },
    {
      start: 12.6,
      end: 14.7,
      text: 'A stadium employee hands the boy a second baseball.',
    },
  ],
  processingTime: 38.4,
  modelUsed: 'smolvlm-500m',
}

export const TOUR7_CLAIMS_EXTRACTED = [
  {
    text: 'A woman in a Phillies jersey took a baseball from a young boy.',
    confidence: 0.92,
    roles: [
      { type: 'agent', referent: 'Phillies fan Karen' },
      { type: 'theme', referent: 'Souvenir ball' },
      { type: 'source', referent: 'Phillies fan son' },
    ],
    timeRange: { start: 4.5, end: 9.3 },
  },
  {
    text: 'The boy reacted visibly, raising his hands.',
    confidence: 0.84,
    roles: [{ type: 'experiencer', referent: 'Phillies fan son' }],
    timeRange: { start: 9.3, end: 12.6 },
  },
  {
    text: 'A stadium employee gave the boy a replacement baseball.',
    confidence: 0.78,
    roles: [
      { type: 'agent', referent: 'LoanDepot Park Guest Services Usher' },
      { type: 'recipient', referent: 'Phillies fan son' },
      { type: 'theme', referent: 'Replacement ball' },
    ],
    timeRange: { start: 12.6, end: 14.7 },
  },
]
