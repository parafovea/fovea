/**
 * Mock model service for E2E tests.
 *
 * Implements every endpoint the production server hits at
 * MODEL_SERVICE_URL so the E2E stack drives every frontend-triggered
 * flow end-to-end without running the full Python service. Each
 * response matches the *real* Pydantic schema declared in
 *   model-service/src/infrastructure/adapters/inbound/fastapi/schemas/
 * because the backend reads specific snake_case fields from each
 * response (e.g. `frames`, `thumbnail_path`, `summary_id`) — if the
 * mock's response shape drifts the backend crashes downstream, which
 * is precisely the regression we want this mock to *catch* rather
 * than mask.
 *
 * For the thumbnail flow specifically: the model service writes the
 * image to a shared volume (`/test-videos/thumbnails/...`) and returns
 * the path in the JSON response. The backend then reads the file from
 * the same volume. The mock therefore writes a tiny PNG to the
 * expected on-disk path before returning the JSON; the volume mount
 * lives in `docker-compose.e2e.yml`.
 *
 * Endpoints implemented:
 *   GET    /models/config
 *   GET    /models/status
 *   POST   /models/select
 *   POST   /models/validate
 *   GET    /models/task-ready/:taskType
 *   POST   /models/load/:taskType
 *   POST   /models/unload/:taskType
 *   GET    /models/defaults
 *   GET    /models/frameworks
 *   POST   /detection/detect
 *   POST   /thumbnails/generate
 *   POST   /ontology/augment
 *   POST   /summarize
 *   POST   /extract-claims
 *   POST   /synthesize-summary
 *   POST   /admin/reconfigure
 *   POST   /tracking/track
 *   GET    /health
 */
const http = require('http')
const fs = require('fs')
const path = require('path')

const STORAGE_ROOT = process.env.STORAGE_PATH || '/test-videos'

function readJson(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        resolve({})
      }
    })
  })
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const ONE_PIXEL_JPG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AB//Z',
  'base64',
)

const TASK_TYPES = ['vad', 'diarization', 'transcription', 'detection', 'tracking', 'vlm']

// ---------------------------------------------------------------------------
// /api/models/*
// ---------------------------------------------------------------------------

function modelsConfig() {
  return {
    available_models: {
      detection: ['yolov8n', 'yolov8s'],
      tracking: ['bytetrack'],
      vad: ['silero'],
      diarization: ['pyannote'],
      transcription: ['whisper-tiny'],
      vlm: ['llava-1.5-7b'],
    },
    selected_models: {
      detection: 'yolov8n',
      tracking: 'bytetrack',
      vad: 'silero',
      diarization: 'pyannote',
      transcription: 'whisper-tiny',
      vlm: 'llava-1.5-7b',
    },
    device: 'cpu',
  }
}

function modelsStatus() {
  return {
    models: TASK_TYPES.map((task) => ({
      model_id: `${task}-mock`,
      task_type: task,
      health: 'loaded',
      memory_mb: 128,
    })),
    total_memory_mb: 768,
  }
}

function modelsDefaults() {
  return {
    detection: { confidence_threshold: 0.25, max_detections: 100 },
    tracking: { max_age: 30, min_hits: 3 },
    vad: { min_speech_duration_ms: 250 },
    diarization: {},
    transcription: { language: 'en' },
    vlm: { max_tokens: 256 },
  }
}

function modelsFrameworks() {
  return {
    frameworks: ['pytorch', 'onnx', 'transformers'],
    by_task: {
      detection: ['pytorch', 'onnx'],
      tracking: ['pytorch'],
      vad: ['pytorch'],
      diarization: ['pytorch'],
      transcription: ['pytorch', 'transformers'],
      vlm: ['pytorch', 'transformers'],
    },
  }
}

// ---------------------------------------------------------------------------
// /api/detection/detect — DetectionResponse (model-service detection.py:108)
// ---------------------------------------------------------------------------

