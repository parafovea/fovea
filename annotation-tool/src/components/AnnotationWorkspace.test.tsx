/**
 * Tests for AnnotationWorkspace component.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import React from 'react'
import AnnotationWorkspace from './AnnotationWorkspace'
import videoSlice from '../store/videoSlice'
import annotationSlice from '../store/annotationSlice'
import personaSlice from '../store/personaSlice'
import worldSlice from '../store/worldSlice'
import videoSummarySlice from '../store/videoSummarySlice'
import { server } from '../../test/setup'
import { http, HttpResponse } from 'msw'

/**
 * Mock video.js player to avoid DOM video player complexity in tests.
 */
vi.mock('video.js', () => ({
  default: vi.fn((_element, _options) => {
    const mockPlayer = {
      ready: vi.fn((callback) => callback()),
      on: vi.fn(),
      dispose: vi.fn(),
      pause: vi.fn(),
      play: vi.fn(),
      currentTime: vi.fn((time?: number) => {
        if (time !== undefined) return mockPlayer
        return 0
      }),
      duration: vi.fn(() => 300),
      error: vi.fn(() => null),
      el: vi.fn(() => ({
        querySelector: vi.fn(() => ({
          style: {},
        })),
      })),
    }
    return mockPlayer
  }),
}))

/**
 * Mock AnnotationEditor to avoid complex form dependencies in tests.
 */
vi.mock('./AnnotationEditor', () => ({
  default: ({ open }: { open: boolean }) => open ? <div data-testid="annotation-editor">Annotation Editor</div> : null,
}))

/**
 * Mock VideoSummaryDialog to avoid complex dialog dependencies in tests.
 */
vi.mock('./VideoSummaryDialog', () => ({
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div role="dialog" data-testid="video-summary-dialog">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}))

/**
 * Mock DetectionDialog to simplify detection testing.
 */
vi.mock('./dialogs/DetectionDialog', () => ({
  DetectionDialog: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div role="dialog" data-testid="detection-dialog">
        <button onClick={onClose}>Cancel</button>
      </div>
    ) : null,
}))

/**
 * Mock AnnotationOverlay to avoid canvas complexity.
 */
vi.mock('./AnnotationOverlay', () => ({
  default: () => <div data-testid="annotation-overlay">Overlay</div>,
}))

/**
 * Mock AnnotationAutocomplete to avoid ontology dependencies.
 */
vi.mock('./annotation/AnnotationAutocomplete', () => ({
  default: () => <div data-testid="annotation-autocomplete">Autocomplete</div>,
}))

/**
 * Mock AnnotationCandidatesList to simplify detection results testing.
 */
vi.mock('./AnnotationCandidatesList', () => ({
  AnnotationCandidatesList: () => <div data-testid="annotation-candidates">Candidates</div>,
}))

/**
 * Creates a test Redux store with all required slices.
 *
 * @param initialState - Initial state for the store
 * @returns Configured Redux store for testing
 */
function createTestStore(initialState = {}) {
  return configureStore({
    reducer: {
      videos: videoSlice,
      annotations: annotationSlice,
      persona: personaSlice,
      world: worldSlice,
      videoSummaries: videoSummarySlice,
    },
    preloadedState: initialState,
  })
}

/**
 * Creates a wrapper component with all required providers for AnnotationWorkspace.
 *
 * @param store - Redux store instance
 * @param videoId - Video ID to use in route params
 * @returns React wrapper component with providers
 */
