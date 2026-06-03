/**
 * MSW request handlers used by the tour demo mode.
 *
 * Every fixture is sourced from the deployment's `TourContentBundle`
 * (the same JSON an admin edits at `/tour-content.json` to retheme
 * tours for their own domain), so swapping the domain; say from
 * microvent's Phillies-Karen incident to a marine-safety cargo-spill
 * incident; re-themes the mocked model outputs in the same edit
 * pass that re-themes the personas, type names, and narration
 * content. The bundle is loaded once at boot in `browser.ts` and
 * threaded into the handler factory here.
 *
 * The handlers intercept every backend route that would otherwise
 * forward to the model-service (detect, transcribe, augment
 * ontology, summarize, extract claims, track), resolve them from
 * the bundle, and pause for a randomized 800-1800 ms so the visitor
 * sees a real-feeling "computing" beat without the booth needing a
 * GPU stack.
 *
 * Why a single delay range: every tour step that calls the model
 * service is implicitly framed as a warm call (the bundle is
 * preloaded). The range chosen matches the perceived range a
 * CPU-warm deployment of the real model-service produces.
 */

import { http, HttpResponse, delay } from 'msw'
import type {
  DetectionResponse,
  TranscribeResponse,
  AugmentationResponse,
} from '@api/client'
import type { TourContentBundle } from '@/tours/content/types'

const MIN_DELAY_MS = 800
const MAX_DELAY_MS = 1800

async function simulatedInferenceDelay(): Promise<void> {
  const ms = MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS))
  await delay(ms)
}

/**
 * Build the MSW handler set against the deployment's tour content
 * bundle. Same-origin routes are matched with a leading slash; the
 * Vite dev proxy and the production reverse proxy both rewrite
 * `/api/...` to the backend.
 */
export function createTourDemoHandlers(
  bundle: TourContentBundle,
): ReturnType<typeof http.post>[] {
  // ── Tour 3; ontology augmentation
  const augmentResponse: AugmentationResponse = {
    id: 'demo-augment-001',
    personaId: '__tour_demo__',
    targetCategory: 'event',
    reasoning: bundle.wikidataAugmentation.mockOntologyAugmentReasoning,
    suggestions: bundle.wikidataAugmentation.mockOntologyAugmentSuggestions.map((s) => ({
      name: s.name,
      parent: s.parent,
      description: s.description,
      examples: s.examples,
      confidence: s.confidence,
    })),
  }

  // ── Tour 6; detection + tracking
  const m6 = bundle.modelInTheLoop
  const detectionResponse: DetectionResponse = {
    id: 'demo-detection-001',
    videoId: m6.videoId,
    query: m6.mockDetectionQuery,
    totalDetections: m6.mockDetectionProposals.length,
    processingTime: 1.42,
    frames: [
      {
        frameNumber: m6.mockDetectionFrame,
        timestamp: m6.mockDetectionFrame / 30,
        detections: m6.mockDetectionProposals.map((p) => ({
          label: p.label,
          confidence: p.confidence,
          boundingBox: p.boundingBox,
          trackId: null,
          // Forward the demo's accept-as hints so the candidates list
          // can render a "snap to type" chip per box.
          acceptAsLabel: p.acceptAsLabel,
          acceptAsWikidataId: p.acceptAsWikidataId,
        })),
      },
    ],
  }
  const trackingResponse = {
    trackId: 'demo-track-001',
    startFrame: m6.mockTrackingKeyframes[0]?.frameNumber ?? 0,
    endFrame:
      m6.mockTrackingKeyframes[m6.mockTrackingKeyframes.length - 1]?.frameNumber ?? 0,
    keyframes: m6.mockTrackingKeyframes,
  }

  // ── Tour 7; transcribe + summarize + extract claims
  const m7 = bundle.summariesAndClaims
  const transcribeResponse: TranscribeResponse = {
    text: m7.mockTranscript.segments.map((s) => s.text).join(' '),
    language: m7.mockTranscript.language,
    duration: m7.mockTranscript.duration,
    processingTime: 6.18,
    modelUsed: 'Systran/faster-whisper-tiny',
    speakers: m7.mockTranscript.speakers,
    diarizationModelUsed: 'pyannote/speaker-diarization-3.1',
    diarizationProcessingTime: 4.31,
    segments: m7.mockTranscript.segments.map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text,
      confidence: s.confidence,
      speaker: s.speaker,
    })),
  }

  const summarizeResponse = {
    jobId: 'demo-summary-job-001',
    videoId: m7.videoId,
    personaId: '__tour_demo__',
    summary: {
      summary: m7.mockVlmSummaryText,
      segments: m7.mockClaimSplitAtoms.map((c) => ({
        start: c.start,
        end: c.end,
        text: c.text,
      })),
      processingTime: 38.4,
      modelUsed: 'smolvlm-500m',
    },
  }

  const claimsExtractResponse = {
    claims: [
      {
        text: m7.mockCompoundClaimText,
        confidence: 0.83,
        roles: [],
        timeRange: {
          start: m7.mockClaimSplitAtoms[0]?.start ?? 0,
          end:
            m7.mockClaimSplitAtoms[m7.mockClaimSplitAtoms.length - 1]?.end ??
            m7.mockTranscript.duration,
        },
        needsSplit: true,
        splitTargets: m7.mockClaimSplitAtoms.map((c) => c.text),
      },
    ],
  }

  return [
    http.post('/api/ontology/augment', async () => {
      await simulatedInferenceDelay()
      return HttpResponse.json(augmentResponse)
    }),
    http.post('/api/videos/:videoId/detect', async () => {
      await simulatedInferenceDelay()
      return HttpResponse.json(detectionResponse)
    }),
    http.post('/api/videos/:videoId/track', async () => {
      await simulatedInferenceDelay()
      return HttpResponse.json(trackingResponse)
    }),
    http.post('/api/videos/:videoId/transcribe', async () => {
      await simulatedInferenceDelay()
      return HttpResponse.json(transcribeResponse)
    }),
    http.post('/api/videos/:videoId/summarize', async () => {
      await simulatedInferenceDelay()
      return HttpResponse.json(summarizeResponse)
    }),
    http.post('/api/claims/extract', async () => {
      await simulatedInferenceDelay()
      return HttpResponse.json(claimsExtractResponse)
    }),
  ]
}