function detectionResponse(body) {
  const videoId = (body && body.video_id) || 'mock-video'
  const query = (body && body.query) || 'mock-query'
  const frameNumbers = (body && Array.isArray(body.frame_numbers) ? body.frame_numbers : [0]).slice(0, 3)
  const frames = frameNumbers.map((frameNumber) => ({
    frame_number: frameNumber,
    timestamp: frameNumber * (1 / 30),
    detections: [
      {
        label: 'person',
        bounding_box: { x: 0.1, y: 0.1, width: 0.2, height: 0.3 },
        confidence: 0.9,
        track_id: null,
      },
    ],
  }))
  const total = frames.reduce((acc, f) => acc + f.detections.length, 0)
  return {
    id: `detect-${Date.now()}`,
    video_id: videoId,
    query,
    frames,
    total_detections: total,
    processing_time: 0.005,
  }
}

// ---------------------------------------------------------------------------
// /api/thumbnails/generate — ThumbnailGenerateResponse (common.py:124).
// The backend reads the file from /test-videos/thumbnails/{videoId}_{size}.jpg
// so the mock writes that file on the shared volume before returning.
// ---------------------------------------------------------------------------

function writeThumbnailFile(videoId, size) {
  const dir = path.join(STORAGE_ROOT, 'thumbnails')
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (err) {
    if (err && err.code !== 'EEXIST') throw err
  }
  const fileName = `${videoId}_${size}.jpg`
  const filePath = path.join(dir, fileName)
  fs.writeFileSync(filePath, ONE_PIXEL_JPG)
  return { thumbnail_path: filePath, fileName }
}

function thumbnailsResponse(body) {
  const videoId = (body && body.video_id) || 'mock-video'
  const size = (body && body.size) || 'medium'
  const timestamp = body && typeof body.timestamp === 'number' ? body.timestamp : 1.0
  const { thumbnail_path } = writeThumbnailFile(videoId, size)
  return { video_id: videoId, thumbnail_path, timestamp, size }
}

// ---------------------------------------------------------------------------
// /api/ontology/augment — AugmentResponse (ontology.py:75)
// ---------------------------------------------------------------------------

function ontologyAugmentResponse(body) {
  const personaId = (body && body.persona_id) || 'mock-persona'
  const targetCategory = (body && body.target_category) || 'entity'
  return {
    id: `aug-${Date.now()}`,
    persona_id: personaId,
    target_category: targetCategory,
    suggestions: [
      {
        name: 'mock_entity',
        description: 'Mock entity type suggested by E2E mock',
        parent: null,
        confidence: 0.9,
        examples: ['mock-example-1', 'mock-example-2'],
      },
    ],
    reasoning: 'Suggested by the E2E mock model service for coverage testing.',
  }
}

// ---------------------------------------------------------------------------
// /api/summarize — SummarizeResponse (summarization.py:143)
// ---------------------------------------------------------------------------

function summarizeResponse(body) {
  const videoId = (body && body.video_id) || 'mock-video'
  const personaId = (body && body.persona_id) || 'mock-persona'
  return {
    id: `summary-${Date.now()}`,
    video_id: videoId,
    persona_id: personaId,
    summary: 'Mock summary text generated by the E2E mock model service.',
    visual_analysis: 'Mock visual analysis.',
    audio_transcript: 'Mock audio transcript.',
    key_frames: [
      { frame_number: 0, timestamp: 0, description: 'Mock key frame', confidence: 0.9 },
    ],
    confidence: 0.85,
    transcript_json: null,
    audio_language: 'en',
    speaker_count: 1,
    audio_model_used: 'whisper-tiny-mock',
    visual_model_used: 'vlm-mock',
    fusion_strategy: 'mock',
    processing_time_audio: 0.005,
    processing_time_visual: 0.005,
    processing_time_fusion: 0.001,
  }
}

// ---------------------------------------------------------------------------
// /api/extract-claims — ClaimExtractionResponse (claims.py:116)
// ---------------------------------------------------------------------------

function extractClaimsResponse(body) {
  const summaryId = (body && body.summary_id) || 'mock-summary'
  return {
    summary_id: summaryId,
    claims: [
      {
        text: 'Mock claim extracted by the E2E mock model service.',
        sentence_index: 0,
        char_start: 0,
        char_end: 18,
        subclaims: [],
        confidence: 0.9,
      },
    ],
    model_used: 'mock-llm',
    processing_time: 0.005,
  }
}