function createWrapper(store: ReturnType<typeof createTestStore>, videoId = 'video-1') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/annotate/${videoId}`]}>
          <Routes>
            <Route path="/annotate/:videoId" element={children} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>
  )
}

/**
 * Mock video metadata for a film continuity tracking scenario.
 */
const mockFilmVideo = {
  id: 'video-1',
  filename: 'film-scene-take3.mp4',
  title: 'Scene 42 Take 3 - Coffee Shop Interior',
  description: 'Film continuity check for Scene 42, focusing on prop placement and actor positions',
  uploader: 'Production Team',
  uploader_id: 'filmcrew',
  uploader_url: 'https://example.com/filmcrew',
  webpage_url: 'https://example.com/film-scene',
  duration: 180,
  width: 1920,
  height: 1080,
  fps: 24,
  timestamp: '2025-09-15T14:30:00Z',
  like_count: 45,
  comment_count: 12,
  formats: [],
}

/**
 * Mock video metadata for a sports play analysis scenario.
 */
const mockSportsVideo = {
  id: 'video-2',
  filename: 'basketball-game1.mp4',
  title: 'Basketball Tournament - Quarter Finals',
  description: 'Team offensive patterns and defensive strategy analysis',
  uploader: 'Sports Analytics',
  uploader_id: 'sportsanalytics',
  duration: 600,
  width: 1920,
  height: 1080,
  fps: 30,
  formats: [],
}

/**
 * Mock personas for diverse testing scenarios.
 */
const mockPersonas = [
  {
    id: 'persona-1',
    name: 'Film Continuity Supervisor',
    role: 'Script Supervisor',
    informationNeed: 'Track prop positions, costumes, and actor blocking across takes',
  },
  {
    id: 'persona-2',
    name: 'Basketball Coach',
    role: 'Offensive Coordinator',
    informationNeed: 'Analyze play formations, player movements, and shot selection',
  },
]

/**
 * Creates default test state with all required slices populated.
 *
 * @returns Default state object for tests
 */
function createDefaultTestState() {
  return {
    persona: {
      personas: mockPersonas,
      personaOntologies: [],
    },
  }
}

/**
 * Waits for video to load by checking for unique description text.
 */
async function waitForVideoLoad() {
  await waitFor(() => {
    expect(screen.getByText(/Film continuity check/i)).toBeInTheDocument()
  }, { timeout: 3000 })
}

describe('AnnotationWorkspace', () => {
  beforeEach(() => {
    // Mock video metadata endpoint
    server.use(
      http.get('/api/videos/video-1', () => {
        return HttpResponse.json(mockFilmVideo)
      }),
      http.get('/api/videos/video-2', () => {
        return HttpResponse.json(mockSportsVideo)
      })
    )
  })

  describe('Video Loading and Rendering', () => {
    it('loads video metadata on mount', async () => {
      const store = createTestStore(createDefaultTestState())
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitForVideoLoad()

      expect(screen.getByText(/Production Team/)).toBeInTheDocument()
    })

    it('renders video player element', async () => {
      const store = createTestStore(createDefaultTestState())
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitForVideoLoad()

      const videoElement = document.querySelector('video')
      expect(videoElement).toBeInTheDocument()
    })

    it('shows video metadata including uploader and description', async () => {
      const store = createTestStore(createDefaultTestState())
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitForVideoLoad()

      expect(screen.getByText(/Film continuity check for Scene 42/)).toBeInTheDocument()
      expect(screen.getByText(/@filmcrew/)).toBeInTheDocument()
      expect(screen.getByText('View Original')).toBeInTheDocument()
    })

    it('displays engagement metrics when available', async () => {
      const store = createTestStore(createDefaultTestState())
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(screen.getByText('45')).toBeInTheDocument()
      })

      expect(screen.getByText('12')).toBeInTheDocument()
    })
  })

  describe('Annotation Toolbar', () => {
    it('shows annotation mode toggle', async () => {
      const store = createTestStore(createDefaultTestState())
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitForVideoLoad()

      const toggleButtons = screen.getAllByRole('button')
      expect(toggleButtons.some(btn => btn.textContent === 'Type' && btn.getAttribute('value') === 'type')).toBe(true)
      expect(toggleButtons.some(btn => btn.textContent === 'Object' && btn.getAttribute('value') === 'object')).toBe(true)
    })

    it('shows persona selector', async () => {
      const store = createTestStore(createDefaultTestState())
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitForVideoLoad()

      expect(screen.getByLabelText('Select Persona')).toBeInTheDocument()
    })

    it('shows Edit Summary button', async () => {
      const store = createTestStore(createDefaultTestState())
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitForVideoLoad()

      expect(screen.getByRole('button', { name: /Edit Summary/i })).toBeInTheDocument()
    })
  })

  describe('CPU-Only Mode Detection', () => {
    it('hides Detect Objects button when CUDA is unavailable', async () => {
      server.use(
        http.get('http://localhost:3001/api/models/config', () => {
          return HttpResponse.json({
            models: {
              vlm: { selected: 'llava', options: {} },
              detection: { selected: 'owlv2', options: {} },
            },
            cuda_available: false,
          })
        })
      )

      const store = createTestStore(createDefaultTestState())
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitForVideoLoad()

      const detectButton = screen.getByRole('button', { name: /Detect Objects/i })
      expect(detectButton).toBeDisabled()
    })

    it('shows enabled Detect Objects button when CUDA is available', async () => {
      server.use(
        http.get('http://localhost:3001/api/models/config', () => {
          return HttpResponse.json({
            models: {
              vlm: { selected: 'llava', options: {} },
              detection: { selected: 'owlv2', options: {} },
            },
            cuda_available: true,
          })
        })
      )

      const store = createTestStore(createDefaultTestState())
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitForVideoLoad()

      const detectButton = screen.getByRole('button', { name: /Detect Objects/i })
      expect(detectButton).not.toBeDisabled()
    })
  })

  describe('Detection Dialog', () => {
    it('opens detection dialog when button is clicked', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultTestState())
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitForVideoLoad()

      const detectButton = screen.getByRole('button', { name: /Detect Objects/i })
      await user.click(detectButton)

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })
    })

    it('closes detection dialog when close button is clicked', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultTestState())
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitForVideoLoad()

      const detectButton = screen.getByRole('button', { name: /Detect Objects/i })
      await user.click(detectButton)

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      const closeButton = screen.getByRole('button', { name: /Cancel/i })
      await user.click(closeButton)

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })
  })

  describe('Summary Dialog', () => {
    it('opens summary dialog when Edit Summary button is clicked', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultTestState())
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitForVideoLoad()

      const summaryButton = screen.getByRole('button', { name: /Edit Summary/i })
      await user.click(summaryButton)

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })
    })

    it('closes summary dialog when close button is clicked', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultTestState())
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitForVideoLoad()

      const summaryButton = screen.getByRole('button', { name: /Edit Summary/i })
      await user.click(summaryButton)

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      const closeButton = screen.getAllByRole('button', { name: /Close/i })[0]
      await user.click(closeButton)

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })
  })

  describe('Annotation Mode Switching', () => {
    it('switches from Type mode to Object mode', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultTestState())
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitForVideoLoad()

      const toggleButtons = screen.getAllByRole('button', { pressed: false })
      const objectButton = toggleButtons.find(btn => btn.textContent === 'Object' && btn.getAttribute('value') === 'object')
      expect(objectButton).toBeDefined()

      await user.click(objectButton!)

      expect(objectButton).toHaveAttribute('aria-pressed', 'true')
    })

    it('disables persona selector in Object mode', async () => {
      const defaultState = createDefaultTestState()
      const store = createTestStore({
        ...defaultState,
        annotations: {
          annotations: {},
          annotationMode: 'object',
          selectedAnnotation: null,
          selectedPersonaId: null,
          isDrawing: false,
          drawingMode: null,
          selectedTypeId: null,
          temporaryBox: null,
          temporaryTime: null,
          linkTargetId: null,
          linkTargetType: null,
          detectionResults: null,
          detectionQuery: '',
          detectionConfidenceThreshold: 0.5,
          showDetectionCandidates: false,
        },
      })
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitForVideoLoad()

      const personaSelect = screen.getByLabelText('Select Persona')
      expect(personaSelect).toHaveAttribute('aria-disabled', 'true')
    })
  })

  describe('Video Playback Controls', () => {
    it('shows play/pause button', async () => {
      const store = createTestStore(createDefaultTestState())
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitForVideoLoad()

      const playButtons = screen.getAllByRole('button')
      const playButton = playButtons.find((button) =>
        button.querySelector('svg[data-testid="PlayArrowIcon"]')
      )
      expect(playButton).toBeInTheDocument()
    })

    it('shows frame navigation buttons', async () => {
      const store = createTestStore(createDefaultTestState())
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitForVideoLoad()

      const buttons = screen.getAllByRole('button')
      const nextFrameButton = buttons.find((button) =>
        button.querySelector('svg[data-testid="SkipNextIcon"]')
      )
      const prevFrameButton = buttons.find((button) =>
        button.querySelector('svg[data-testid="SkipPreviousIcon"]')
      )

      expect(nextFrameButton).toBeInTheDocument()
      expect(prevFrameButton).toBeInTheDocument()
    })

    it('shows timeline slider', async () => {
      const store = createTestStore(createDefaultTestState())
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitForVideoLoad()

      const slider = screen.getByRole('slider')
      expect(slider).toBeInTheDocument()
    })

    it('displays current time and duration', async () => {
      const store = createTestStore(createDefaultTestState())
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitForVideoLoad()

      expect(screen.getByText(/0:00/)).toBeInTheDocument()
    })
  })

  describe('Annotation List', () => {
    it('shows empty state when no annotations exist', async () => {
      const store = createTestStore({
        ...createDefaultTestState(),
        annotations: {
          annotations: {},
        },
      })
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitForVideoLoad()

      expect(screen.getByText(/No annotations yet/)).toBeInTheDocument()
    })

    it('displays annotation count', async () => {
      const store = createTestStore({
        ...createDefaultTestState(),
        annotations: {
          annotations: {
            'video-1': [
              {
                id: 'ann-1',
                annotationType: 'type',
                typeCategory: 'entity',
                typeId: 'coffee-cup',
                personaId: 'persona-1',
                timeSpan: { startTime: 10, endTime: 20 },
                boundingBox: { x: 0.5, y: 0.5, width: 0.1, height: 0.1 },
              },
              {
                id: 'ann-2',
                annotationType: 'type',
                typeCategory: 'entity',
                typeId: 'script',
                personaId: 'persona-1',
                timeSpan: { startTime: 30, endTime: 40 },
                boundingBox: { x: 0.3, y: 0.3, width: 0.1, height: 0.1 },
              },
            ],
          },
        },
      })
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitForVideoLoad()

      expect(screen.getByText(/All Annotations \(2\)/)).toBeInTheDocument()
    })
  })

  describe('Ontology Navigation', () => {
    it('shows floating action button for ontology builder', async () => {
      const store = createTestStore(createDefaultTestState())
      const Wrapper = createWrapper(store, 'video-1')

      render(<AnnotationWorkspace />, { wrapper: Wrapper })

      await waitForVideoLoad()

      const fab = screen.getByRole('button', { name: /go to ontology/i })
      expect(fab).toBeInTheDocument()
    })
  })
})
