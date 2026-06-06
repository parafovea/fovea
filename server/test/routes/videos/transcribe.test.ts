/**
 * Integration tests for POST /api/videos/:videoId/transcribe.
 *
 * The route forwards to the model-service's /api/transcribe endpoint and,
 * when enableDiarization is true, also forwards to /api/diarize and merges
 * per-second overlap so every transcript segment carries the speaker that
 * talked the longest within its interval. Diarization failures degrade
 * gracefully to a plain transcript so the user always sees text.
 *
 * The global fetch is mocked here because fetchModelService delegates to
 * the platform fetch under the hood; we never open a network connection.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import { transcribeRoutes } from '../../../src/routes/videos/transcribe.js'
import { AppError } from '../../../src/lib/errors.js'
import {
  ModelServiceTimeoutError,
  ModelServiceUnreachableError,
} from '../../../src/lib/fetchModelService.js'

interface FakeVideo {
  id: string
  path: string
}

const FAKE_VIDEO_ID = 'video-abc-123'
const FAKE_VIDEO_PATH = '/data/clip.mp4'
const EXPECTED_FORWARDED_PATH = '/videos/clip.mp4'

function buildVideoRepositoryStub(video: FakeVideo | null) {
  return {
    findByIdWithSelect: vi.fn(async () => video),
  }
}

async function buildApp(video: FakeVideo | null): Promise<{
  app: FastifyInstance
  videoRepository: ReturnType<typeof buildVideoRepositoryStub>
}> {
  const app = Fastify({ logger: false })
  const videoRepository = buildVideoRepositoryStub(video)

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send(error.toJSON())
    }
    return reply.code(500).send({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    })
  })

  // The route signature requires prisma even though it does not call it
  // directly in this code path; pass a typed sentinel.
  await app.register(transcribeRoutes, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    videoRepository: videoRepository as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma: {} as any,
  })
  await app.ready()

  return { app, videoRepository }
}

/**
 * Build a Response-like object that matches what fetchModelService returns.
 */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function textResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain' },
  })
}

const TRANSCRIBE_OK_BODY = {
  text: 'hello world',
  segments: [
    { start: 0, end: 5, text: 'hello', confidence: 0.95 },
    { start: 5, end: 10, text: 'world', confidence: 0.92 },
  ],
  language: 'en',
  duration: 10,
  processing_time: 1.5,
  model_used: 'faster-whisper-tiny',
}

const DIARIZE_OK_BODY = {
  segments: [
    { speaker: 'SPEAKER_00', start: 0, end: 4 },
    { speaker: 'SPEAKER_01', start: 4, end: 10 },
  ],
  speakers: ['SPEAKER_00', 'SPEAKER_01'],
  processing_time: 0.8,
  model_used: 'pyannote/speaker-diarization',
}

