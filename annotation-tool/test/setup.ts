import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

/**
 * MSW 2.0 request handlers for API mocking.
 * Add handlers here as needed for testing API interactions.
 */
export const handlers = [
  http.get('/api/personas', () => {
    return HttpResponse.json([
      { id: '1', name: 'Test Persona', role: 'Analyst', informationNeed: 'Test need' }
    ])
  }),

  http.post('/api/personas', async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json({
      id: '2',
      ...body
    }, { status: 201 })
  }),

  http.get('/api/videos', () => {
    return HttpResponse.json([
      { id: '1', filename: 'test.mp4', path: '/data/videos/test.mp4' }
    ])
  }),

  // Video summaries endpoints
  http.get('http://localhost:3001/api/videos/:videoId/summaries', () => {
    return HttpResponse.json([
      {
        id: 'summary-1',
        videoId: 'video-1',
        personaId: 'persona-1',
        summary: 'Baseball scout analyzing pitcher mechanics during spring training game',
        visualAnalysis: 'Pitcher demonstrates consistent three-quarter arm slot with late breaking curveball',
        audioTranscript: null,
        keyFrames: [0, 150, 300],
        confidence: 0.92,
        createdAt: '2025-10-01T10:00:00Z',
        updatedAt: '2025-10-01T10:00:00Z',
      },
    ])
  }),

  http.get('http://localhost:3001/api/videos/:videoId/summaries/:personaId', ({ params }) => {
    const { personaId } = params
    if (personaId === 'persona-missing') {
      return new HttpResponse(null, { status: 404 })
    }
    return HttpResponse.json({
      id: 'summary-1',
      videoId: 'video-1',
      personaId: personaId as string,
      summary: 'Wildlife researcher documenting whale pod behavior',
      visualAnalysis: 'Three adult humpback whales surface in coordinated breathing pattern',
      audioTranscript: null,
      keyFrames: [0, 180, 360],
      confidence: 0.88,
      createdAt: '2025-10-01T10:00:00Z',
      updatedAt: '2025-10-01T10:00:00Z',
    })
  }),

  http.post('http://localhost:3001/api/videos/summaries/generate', async ({ request }) => {
    const body = await request.json() as { videoId: string; personaId: string }
    return HttpResponse.json(
      {
        jobId: 'job-123',
        videoId: body.videoId,
        personaId: body.personaId,
      },
      { status: 202 }
    )
  }),

  http.get('http://localhost:3001/api/jobs/:jobId', ({ params }) => {
    const { jobId } = params
    if (jobId === 'job-active') {
      return HttpResponse.json({
        id: 'job-active',
        state: 'active',
        progress: 50,
        data: {
          videoId: 'video-1',
          personaId: 'persona-1',
        },
      })
    }
    if (jobId === 'job-completed') {
      return HttpResponse.json({
        id: 'job-completed',
        state: 'completed',
        progress: 100,
        data: {
          videoId: 'video-1',
          personaId: 'persona-1',
        },
        returnvalue: {
          id: 'summary-1',
          videoId: 'video-1',
          personaId: 'persona-1',
          summary: 'Retail analyst studying customer flow patterns',
          visualAnalysis: 'Peak traffic occurs near product displays with promotional signage',
          audioTranscript: null,
          keyFrames: [0, 200, 400],
          confidence: 0.85,
          createdAt: '2025-10-01T10:00:00Z',
          updatedAt: '2025-10-01T10:00:00Z',
        },
        finishedOn: Date.now(),
      })
    }
    if (jobId === 'job-failed') {
      return HttpResponse.json({
        id: 'job-failed',
        state: 'failed',
        progress: 70,
        data: {
          videoId: 'video-1',
          personaId: 'persona-1',
        },
        failedReason: 'Video file not found',
      })
    }
    return HttpResponse.json({
      id: jobId as string,
      state: 'waiting',
      progress: 0,
      data: {
        videoId: 'video-1',
        personaId: 'persona-1',
      },
    })
  }),

  http.post('http://localhost:3001/api/summaries', async ({ request }) => {
    const body = await request.json() as {
      videoId: string
      personaId: string
      summary: string
    }
    return HttpResponse.json(
      {
        id: 'summary-new',
        ...body,
        createdAt: '2025-10-01T10:00:00Z',
        updatedAt: '2025-10-01T10:00:00Z',
      },
      { status: 201 }
    )
  }),

  http.delete('http://localhost:3001/api/videos/:videoId/summaries/:personaId', () => {
    return new HttpResponse(null, { status: 204 })
  })
]

/**
 * MSW server instance for intercepting network requests in tests.
 */
export const server = setupServer(...handlers)

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})

/**
 * Mock IntersectionObserver for components that use it.
 * Many UI components rely on this browser API which is not available in jsdom.
 */
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}))

/**
 * Mock ResizeObserver for components that use it.
 * Required by some Material-UI components.
 */
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}))

/**
 * Mock matchMedia for responsive components.
 * Required by Material-UI and other responsive UI libraries.
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
