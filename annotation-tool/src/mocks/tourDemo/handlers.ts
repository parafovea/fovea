/**
 * MSW request handlers used by the tour demo mode.
 *
 * These intercept every backend route that would otherwise forward to
 * the model-service (detect, transcribe, augment ontology, summarize,
 * extract claims, track), resolve them from the precomputed fixtures
 * in `responses.ts`, and pause for a randomized 800-1800 ms so the
 * visitor sees a real-feeling "computing" beat without the booth
 * needing a GPU stack.
 *
 * Why a single delay range: every tour step that calls the model
 * service is implicitly framed as "first-call cold start", and the
 * range chosen here matches the perceived range a CPU-warm
 * deployment of the real model-service produces (faster-whisper-tiny
 * cold: 3-6 s; once warmed the synthetic 800-1800 ms range is short
 * enough to feel snappy but long enough to look like real inference).
 */

import { http, HttpResponse, delay } from 'msw'
import {
  TOUR3_ONTOLOGY_AUGMENT_SUGGESTIONS,
  TOUR6_DETECTION_PERSON_GRABBING_BALL,
  TOUR6_TRACKING_RESULT,
  TOUR7_CLAIMS_EXTRACTED,
  TOUR7_TRANSCRIBE_RESPONSE,
  TOUR7_VLM_SUMMARY,
} from './responses'

const MIN_DELAY_MS = 800
const MAX_DELAY_MS = 1800

/**
 * Pause for a random duration inside the synthetic-latency window so
 * the tour never produces the same wall-clock on two consecutive runs
 * (which would otherwise look canned to a careful observer).
 */
async function simulatedInferenceDelay(): Promise<void> {
  // Math.random() is fine here — there is no test-determinism need;
  // the unit suite injects its own non-MSW timing via test-level mocks.
  const ms = MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS))
  await delay(ms)
}

/**
 * Build the handler set against the backend's MODEL_SERVICE_URL,
 * which in the live frontend is the relative path under the same
 * origin (the dev proxy and the production reverse proxy both rewrite
 * `/api/...` to the backend). Same-origin routes are matched with a
 * leading slash; absolute URLs are listed alongside as a safety net
 * for builds that pin VITE_BACKEND_URL.
 */
function makeHandler<T extends object>(
  path: string,
  body: T,
): ReturnType<typeof http.post> {
  return http.post(path, async () => {
    await simulatedInferenceDelay()
    return HttpResponse.json(body)
  })
}

export const tourDemoHandlers = [
  // Tour 3 — ontology augmentation
  makeHandler('/api/ontology/augment', TOUR3_ONTOLOGY_AUGMENT_SUGGESTIONS),

  // Tour 6 — detection on the current frame
  makeHandler('/api/videos/:videoId/detect', TOUR6_DETECTION_PERSON_GRABBING_BALL),

  // Tour 6 — tracker results returned from the same detection path
  // when enableTracking flips the model-service over to the tracker.
  // We split the route so MSW can match the tracker call separately
  // if it ever moves to a distinct endpoint; today it shares /detect.
  http.post('/api/videos/:videoId/track', async () => {
    await simulatedInferenceDelay()
    return HttpResponse.json(TOUR6_TRACKING_RESULT)
  }),

  // Tour 7 — audio transcription (with diarization always-on for the
  // tour so the visitor sees the speaker chips lit up).
  makeHandler('/api/videos/:videoId/transcribe', TOUR7_TRANSCRIBE_RESPONSE),

  // Tour 7 — VLM summarization. The real backend wraps this in a job
  // queue; for the demo we return the summary synchronously since the
  // tour script doesn't include polling steps.
  http.post('/api/videos/:videoId/summarize', async () => {
    await simulatedInferenceDelay()
    return HttpResponse.json({
      jobId: 'demo-summary-job-001',
      videoId: '__tour_demo__',
      personaId: '__tour_demo__',
      // Return the final summary alongside the job id so the demo
      // hook can resolve immediately without driving a queue poll.
      summary: TOUR7_VLM_SUMMARY,
    })
  }),

  // Tour 7 — claim extraction over the saved summary.
  http.post('/api/claims/extract', async () => {
    await simulatedInferenceDelay()
    return HttpResponse.json({ claims: TOUR7_CLAIMS_EXTRACTED })
  }),
]