describe('POST /api/videos/:videoId/transcribe', () => {
  let app: FastifyInstance
  let fetchMock: ReturnType<typeof vi.fn>
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
  })

  afterEach(async () => {
    if (app) await app.close()
    globalThis.fetch = originalFetch
    vi.clearAllMocks()
  })

  it('returns 404 when the video does not exist', async () => {
    const r0 = await buildApp(null)
    app = r0.app

    const response = await app.inject({
      method: 'POST',
      url: `/api/videos/${FAKE_VIDEO_ID}/transcribe`,
      payload: {},
    })

    expect(response.statusCode).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forwards to /api/transcribe only and returns camelcased transcript when diarization is disabled', async () => {
    const built = await buildApp({ id: FAKE_VIDEO_ID, path: FAKE_VIDEO_PATH })
    app = built.app

    fetchMock.mockResolvedValueOnce(jsonResponse(200, TRANSCRIBE_OK_BODY))

    const response = await app.inject({
      method: 'POST',
      url: `/api/videos/${FAKE_VIDEO_ID}/transcribe`,
      payload: { language: 'en' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body).toMatchObject({
      text: 'hello world',
      language: 'en',
      duration: 10,
      processingTime: 1.5,
      modelUsed: 'faster-whisper-tiny',
    })
    expect(body.segments).toHaveLength(2)
    expect(body.segments[0]).toMatchObject({
      start: 0,
      end: 5,
      text: 'hello',
      confidence: 0.95,
    })
    expect(body.speakers).toBeUndefined()
    expect(body.diarizationModelUsed).toBeUndefined()
    expect(body.diarizationProcessingTime).toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toContain('/api/transcribe')
    expect(calledInit.method).toBe('POST')
    const forwardedBody = JSON.parse(calledInit.body as string) as {
      audio_path: string
      language: string | null
    }
    expect(forwardedBody.audio_path).toBe(EXPECTED_FORWARDED_PATH)
    expect(forwardedBody.language).toBe('en')
  })

  it('forwards to /api/transcribe AND /api/diarize and assigns the max-overlap speaker per segment', async () => {
    const built = await buildApp({ id: FAKE_VIDEO_ID, path: FAKE_VIDEO_PATH })
    app = built.app

    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/transcribe')) {
        return jsonResponse(200, TRANSCRIBE_OK_BODY)
      }
      if (url.endsWith('/api/diarize')) {
        return jsonResponse(200, DIARIZE_OK_BODY)
      }
      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/videos/${FAKE_VIDEO_ID}/transcribe`,
      payload: { enableDiarization: true, numSpeakers: 2 },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json() as {
      segments: Array<{ start: number; end: number; speaker: string }>
      speakers: string[]
      diarizationModelUsed: string
      diarizationProcessingTime: number
    }

    // Transcript seg [0-5] overlaps SPEAKER_00 [0-4] for 4s and SPEAKER_01
    // [4-10] for 1s; max-overlap wins -> SPEAKER_00.
    expect(body.segments[0].speaker).toBe('SPEAKER_00')
    // Transcript seg [5-10] overlaps SPEAKER_01 [4-10] for 5s and
    // SPEAKER_00 [0-4] for 0s -> SPEAKER_01.
    expect(body.segments[1].speaker).toBe('SPEAKER_01')

    expect(body.speakers).toEqual(['SPEAKER_00', 'SPEAKER_01'])
    expect(body.diarizationModelUsed).toBe('pyannote/speaker-diarization')
    expect(body.diarizationProcessingTime).toBe(0.8)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const transcribeCall = fetchMock.mock.calls.find(([u]) =>
      (u as string).endsWith('/api/transcribe'),
    )
    const diarizeCall = fetchMock.mock.calls.find(([u]) =>
      (u as string).endsWith('/api/diarize'),
    )
    expect(transcribeCall).toBeDefined()
    expect(diarizeCall).toBeDefined()

    const diarizeBody = JSON.parse((diarizeCall![1] as RequestInit).body as string) as {
      audio_path: string
      num_speakers: number | null
    }
    expect(diarizeBody.audio_path).toBe(EXPECTED_FORWARDED_PATH)
    expect(diarizeBody.num_speakers).toBe(2)
  })

  it('falls back to plain transcript with 200 when diarization returns non-2xx', async () => {
    const built = await buildApp({ id: FAKE_VIDEO_ID, path: FAKE_VIDEO_PATH })
    app = built.app

    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/transcribe')) {
        return jsonResponse(200, TRANSCRIBE_OK_BODY)
      }
      if (url.endsWith('/api/diarize')) {
        return textResponse(500, 'diarization model crashed')
      }
      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/videos/${FAKE_VIDEO_ID}/transcribe`,
      payload: { enableDiarization: true },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.text).toBe('hello world')
    expect(body.segments).toHaveLength(2)
    // No speaker field on segments, and no diarization metadata anywhere.
    expect(body.segments[0].speaker).toBeUndefined()
    expect(body.segments[1].speaker).toBeUndefined()
    expect(body.speakers).toBeUndefined()
    expect(body.diarizationModelUsed).toBeUndefined()
    expect(body.diarizationProcessingTime).toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns 500 with the upstream error text when /api/transcribe responds non-2xx', async () => {
    const built = await buildApp({ id: FAKE_VIDEO_ID, path: FAKE_VIDEO_PATH })
    app = built.app

    fetchMock.mockResolvedValueOnce(textResponse(500, 'whisper model crashed'))

    const response = await app.inject({
      method: 'POST',
      url: `/api/videos/${FAKE_VIDEO_ID}/transcribe`,
      payload: {},
    })

    expect(response.statusCode).toBe(500)
    const body = response.json()
    expect(body.error).toBe('MODEL_SERVICE_ERROR')
    expect(body.message).toContain('whisper model crashed')
  })

  it('returns 504 MODEL_SERVICE_TIMEOUT when /api/transcribe times out', async () => {
    const built = await buildApp({ id: FAKE_VIDEO_ID, path: FAKE_VIDEO_PATH })
    app = built.app

    // fetchModelService maps an AbortSignal.timeout firing into
    // ModelServiceTimeoutError; simulate by throwing a DOMException-like
    // error from the underlying fetch (name === 'TimeoutError').
    const timeoutErr = new Error('The operation timed out.')
    timeoutErr.name = 'TimeoutError'
    fetchMock.mockRejectedValueOnce(timeoutErr)

    const response = await app.inject({
      method: 'POST',
      url: `/api/videos/${FAKE_VIDEO_ID}/transcribe`,
      payload: {},
    })

    expect(response.statusCode).toBe(504)
    expect(response.json().error).toBe('MODEL_SERVICE_TIMEOUT')
  })

  it('returns 502 MODEL_SERVICE_UNREACHABLE when /api/transcribe is unreachable', async () => {
    const built = await buildApp({ id: FAKE_VIDEO_ID, path: FAKE_VIDEO_PATH })
    app = built.app

    // Any non-Abort error from fetch surfaces as ModelServiceUnreachableError.
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:8000'))

    const response = await app.inject({
      method: 'POST',
      url: `/api/videos/${FAKE_VIDEO_ID}/transcribe`,
      payload: {},
    })

    expect(response.statusCode).toBe(502)
    expect(response.json().error).toBe('MODEL_SERVICE_UNREACHABLE')
  })

  it('the typed timeout/unreachable error classes are still distinguishable', () => {
    // Sanity check that the imported error classes are what we expect; if
    // these get renamed or moved, this test reminds us to update the cases
    // above.
    expect(new ModelServiceTimeoutError('x', 1).name).toBe('ModelServiceTimeoutError')
    expect(new ModelServiceUnreachableError('x', new Error('y')).name).toBe(
      'ModelServiceUnreachableError',
    )
  })
})