// ---------------------------------------------------------------------------
// /api/synthesize-summary — SummarySynthesisResponse (claims.py:257)
// ---------------------------------------------------------------------------

function synthesizeSummaryResponse(body) {
  const summaryId = (body && body.summary_id) || 'mock-summary'
  return {
    summary_id: summaryId,
    summary_gloss: [
      { type: 'text', content: 'Mock synthesised summary produced by the E2E mock.' },
    ],
    model_used: 'mock-llm',
    processing_time: 0.005,
    claims_used: 1,
    synthesis_metadata: { strategy: 'mock' },
    thinking: null,
  }
}

// ---------------------------------------------------------------------------
// /api/tracking/track — TrackingResponse (tracking.py:90)
// ---------------------------------------------------------------------------

function trackingResponse(body) {
  const videoId = (body && body.video_id) || 'mock-video'
  return {
    id: `track-${Date.now()}`,
    video_id: videoId,
    frames: [],
    video_width: 640,
    video_height: 480,
    total_frames: 0,
    processing_time: 0.001,
    fps: 30,
  }
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = req.url || ''
  const method = req.method || 'GET'
  const pathname = url.split('?')[0]

  // Health.
  if (pathname === '/health') return send(res, 200, { status: 'ok' })

  if (method === 'GET') {
    if (pathname === '/api/models/config') return send(res, 200, modelsConfig())
    if (pathname === '/api/models/status') return send(res, 200, modelsStatus())
    if (pathname === '/api/models/defaults') return send(res, 200, modelsDefaults())
    if (pathname === '/api/models/frameworks') return send(res, 200, modelsFrameworks())
    const taskReady = pathname.match(/^\/api\/models\/task-ready\/([^/]+)$/)
    if (taskReady) return send(res, 200, { task_type: taskReady[1], ready: true })
    return send(res, 404, { detail: `Not found: ${method} ${pathname}` })
  }

  if (method === 'POST') {
    const body = await readJson(req)
    // axios forwards model-service requests with task_type / model_name in
    // the querystring (see server/src/routes/models.ts:204 — the route
    // declares them as querystring), so read from URL too.
    const qs = new URL(url, 'http://x').searchParams
    const taskTypeParam = qs.get('task_type') || qs.get('taskType') || body.task_type || body.taskType
    const modelNameParam = qs.get('model_name') || qs.get('modelName') || body.model_name || body.modelName
    if (pathname === '/api/models/select')
      return send(res, 200, { task_type: taskTypeParam, model_name: modelNameParam, status: 'selected' })
    if (pathname === '/api/models/validate')
      return send(res, 200, { valid: true, total_memory_mb: 768, budget_mb: 8000, headroom_mb: 7232 })
    const load = pathname.match(/^\/api\/models\/load\/([^/]+)$/)
    if (load) return send(res, 200, { task_type: load[1], status: 'loaded' })
    const unload = pathname.match(/^\/api\/models\/unload\/([^/]+)$/)
    if (unload) return send(res, 200, { task_type: unload[1], status: 'unloaded' })
    if (pathname === '/api/detection/detect') return send(res, 200, detectionResponse(body))
    if (pathname === '/api/thumbnails/generate') return send(res, 200, thumbnailsResponse(body))
    if (pathname === '/api/ontology/augment') return send(res, 200, ontologyAugmentResponse(body))
    if (pathname === '/api/summarize') return send(res, 200, summarizeResponse(body))
    if (pathname === '/api/extract-claims') return send(res, 200, extractClaimsResponse(body))
    if (pathname === '/api/synthesize-summary') return send(res, 200, synthesizeSummaryResponse(body))
    if (pathname === '/api/admin/reconfigure') return send(res, 200, { status: 'reconfigured' })
    if (pathname === '/api/tracking/track') return send(res, 200, trackingResponse(body))
    return send(res, 404, { detail: `Not found: ${method} ${pathname}` })
  }

  return send(res, 405, { detail: `Method not allowed: ${method} ${pathname}` })
})

const PORT = 8000
server.listen(PORT, () => {
  console.log(`Mock model service listening on port ${PORT} (STORAGE_ROOT=${STORAGE_ROOT})`)
})
