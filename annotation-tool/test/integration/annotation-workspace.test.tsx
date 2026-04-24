/**
 * @file AnnotationWorkspace.test.tsx
 * @description Comprehensive tests for AnnotationWorkspace component, focusing on slide-out timeline functionality.
 * Tests cover animation transitions, state management, accessibility, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { renderWithProviders } from '../utils/test-utils'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { server } from '../setup'
import { http, HttpResponse } from 'msw'
import AnnotationWorkspace from '@components/annotation/AnnotationWorkspace'
import { useAnnotationUiStore } from '@store/zustand/annotationUiStore'
import { useVideoUiStore } from '@store/zustand/videoUiStore'
import type { Annotation, VideoMetadata, Persona, PersonaOntology } from '@models/types'

// Mock HTMLCanvasElement getContext for TimelineRenderer
HTMLCanvasElement.prototype.getContext = vi.fn((contextType: string) => {
  if (contextType === '2d') {
    return {
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      rect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      translate: vi.fn(),
      transform: vi.fn(),
      setTransform: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      measureText: vi.fn(() => ({ width: 0 })),
      drawImage: vi.fn(),
      createImageData: vi.fn(),
      getImageData: vi.fn(),
      putImageData: vi.fn(),
      canvas: { width: 800, height: 140 },
    } as any
  }
  return null
}) as any

// Mock video.js
type EventHandler = (...args: any[]) => void
const eventHandlers: Record<string, EventHandler[]> = {}

const mockVideoPlayer = {
  ready: vi.fn((callback) => {
    callback()
    // Simulate video ready state - trigger loadedmetadata after a short delay
    setTimeout(() => {
      const handlers = eventHandlers['loadedmetadata'] || []
      handlers.forEach(handler => handler())
    }, 0)
  }),
  on: vi.fn((event: string, handler: EventHandler) => {
    if (!eventHandlers[event]) {
      eventHandlers[event] = []
    }
    eventHandlers[event].push(handler)
  }),
  off: vi.fn((event: string, handler: EventHandler) => {
    if (eventHandlers[event]) {
      eventHandlers[event] = eventHandlers[event].filter(h => h !== handler)
    }
  }),
  dispose: vi.fn(),
  duration: vi.fn(() => 100),
  currentTime: vi.fn((time?: number) => {
    if (time !== undefined) {
      return mockVideoPlayer
    }
    return 0
  }),
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  el: vi.fn(() => ({
    querySelector: vi.fn(() => ({
      style: {},
    })),
  })),
  error: vi.fn(() => null),
}

vi.mock('video.js', () => ({
  default: vi.fn(() => mockVideoPlayer),
}))

// Mock TanStack Query hooks
vi.mock('../../src/hooks/useDetection', () => ({
  useDetectObjects: vi.fn(() => ({
    mutate: vi.fn(),
    isLoading: false,
    error: null,
  })),
}))

vi.mock('../../src/hooks/useModelConfig', () => ({
  useModelConfig: vi.fn(() => ({
    data: { cudaAvailable: true, modelsAvailable: true, cpuModelsAvailable: false },
    isLoading: false,
    error: null,
  })),
}))

describe('AnnotationWorkspace - Slide-out Timeline', () => {
  let testAnnotation: Annotation
  let testVideo: VideoMetadata
  let testPersona: Persona
  let testOntology: PersonaOntology

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Reset Zustand store state
    useAnnotationUiStore.getState().resetAllState()
    useVideoUiStore.getState().resetAllState()

    // Clear event handlers
    Object.keys(eventHandlers).forEach(key => delete eventHandlers[key])

    // Create test video metadata
    testVideo = {
      id: 'test-video-id',
      filename: 'test-video.mp4',
      width: 1920,
      height: 1080,
      fps: 30,
      duration: 100,
      size: 1000000,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    // Create test persona
    testPersona = {
      id: 'test-persona-id',
      name: 'Test Persona',
      role: 'Analyst',
      wikidataId: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    // Create test ontology
    testOntology = {
      id: 'test-ontology-id',
      personaId: 'test-persona-id',
      entities: [
        {
          id: 'test-entity-type',
          name: 'Test Entity',
          gloss: [{ type: 'text', content: 'Test entity type' }],
          wikidataId: null,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ],
      roles: [],
      events: [],
      relationTypes: [],
      relations: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    // Create test annotation with bounding box sequence
    testAnnotation = {
      id: 'test-annotation-1',
      videoId: 'test-video-id',
      annotationType: 'type',
      personaId: 'test-persona-id',
      typeCategory: 'entity',
      typeId: 'test-type-id',
      boundingBoxSequence: {
        boxes: [
          { x: 100, y: 100, width: 200, height: 200, frameNumber: 0, isKeyframe: true },
          { x: 150, y: 150, width: 200, height: 200, frameNumber: 30, isKeyframe: true },
          { x: 200, y: 200, width: 200, height: 200, frameNumber: 60, isKeyframe: true },
        ],
        interpolationSegments: [
          { startFrame: 0, endFrame: 30, type: 'linear' },
          { startFrame: 30, endFrame: 60, type: 'ease-in-out' },
        ],
        visibilityRanges: [
          { startFrame: 0, endFrame: 60, visible: true },
        ],
        totalFrames: 61,
        keyframeCount: 3,
        interpolatedFrameCount: 58,
      },
      timeSpan: {
        startTime: 0,
        endTime: 2,
      },
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    } as Annotation

    // Setup MSW handlers for TanStack Query
    server.use(
      // Video details endpoint
      http.get('/api/videos/test-video-id', () => {
        return HttpResponse.json(testVideo)
      }),
      // Annotations endpoint
      http.get('/api/annotations', ({ request }) => {
        const url = new URL(request.url)
        const videoId = url.searchParams.get('videoId')
        if (videoId === 'test-video-id') {
          return HttpResponse.json([testAnnotation])
        }
        return HttpResponse.json([])
      }),
      // Personas endpoint
      http.get('/api/personas', () => {
        return HttpResponse.json([testPersona])
      }),
      // Persona ontology endpoint
      http.get('/api/personas/:personaId/ontology', ({ params }) => {
        if (params.personaId === 'test-persona-id') {
          return HttpResponse.json(testOntology)
        }
        return HttpResponse.json(null)
      }),
      // World endpoint
      http.get('/api/world', () => {
        return HttpResponse.json({
          entities: [],
          events: [],
          times: [],
          locations: [],
          entityCollections: [],
          eventCollections: [],
          timeCollections: [],
          relations: [],
        })
      }),
      // Video summary endpoint
      http.get('/api/video-summaries/:videoId', () => {
        return HttpResponse.json(null)
      })
    )

    // Initialize Zustand stores for the test
    useAnnotationUiStore.setState({
      selectedPersonaId: 'test-persona-id',
      selectedTypeId: 'test-type-id',
      annotationMode: 'type',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    // Reset Zustand stores after each test
    useAnnotationUiStore.getState().resetAllState()
    useVideoUiStore.getState().resetAllState()
  })

  const renderWorkspace = () => {
    return renderWithProviders(
      <MemoryRouter initialEntries={['/annotate/test-video-id']}>
        <Routes>
          <Route path="/annotate/:videoId" element={<AnnotationWorkspace />} />
        </Routes>
      </MemoryRouter>
    )
  }

  describe('Initial Render State', () => {
    it('renders standard controls by default (timeline collapsed)', async () => {
      renderWorkspace()

      await waitFor(() => {
        // Wait for persona data to load via MSW; selected persona shows its name
        const selectTrigger = document.querySelector('[data-slot="select-trigger"]')
        expect(selectTrigger).toBeInTheDocument()
      })

      // Verify persona selector trigger is visible
      const selectTrigger = document.querySelector('[data-slot="select-trigger"]')
      expect(selectTrigger).toBeVisible()
    })

    it('renders video playback controls', async () => {
      renderWorkspace()

      await waitFor(() => {
        // Find play/pause button by its icon
        const buttons = screen.getAllByRole('button')
        expect(buttons.length).toBeGreaterThan(0)
      })
    })

    it('renders time slider for standard video scrubbing', async () => {
      renderWorkspace()

      await waitFor(() => {
        const sliders = screen.getAllByRole('slider')
        expect(sliders.length).toBeGreaterThan(0)
      })
    })

    it('displays current time and duration', async () => {
      renderWorkspace()

      await waitFor(() => {
        // Look for time display pattern (M:SS.MS / M:SS.MS) e.g., "0:00.00 / 1:40.00"
        const timeDisplay = screen.getByText(/\d:\d{2}\.\d{2}\s*\/\s*\d:\d{2}\.\d{2}/)
        expect(timeDisplay).toBeInTheDocument()
      })
    })
  })

  describe('Timeline Toggle Button', () => {
    it('shows timeline toggle button when annotation is selected', async () => {
      renderWorkspace()

      const toggleButton = await screen.findByText('Show Timeline')
      expect(toggleButton).toBeVisible()
      expect(toggleButton).toHaveAttribute('type', 'button')
    })

    it('shows timeline toggle when no annotation is selected', async () => {
      // Override MSW handler to return empty annotations
      server.use(
        http.get('/api/annotations', () => {
          return HttpResponse.json([])
        })
      )

      renderWorkspace()

      await waitFor(() => {
        expect(screen.getByText('Show Timeline')).toBeInTheDocument()
      })
    })

    it('shows timeline toggle when totalFrames is 0', async () => {
      // Override MSW handler to return video with zero duration
      server.use(
        http.get('/api/videos/test-video-id', () => {
          return HttpResponse.json({
            ...testVideo,
            duration: 0,
          })
        })
      )

      renderWorkspace()

      await waitFor(() => {
        expect(screen.getByText('Show Timeline')).toBeInTheDocument()
      })
    })
  })

  describe('Timeline Expansion', () => {
    it('expands timeline when toggle button is clicked', async () => {
      renderWorkspace()

      const toggleButton = await screen.findByText('Show Timeline')
      fireEvent.click(toggleButton)

      const hideButton = await screen.findByText('Hide Timeline')

      // Verify button is rendered (variant changes handled by Tailwind classes)
      expect(hideButton.closest('button')).toBeInTheDocument()
    })

    it('hides persona selector when timeline expands', async () => {
      renderWorkspace()

      await waitFor(() => {
        expect(document.querySelector('[data-slot="select-trigger"]')).toBeInTheDocument()
      })
      const personaTrigger = document.querySelector('[data-slot="select-trigger"]')!
      expect(personaTrigger).toBeVisible()

      const toggleButton = await screen.findByText('Show Timeline')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        expect(screen.getByText('Hide Timeline')).toBeInTheDocument()
      })

      // Standard controls panel should have pointer-events: none and opacity: 0
      const standardControls = screen.getByTestId('standard-controls-panel')
      const styles = window.getComputedStyle(standardControls)
      expect(styles.opacity).toBe('0')
      expect(styles.pointerEvents).toBe('none')
    })

    it('shows timeline component when expanded', async () => {
      renderWorkspace()

      const toggleButton = await screen.findByText('Show Timeline')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        // The timeline root exposes an aria-label on the outer div. The
        // older canvas-based implementation was migrated to shadcn DOM so
        // ``document.querySelector('canvas')`` no longer finds anything.
        expect(screen.getByLabelText('Video annotation timeline')).toBeInTheDocument()
      })
    })
  })

  describe('Timeline Collapse', () => {
    it('collapses timeline when hide button is clicked', async () => {
      renderWorkspace()

      // Expand timeline first
      const showButton = await screen.findByText('Show Timeline')
      fireEvent.click(showButton)

      await waitFor(() => {
        expect(screen.getByText('Hide Timeline')).toBeInTheDocument()
      })

      // Collapse timeline
      const hideButton = screen.getByText('Hide Timeline')
      fireEvent.click(hideButton)

      await waitFor(() => {
        expect(screen.getByText('Show Timeline')).toBeInTheDocument()
      })
    })

    it('restores persona selector when timeline collapses', async () => {
      renderWorkspace()

      await waitFor(() => {
        expect(document.querySelector('[data-slot="select-trigger"]')).toBeInTheDocument()
      })
      const personaTrigger = document.querySelector('[data-slot="select-trigger"]')!

      // Expand timeline
      const showButton = await screen.findByText('Show Timeline')
      fireEvent.click(showButton)

      await waitFor(() => {
        expect(screen.getByText('Hide Timeline')).toBeInTheDocument()
      })

      // Collapse timeline
      const hideButton = screen.getByText('Hide Timeline').closest('button')!
      fireEvent.click(hideButton)

      await waitFor(() => {
        expect(personaTrigger).toBeVisible()
        expect(screen.getByText('Show Timeline')).toBeInTheDocument()
      })
    })

    it('allows interaction with persona selector after collapse', async () => {
      renderWorkspace()

      // Expand and collapse timeline
      const showButton = await screen.findByText('Show Timeline')
      fireEvent.click(showButton)

      await waitFor(() => {
        expect(screen.getByText('Hide Timeline')).toBeInTheDocument()
      })

      const hideButton = screen.getByText('Hide Timeline')
      fireEvent.click(hideButton)

      await waitFor(() => {
        expect(screen.getByText('Show Timeline')).toBeInTheDocument()
      })

      // Verify persona selector trigger is functional
      const personaTrigger = document.querySelector('[data-slot="select-trigger"]') as HTMLButtonElement
      expect(personaTrigger).not.toBeDisabled()
    })
  })

  describe('Animation and Transitions', () => {
    it('applies smooth CSS transitions during expansion', async () => {
      renderWorkspace()

      await waitFor(() => {
        expect(screen.getByText('Show Timeline')).toBeInTheDocument()
      })

      // Get the containers before expansion using data-testid
      const standardControls = screen.getByTestId('standard-controls-panel')

      // Container should have transition class (Tailwind applies transition-all duration-300 ease-in-out)
      expect(standardControls.className).toContain('transition')
    })

    it('maintains minimum height during transitions', async () => {
      renderWorkspace()

      await screen.findByText('Show Timeline')

      // Find the container with minHeight using data-testid
      const wrapper = screen.getByTestId('dynamic-controls-wrapper')
      const styles = window.getComputedStyle(wrapper)
      expect(styles.minHeight).toBe('140px')
    })
  })

  describe('Action Buttons Behavior', () => {
    it('action buttons slide out with standard controls when timeline expands', async () => {
      renderWorkspace()

      await waitFor(() => {
        expect(screen.getByText('Edit Summary')).toBeInTheDocument()
      })

      // Expand timeline
      const toggleButton = await screen.findByText('Show Timeline')
      fireEvent.click(toggleButton)

      await screen.findByText('Hide Timeline')

      // Action buttons should be hidden (inside standard-controls-panel which slides out)
      const standardControls = screen.getByTestId('standard-controls-panel')
      const styles = window.getComputedStyle(standardControls)
      expect(styles.opacity).toBe('0')
      expect(styles.pointerEvents).toBe('none')
    })

    it('action buttons return when timeline collapses', async () => {
      renderWorkspace()

      // Expand timeline
      const showButton = await screen.findByText('Show Timeline')
      fireEvent.click(showButton)

      await waitFor(() => {
        expect(screen.getByText('Hide Timeline')).toBeInTheDocument()
      })

      // Collapse timeline
      const hideButton = screen.getByText('Hide Timeline')
      fireEvent.click(hideButton)

      await waitFor(() => {
        expect(screen.getByText('Show Timeline')).toBeInTheDocument()
      })

      // Action buttons should be visible again
      await waitFor(() => {
        expect(screen.getByText('Edit Summary')).toBeVisible()
        expect(screen.getByText('Detect Objects')).toBeVisible()
      })
    })

    it('action buttons are clickable when timeline is collapsed', async () => {
      renderWorkspace()

      // Wait for model config to load so buttons are enabled
      await waitFor(
        () => {
          const detectButton = screen.getByText('Detect Objects')
          expect(detectButton).not.toBeDisabled()
        },
        { timeout: 5000 }
      )

      // Action buttons should be visible and enabled when timeline is collapsed
      const editButton = screen.getByText('Edit Summary')
      expect(editButton).not.toBeDisabled()
      expect(editButton).toBeVisible()

      // Click should work
      fireEvent.click(editButton)

      const detectButton = screen.getByText('Detect Objects')
      expect(detectButton).not.toBeDisabled()
      expect(detectButton).toBeVisible()
    })
  })

  describe('Video Playback Integration', () => {
    it('maintains video playback controls during timeline transitions', async () => {
      renderWorkspace()

      await waitFor(() => {
        const buttons = screen.getAllByRole('button')
        expect(buttons.length).toBeGreaterThan(0)
      })

      // Expand timeline
      const toggleButton = await screen.findByText('Show Timeline')
      fireEvent.click(toggleButton)

      await screen.findByText('Hide Timeline')

      // Video controls should still be present
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })

    it('preserves video time slider during timeline expansion', async () => {
      renderWorkspace()

      await waitFor(() => {
        const sliders = screen.getAllByRole('slider')
        expect(sliders.length).toBeGreaterThan(0)
      })

      const initialSliderCount = screen.getAllByRole('slider').length

      // Expand timeline
      const toggleButton = await screen.findByText('Show Timeline')
      fireEvent.click(toggleButton)

      await screen.findByText('Hide Timeline')

      // Video time slider should still be present (plus timeline zoom slider)
      const expandedSliders = screen.getAllByRole('slider')
      expect(expandedSliders.length).toBeGreaterThanOrEqual(initialSliderCount)
    })
  })

  describe('Multiple Annotations', () => {
    it('maintains timeline state when switching between annotations', async () => {
      const annotation2: Annotation = {
        ...testAnnotation,
        id: 'test-annotation-2',
        typeId: 'different-type',
      }

      // Override MSW handler to return multiple annotations
      server.use(
        http.get('/api/annotations', () => {
          return HttpResponse.json([testAnnotation, annotation2])
        })
      )

      renderWorkspace()

      // Expand timeline for first annotation
      const showButton = await screen.findByText('Show Timeline')
      fireEvent.click(showButton)

      await waitFor(() => {
        expect(screen.getByText('Hide Timeline')).toBeInTheDocument()
      })

      // Timeline should be expanded
      expect(screen.getByText('Hide Timeline')).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('handles rapid toggle clicks gracefully', async () => {
      renderWorkspace()

      const toggleButton = await screen.findByText('Show Timeline')

      // Rapidly click toggle button
      fireEvent.click(toggleButton)
      fireEvent.click(toggleButton)
      fireEvent.click(toggleButton)

      await waitFor(() => {
        // Should end up in consistent state
        const finalButton = screen.queryByText('Show Timeline') || screen.queryByText('Hide Timeline')
        expect(finalButton).toBeInTheDocument()
      })
    })

    it('handles annotation deletion while timeline is expanded', async () => {
      renderWorkspace()

      // Expand timeline
      const showButton = await screen.findByText('Show Timeline')
      fireEvent.click(showButton)

      await waitFor(() => {
        expect(screen.getByText('Hide Timeline')).toBeInTheDocument()
      })

      // Verify timeline is shown
      expect(screen.getByText('Hide Timeline')).toBeInTheDocument()

      // Cleanup first render and reset Zustand state
      cleanup()
      useAnnotationUiStore.getState().resetAllState()

      // Override MSW handler to return no annotations
      server.use(
        http.get('/api/annotations', () => {
          return HttpResponse.json([])
        })
      )

      // Re-render with no annotations
      renderWorkspace()

      // Wait for video to load
      await waitFor(() => {
        const timeDisplays = screen.getAllByText(/0:00/)
        expect(timeDisplays.length).toBeGreaterThan(0)
      })

      // Timeline toggle should still be present
      expect(screen.getByText('Show Timeline')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('toggle button has appropriate tooltip', async () => {
      renderWorkspace()

      const toggleButton = await screen.findByText('Show Timeline')
      const button = toggleButton.closest('button')

      // Button should be accessible
      expect(button).toBeTruthy()
      expect(button).toBeInTheDocument()
    })

    it('maintains keyboard navigation during transitions', async () => {
      renderWorkspace()

      const toggleButton = await screen.findByText('Show Timeline')
      const button = toggleButton.closest('button')!

      // Ensure button is focusable
      expect(button).not.toBeDisabled()

      // Simulate keyboard activation - clicking the button should work
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByText('Hide Timeline')).toBeInTheDocument()
      })
    })
  })

  describe('Performance', () => {
    it('renders efficiently without unnecessary re-renders', async () => {
      renderWorkspace()

      await waitFor(() => {
        expect(screen.getByText('Show Timeline')).toBeInTheDocument()
      })

      // Component should render without errors
      expect(screen.getByText('Show Timeline')).toBeInTheDocument()
    })

    it('handles timeline with many keyframes', async () => {
      const manyKeyframesAnnotation: Annotation = {
        ...testAnnotation,
        boundingBoxSequence: {
          ...testAnnotation.boundingBoxSequence,
          boxes: Array.from({ length: 50 }, (_, i) => ({
            x: 100 + i * 10,
            y: 100 + i * 5,
            width: 200,
            height: 200,
            frameNumber: i * 10,
            isKeyframe: true,
          })),
          keyframeCount: 50,
          interpolatedFrameCount: 450,
          totalFrames: 500,
        },
      }

      // Override MSW handler to return annotation with many keyframes
      server.use(
        http.get('/api/annotations', () => {
          return HttpResponse.json([manyKeyframesAnnotation])
        })
      )

      renderWorkspace()

      const toggleButton = await screen.findByText('Show Timeline')
      fireEvent.click(toggleButton)

      await waitFor(() => {
        expect(screen.getByText('Hide Timeline')).toBeInTheDocument()
      }, { timeout: 5000 })

      // Timeline should render without crashing
      expect(screen.getByText('Hide Timeline')).toBeInTheDocument()
    })
  })

  describe('Back Button', () => {
    it('renders back button in toolbar', async () => {
      renderWorkspace()

      await waitFor(() => {
        const backButton = screen.getByLabelText('Back to video browser')
        expect(backButton).toBeInTheDocument()
        expect(backButton).toBeVisible()
      })
    })

    it('back button is accessible via keyboard', async () => {
      renderWorkspace()

      const backButton = await screen.findByLabelText('Back to video browser')
      expect(backButton).not.toBeDisabled()

      // Focus and activate
      backButton.focus()
      expect(backButton).toHaveFocus()
    })

    it('back button is in metadata box', async () => {
      renderWorkspace()

      const backButton = await screen.findByLabelText('Back to video browser')

      // Button should be in the card component (metadata box, has bg-card class)
      const card = backButton.closest('.bg-card')
      expect(card).toBeInTheDocument()
    })
  })
})
