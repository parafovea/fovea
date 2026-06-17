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

  // ── Demo-public data layer: mocks of the auth + config + persona +
  // video endpoints the Layout / VideoBrowser / AnnotationWorkspace
  // chain calls on mount. Without these the booth visitor (and the
  // local E2E preview) hits real /api/* paths that 401 or 404 (no
  // backend behind the static preview), the Layout renders the
  // "No videos found" empty state, and every tour anchored to a
  // video card or the annotation workspace fails to resolve.
  //
  // The video IDs and filenames mirror the deterministic MD5-derived
  // ids the production S3 sync writes to the live `videos` table on
  // demo.fovea.video, so the same `routeParams.videoId` values the
  // tour scripts hard-code resolve identically against the mock
  // corpus and the live corpus.
  const nowIso = '2026-06-04T00:00:00.000Z'
  const demoUser = {
    id: 'demo-anonymous-mock-user',
    username: 'demo-anonymous-mock',
    email: 'demo-anonymous-mock@example.com',
    displayName: 'Demo visitor',
    // The Admin tour walks through `/app/admin`; that page is gated
    // on systemRole === 'system_admin' (see server/src/lib/abilities.ts
    // and AdminPanel's route guard). Booth visitors on the real live
    // deploy hit it through the FOVEA_DEMO_MODE override which
    // returns 'all' for video access regardless of role, but the
    // local MSW preview has no equivalent — without flagging the
    // mock user as system_admin the Admin tour's anchor never mounts
    // and the spec fails. Production behaviour is unchanged
    // (FOVEA_DEMO_MODE is the real-deploy gate, not this mock).
    systemRole: 'system_admin',
    isAdmin: true,
    isActive: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  }
  const demoConfig = {
    mode: 'multi-user' as const,
    allowRegistration: false,
    foveaDemoMode: true,
    storageType: 's3',
    sessionTimeoutMinutes: 30,
  }
  const automatedPersona = {
    id: 'automated-persona-id',
    name: 'Automated',
    description: 'Default persona for the demo tour.',
    color: '#9CA3AF',
    isSystemGenerated: true,
    ownerId: demoUser.id,
    createdAt: nowIso,
    updatedAt: nowIso,
  }
  const DEMO_VIDEOS = [
    {
      id: '049f160046238b2f',
      filename:
        'Crossing Broad - The angle from the stands of the Phillies Karen incident has been fou... [1964175938037465088].mp4',
      title: 'Crossing Broad — Phillies Karen incident (stands angle)',
    },
    {
      id: '8d9e6762f54408f4',
      filename:
        "Collin Rugg - NEW： 'Karen' Phillies fan goes viral for berating a man for grabbing ... [1964336942667223043].mp4",
      title: "Collin Rugg — 'Karen' Phillies fan goes viral",
    },
    {
      id: 'b38ba94463da70f8',
      filename:
        'John Cremeans - Make Her Famous： Full blown Karen claims the ball is hers, after a Da... #1 [1964275474009305088].mp4',
      title: 'John Cremeans — Karen claims the ball #1',
    },
    {
      id: '55fd0bc2f84b11f8',
      filename:
        'John Cremeans - Make Her Famous： Full blown Karen claims the ball is hers, after a Da... #2 [1964275474013532160].mp4',
      title: 'John Cremeans — Karen claims the ball #2',
    },
    {
      id: 'cd0b278719bea692',
      filename:
        "Amiri King - Here's footage of the baseball Karen getting heckled by her entire se... [1964355526243856384].mp4",
      title: 'Amiri King — baseball Karen heckled by section',
    },
    {
      id: '1fd9993237cbc33b',
      filename:
        'ABC7 Eyewitness News - New video shows the moment when nearly an entire column of shipping c... [1965554565933121536].mp4',
      title: 'ABC7 — shipping container column collapse',
    },
  ]
  const demoVideos = DEMO_VIDEOS.map((v) => ({
    ...v,
    path: `/videos/${v.filename}`,
    duration: 42.0,
    resolution: '1280x720',
    frameRate: 30,
    fileSize: 4_500_000,
    sourcePlatform: 'twitter',
    platformVideoId: v.id,
    metadata: {},
    metadataSyncStatus: 'synced',
    lastMetadataSync: nowIso,
    localThumbnailPath: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  }))
  const dataLayerHandlers = [
    // Anonymous-session bootstrap fired by main.tsx on first paint.
    // The real endpoint sets an httpOnly cookie; locally we just
    // acknowledge so the bootstrap promise resolves and the boot
    // sequence proceeds.
    http.post('/api/demo/anonymous-session', () =>
      HttpResponse.json({ userId: demoUser.id, expiresAt: nowIso }),
    ),
    http.get('/api/auth/me', () => HttpResponse.json(demoUser)),
    http.get('/api/auth/session-status', () =>
      HttpResponse.json({
        active: true,
        expiresAt: '2099-01-01T00:00:00.000Z',
        timeUntilExpiry: 3_600_000,
        showWarning: false,
      }),
    ),
    http.get('/api/config', () => HttpResponse.json(demoConfig)),
    http.get('/api/personas', () => HttpResponse.json([automatedPersona])),
    // Persona-scoped writes (rename, delete, etc.) — accept and echo.
    http.put('/api/personas/:personaId', async ({ request }) => {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
      return HttpResponse.json({ ...automatedPersona, ...body })
    }),
    http.delete('/api/personas/:personaId', () => HttpResponse.json({ ok: true })),
    // Ontology fetch + write. The MSW preview is intended for local
    // tour-flow probing where the real backend is not available; we
    // serve a populated ontology so OntologyWorkspace renders the tabs
    // + FAB + GlossEditor (which the gloss-reference tour walks into)
    // instead of crashing on undefined `entities.length` when the real
    // /api/personas/:id/ontology endpoint 401s through the dev proxy.
    http.get('/api/personas/:personaId/ontology', ({ params }) =>
      HttpResponse.json({
        personaId: params.personaId,
        entities: [
          {
            id: 'spectator',
            name: 'Spectator',
            gloss: [
              { type: 'text', content: 'A person watching the event from the stands or area.' },
            ],
          },
          {
            id: 'usher',
            name: 'Guest Services Usher',
            gloss: [
              { type: 'text', content: 'A staff member assigned to assist guests in the section.' },
            ],
          },
          {
            id: 'souvenir',
            name: 'Souvenir',
            gloss: [{ type: 'text', content: 'A token taken home from the event, e.g. a foul ball.' }],
          },
        ],
        roles: [
          {
            id: 'grabber',
            name: 'grabber',
            gloss: [{ type: 'text', content: 'The actor who seized the souvenir.' }],
            allowedFillerTypes: ['spectator'],
          },
          {
            id: 'prior-holder',
            name: 'prior-holder',
            gloss: [{ type: 'text', content: 'The actor who held the souvenir first.' }],
            allowedFillerTypes: ['spectator'],
          },
        ],
        events: [
          {
            id: 'ball-grab',
            name: 'ball-grab',
            gloss: [{ type: 'text', content: 'One spectator takes a souvenir from another.' }],
            roles: ['grabber', 'prior-holder'],
          },
        ],
        relationTypes: [
          {
            id: 'adjacent-to',
            name: 'adjacent-to',
            gloss: [{ type: 'text', content: 'Two seats sharing a section divider.' }],
            sourceTypes: ['spectator'],
            targetTypes: ['spectator'],
          },
        ],
      }),
    ),
    http.put('/api/personas/:personaId/ontology', async ({ request, params }) => {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
      return HttpResponse.json({ personaId: params.personaId, ...body })
    }),
    http.get('/api/users/me/preferences', () =>
      HttpResponse.json({ selectedPersonaId: automatedPersona.id }),
    ),
    http.put('/api/users/me/preferences', async ({ request }) => {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
      return HttpResponse.json(body)
    }),
    http.get('/api/videos', () => HttpResponse.json(demoVideos)),
    http.get('/api/videos/:videoId', ({ params }) => {
      const v = demoVideos.find((x) => x.id === params.videoId)
      if (!v)
        return HttpResponse.json(
          { error: 'Not found', message: 'Video not found' },
          { status: 404 },
        )
      return HttpResponse.json(v)
    }),
    http.get('/api/videos/:videoId/annotations', () => HttpResponse.json([])),
    // The VideoBrowser fires this lookup per card; 404 means "no
    // summary for this video/persona pair yet" and the frontend
    // handles it gracefully (client.ts:810 — returns null).
    http.get('/api/videos/:videoId/summaries/:personaId', () =>
      HttpResponse.json(
        { error: 'Not found', message: 'No summary' },
        { status: 404 },
      ),
    ),
    // Same idea for the world-state lookup the world workspace
    // makes on mount.
    http.get('/api/world-state/:personaId', () => HttpResponse.json(null)),
  ]

  // The data-layer mocks (auth, config, personas, videos, summaries,
  // world-state) are NEVER shipped to the live demo deployment — on
  // demo.fovea.video the booth visitor's anonymous session resolves
  // against the real backend and the real S3-synced video corpus
  // the tours are anchored to. The data-layer fixtures only exist
  // so the local E2E preview (vite preview, no backend behind it)
  // can render the workspace shell deterministically. The gate is
  // statically analysable by Vite so the entire `dataLayerHandlers`
  // array tree-shakes out of any production bundle that does not
  // set VITE_E2E=1 — keeping the prod demo path honest while still
  // letting the rigorous walkthrough spec exercise the engine
  // against a stable, backend-free fixture.
  // Kept INLINE (not routed through config): this literal comparison is what
  // lets Vite statically drop the `dataLayerHandlers` array (and its fixture
  // data) from any tour-demo build that does not set VITE_E2E=1.
  // eslint-disable-next-line no-restricted-syntax
  const includeDataLayer = import.meta.env.VITE_E2E === '1'
  return [
    ...(includeDataLayer ? dataLayerHandlers : []),
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
