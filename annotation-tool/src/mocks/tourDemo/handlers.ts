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

  // The summary generation endpoint returns a JOB queue ticket
  // (GenerateSummaryResponse: { jobId, videoId, personaId }); the
  // frontend then polls /api/jobs/:id for the actual summary. Mirror
  // that shape so the immediate response validates against the
  // client type even if the polling path is not yet wired up.
  const summarizeResponse = {
    jobId: 'demo-summary-job-001',
    videoId: m7.videoId,
    personaId: '__tour_demo__',
  }

  // The claim extraction endpoint likewise returns a job ticket
  // (ExtractClaimsResponse: { jobId, status, summaryId, summaryType }).
  // The claim payloads in mockCompoundClaimText / mockClaimSplitAtoms
  // are delivered via the polled job-status response, not the
  // immediate queue acknowledgement.
  const claimsExtractResponse = {
    jobId: 'demo-claims-job-001',
    status: 'queued' as const,
    summaryId: 'demo-summary-001',
    summaryType: 'video',
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
    // The summarize + claim-extraction frontend hooks post to
    // `/api/videos/summaries/generate` and
    // `/api/summaries/:summaryId/claims/generate` (see
    // useSummaries.ts and useClaims.ts) — NOT the earlier
    // `videos/:videoId/summarize` / `claims/extract` paths that an
    // earlier draft of this file targeted. Match the real client
    // call sites so MSW actually intercepts the request in tour
    // demo mode.
    http.post('/api/videos/summaries/generate', async () => {
      await simulatedInferenceDelay()
      return HttpResponse.json(summarizeResponse)
    }),
    http.post('/api/summaries/:summaryId/claims/generate', async () => {
      await simulatedInferenceDelay()
      return HttpResponse.json(claimsExtractResponse)
    }),

    // After the queue-ticket POST, the frontend polls these two job
    // status endpoints for the actual payload. Without these handlers
    // the tour visitor sees the "Job queued" beat but never the mock
    // VLM summary text or the compound-claim split content.

    // GET /api/jobs/:jobId is the generic BullMQ status surface used
    // by the summary-generation polling loop (apiClient.getJobStatus
    // in src/api/client.ts:846). Return state=completed immediately
    // with returnvalue carrying a VideoSummary-shaped payload built
    // from m7.mockVlmSummaryText so the summary-editor renders the
    // mock text.
    http.get('/api/jobs/:jobId', async () => {
      await simulatedInferenceDelay()
      const nowIso = '2026-06-04T00:00:00.000Z'
      const videoSummary = {
        id: 'demo-summary-001',
        videoId: m7.videoId,
        personaId: '__tour_demo__',
        summary: [
          {
            type: 'text' as const,
            content: m7.mockVlmSummaryText,
          },
        ],
        visualAnalysis: m7.mockVlmSummaryText,
        audioTranscript: m7.mockTranscript.segments.map((s) => s.text).join(' '),
        keyFrames: null,
        confidence: 0.83,
        createdAt: nowIso,
        updatedAt: nowIso,
        audioLanguage: m7.mockTranscript.language,
        speakerCount: m7.mockTranscript.speakers.length,
        audioModelUsed: 'Systran/faster-whisper-tiny',
        visualModelUsed: 'smolvlm-500m',
        fusionStrategy: 'timestampAligned',
        processingTimeAudio: 6.18,
        processingTimeVisual: 38.4,
        processingTimeFusion: 1.21,
      }
      return HttpResponse.json({
        id: 'demo-summary-job-001',
        state: 'completed' as const,
        progress: 100,
        data: { videoId: m7.videoId, personaId: '__tour_demo__' },
        returnvalue: videoSummary,
        processedOn: Date.parse(nowIso),
        finishedOn: Date.parse(nowIso),
      })
    }),

    // GET /api/jobs/claims/:jobId is the claim-extraction job status
    // surface (useClaims.ts:144). Return status=completed with a
    // ClaimStructure-shaped result whose `claims` array carries the
    // compound claim PLUS its three split atoms as subclaims so the
    // tour's "split into atomic claims" step actually has rows to
    // operate against.
    http.get('/api/jobs/claims/:jobId', async () => {
      await simulatedInferenceDelay()
      const nowIso = '2026-06-04T00:00:00.000Z'
      const compoundStart = m7.mockClaimSplitAtoms[0]?.start ?? 0
      const compoundEnd =
        m7.mockClaimSplitAtoms[m7.mockClaimSplitAtoms.length - 1]?.end ??
        m7.mockTranscript.duration
      const claimStructure = {
        version: '1.0',
        claims: [
          {
            id: 'demo-claim-compound-001',
            text: m7.mockCompoundClaimText,
            confidence: 0.83,
            timeRange: { start: compoundStart, end: compoundEnd },
            subclaims: m7.mockClaimSplitAtoms.map((c, i) => ({
              id: `demo-claim-atom-${i + 1}`,
              text: c.text,
              confidence: 0.9,
              timeRange: { start: c.start, end: c.end },
              subclaims: [],
            })),
          },
        ],
        metadata: {
          extractedAt: nowIso,
          modelUsed: 'qwen2-5-1-5b-gguf',
          config: {
            maxClaims: 8,
            maxDepth: 2,
            includeTimeRanges: true,
            includeConfidence: true,
          },
          totalClaims: 1,
          totalSubclaims: m7.mockClaimSplitAtoms.length,
          maxDepth: 2,
        },
      }
      return HttpResponse.json({
        jobId: 'demo-claims-job-001',
        status: 'completed' as const,
        progress: 100,
        result: claimStructure,
      })
    }),
  ]
}
