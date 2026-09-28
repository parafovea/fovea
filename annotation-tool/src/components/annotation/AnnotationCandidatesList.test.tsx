/**
 * Tests for AnnotationCandidatesList component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { AnnotationCandidatesList } from './AnnotationCandidatesList'
import type { FrameDetections } from '@api/client'
import { server } from '@test/setup'

/**
 * Create QueryClient for testing.
 */
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

/**
 * Render component with QueryClientProvider.
 */
function renderWithQueryClient(component: React.ReactElement) {
  const queryClient = createQueryClient()
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    ),
  }
}

describe('AnnotationCandidatesList', () => {
  const mockWildlifeDetections: FrameDetections[] = [
    {
      frameNumber: 0,
      timestamp: 0.0,
      detections: [
        {
          label: 'elephant',
          boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
          confidence: 0.92,
          trackId: 'elephant-1',
        },
        {
          label: 'lion',
          boundingBox: { x: 0.5, y: 0.3, width: 0.2, height: 0.3 },
          confidence: 0.78,
          trackId: 'lion-1',
        },
      ],
    },
    {
      frameNumber: 30,
      timestamp: 1.0,
      detections: [
        {
          label: 'giraffe',
          boundingBox: { x: 0.2, y: 0.1, width: 0.25, height: 0.6 },
          confidence: 0.85,
          trackId: 'giraffe-1',
        },
      ],
    },
  ]

  const mockSportsDetections: FrameDetections[] = [
    {
      frameNumber: 0,
      timestamp: 0.0,
      detections: [
        {
          label: 'player wearing red jersey',
          boundingBox: { x: 0.3, y: 0.4, width: 0.15, height: 0.4 },
          confidence: 0.88,
          trackId: 'player-1',
        },
        {
          label: 'soccer ball',
          boundingBox: { x: 0.45, y: 0.55, width: 0.05, height: 0.05 },
          confidence: 0.95,
          trackId: null,
        },
      ],
    },
  ]

  const mockTrafficDetections: FrameDetections[] = [
    {
      frameNumber: 0,
      timestamp: 0.0,
      detections: [
        {
          label: 'sedan',
          boundingBox: { x: 0.1, y: 0.5, width: 0.3, height: 0.2 },
          confidence: 0.91,
          trackId: 'vehicle-1',
        },
        {
          label: 'truck',
          boundingBox: { x: 0.6, y: 0.4, width: 0.35, height: 0.3 },
          confidence: 0.87,
          trackId: 'vehicle-2',
        },
        {
          label: 'bicycle',
          boundingBox: { x: 0.05, y: 0.65, width: 0.1, height: 0.15 },
          confidence: 0.45,
          trackId: 'vehicle-3',
        },
      ],
    },
  ]

  const mockRetailDetections: FrameDetections[] = [
    {
      frameNumber: 0,
      timestamp: 0.0,
      detections: [
        {
          label: 'milk carton',
          boundingBox: { x: 0.2, y: 0.3, width: 0.1, height: 0.2 },
          confidence: 0.82,
          trackId: null,
        },
        {
          label: 'bread loaf',
          boundingBox: { x: 0.4, y: 0.35, width: 0.15, height: 0.1 },
          confidence: 0.76,
          trackId: null,
        },
        {
          label: 'shopping cart',
          boundingBox: { x: 0.7, y: 0.5, width: 0.25, height: 0.4 },
          confidence: 0.93,
          trackId: 'cart-1',
        },
      ],
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    // Set up MSW handler for annotation creation
    server.use(
      http.post('/api/layers/videos/:videoId/annotations', async ({ request }) => {
        const body = await request.json() as Record<string, unknown>
        return HttpResponse.json({
          id: body.id || 'new-annotation-id',
          videoId: body.videoId,
          personaId: body.personaId,
          type: body.type,
          label: body.label,
          frames: body.frames,
          confidence: body.confidence ?? null,
          source: 'manual',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, { status: 201 })
      })
    )
  })

  describe('rendering', () => {
    it('displays wildlife detection candidates with statistics', () => {
      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="wildlife-video"
          frames={mockWildlifeDetections}
        />
      )

      expect(screen.getByText('Detection Candidates')).toBeInTheDocument()
      expect(screen.getByText('Total: 3')).toBeInTheDocument()
      expect(screen.getByText('Pending: 3')).toBeInTheDocument()
      expect(screen.getByText('elephant')).toBeInTheDocument()
      expect(screen.getByText('lion')).toBeInTheDocument()
      expect(screen.getByText('giraffe')).toBeInTheDocument()
    })

    it('displays sports detection candidates', () => {
      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="sports-video"
          frames={mockSportsDetections}
        />
      )

      expect(screen.getByText('player wearing red jersey')).toBeInTheDocument()
      expect(screen.getByText('soccer ball')).toBeInTheDocument()
    })

    it('displays traffic detection candidates', () => {
      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="traffic-video"
          frames={mockTrafficDetections}
        />
      )

      expect(screen.getByText('sedan')).toBeInTheDocument()
      expect(screen.getByText('truck')).toBeInTheDocument()
      expect(screen.getByText('bicycle')).toBeInTheDocument()
    })

    it('displays retail detection candidates', () => {
      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="retail-video"
          frames={mockRetailDetections}
        />
      )

      expect(screen.getByText('milk carton')).toBeInTheDocument()
      expect(screen.getByText('bread loaf')).toBeInTheDocument()
      expect(screen.getByText('shopping cart')).toBeInTheDocument()
    })

    it('shows empty state when no detections provided', () => {
      renderWithQueryClient(
        <AnnotationCandidatesList videoId="empty-video" frames={[]} />
      )

      expect(
        screen.getByText(/No detections found/i)
      ).toBeInTheDocument()
    })

    it('displays confidence scores with color coding', () => {
      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="wildlife-video"
          frames={mockWildlifeDetections}
        />
      )

      // High confidence (elephant: 92%)
      expect(screen.getByText('92%')).toBeInTheDocument()
      // Medium confidence (lion: 78%)
      expect(screen.getByText('78%')).toBeInTheDocument()
      // High confidence (giraffe: 85%)
      expect(screen.getByText('85%')).toBeInTheDocument()
    })

    it('displays track IDs when available', () => {
      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="wildlife-video"
          frames={mockWildlifeDetections}
        />
      )

      expect(screen.getByText('Track ID: elephant-1')).toBeInTheDocument()
      expect(screen.getByText('Track ID: lion-1')).toBeInTheDocument()
    })

    it('displays frame and timestamp information', () => {
      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="sports-video"
          frames={mockSportsDetections}
        />
      )

      const frameInfo = screen.getAllByText(/Frame: 0 \(0.00s\)/)
      expect(frameInfo.length).toBeGreaterThan(0)
    })
  })

  describe('confidence filtering', () => {
    it('filters detections by confidence threshold', () => {
      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="traffic-video"
          frames={mockTrafficDetections}
          initialConfidenceThreshold={0.8}
        />
      )

      // High confidence detections visible
      expect(screen.getByText('sedan')).toBeInTheDocument()
      expect(screen.getByText('truck')).toBeInTheDocument()

      // Low confidence detection filtered out
      expect(screen.queryByText('bicycle')).not.toBeInTheDocument()
    })

    it('updates filter when threshold changes', () => {
      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="traffic-video"
          frames={mockTrafficDetections}
          initialConfidenceThreshold={0.3}
        />
      )

      // All detections visible initially
      expect(screen.getByText('bicycle')).toBeInTheDocument()

      // Open filters
      const filterButton = screen.getByLabelText('toggle filters')
      fireEvent.click(filterButton)

      // Change threshold
      const thresholdInput = screen.getByLabelText('Confidence Threshold')
      fireEvent.change(thresholdInput, { target: { value: '0.8' } })

      // Low confidence detection hidden
      expect(screen.queryByText('bicycle')).not.toBeInTheDocument()
    })

    it('shows message when no candidates match filter', () => {
      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="wildlife-video"
          frames={mockWildlifeDetections}
          initialConfidenceThreshold={0.99}
        />
      )

      expect(
        screen.getByText(/No pending candidates match the current filters/i)
      ).toBeInTheDocument()
    })
  })

  describe('accept/reject actions', () => {
    it('accepts a wildlife detection and updates statistics', () => {
      const onAccept = vi.fn()
      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="wildlife-video"
          frames={mockWildlifeDetections}
          onAccept={onAccept}
        />
      )

      // Find elephant card and accept it
      const elephantCard = screen.getByText('elephant').closest('[data-slot="card"]') as HTMLElement
      const acceptButton = within(elephantCard).getByRole('button', {
        name: /accept/i,
      })
      fireEvent.click(acceptButton)

      // Callback called
      expect(onAccept).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'elephant' }),
        0
      )

      // Statistics updated
      expect(screen.getByText('Accepted: 1')).toBeInTheDocument()
      expect(screen.getByText('Pending: 2')).toBeInTheDocument()
    })

    it('rejects a sports detection', () => {
      const onReject = vi.fn()
      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="sports-video"
          frames={mockSportsDetections}
          onReject={onReject}
        />
      )

      // Find soccer ball card and reject it
      const ballCard = screen.getByText('soccer ball').closest('[data-slot="card"]') as HTMLElement
      const rejectButton = within(ballCard).getByRole('button', {
        name: /reject/i,
      })
      fireEvent.click(rejectButton)

      expect(onReject).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'soccer ball' }),
        0
      )

      expect(screen.getByText('Rejected: 1')).toBeInTheDocument()
    })

    it('dispatches type annotation when persona and type provided', async () => {
      let savedAnnotation: any = null
      server.use(
        http.post('/api/layers/videos/:videoId/annotations', async ({ request }) => {
          savedAnnotation = await request.json()
          return HttpResponse.json({
            id: savedAnnotation.id || 'new-annotation-id',
            videoId: savedAnnotation.videoId,
            personaId: savedAnnotation.personaId,
            type: savedAnnotation.type,
            label: savedAnnotation.label,
            frames: savedAnnotation.frames,
            confidence: savedAnnotation.confidence ?? null,
            source: 'manual',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, { status: 201 })
        })
      )

      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="retail-video"
          frames={mockRetailDetections}
          personaId="analyst-1"
          typeId="product-type"
          typeCategory="entity"
        />
      )

      // Accept milk carton
      const milkCard = screen.getByText('milk carton').closest('[data-slot="card"]') as HTMLElement
      const acceptButton = within(milkCard).getByRole('button', {
        name: /accept/i,
      })
      fireEvent.click(acceptButton)

      // Wait for mutation
      await vi.waitFor(() => {
        expect(savedAnnotation).not.toBeNull()
      })

      // Check that type annotation was created with correct data
      expect(savedAnnotation.type).toBe('type')
      expect(savedAnnotation.personaId).toBe('analyst-1')
      expect(savedAnnotation.label).toBe('product-type')
    })

    it('dispatches object annotation when no persona provided', async () => {
      let savedAnnotation: any = null
      server.use(
        http.post('/api/layers/videos/:videoId/annotations', async ({ request }) => {
          savedAnnotation = await request.json()
          return HttpResponse.json({
            id: savedAnnotation.id || 'new-annotation-id',
            videoId: savedAnnotation.videoId,
            personaId: savedAnnotation.personaId,
            type: savedAnnotation.type,
            label: savedAnnotation.label,
            frames: savedAnnotation.frames,
            confidence: savedAnnotation.confidence ?? null,
            source: 'manual',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, { status: 201 })
        })
      )

      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="wildlife-video"
          frames={mockWildlifeDetections}
        />
      )

      // Accept lion
      const lionCard = screen.getByText('lion').closest('[data-slot="card"]') as HTMLElement
      const acceptButton = within(lionCard).getByRole('button', {
        name: /accept/i,
      })
      fireEvent.click(acceptButton)

      // Wait for mutation
      await vi.waitFor(() => {
        expect(savedAnnotation).not.toBeNull()
      })

      // Check that object annotation was created
      expect(savedAnnotation.type).toBe('object')
    })
  })

  describe('batch operations', () => {
    it('accepts all traffic detections at once', () => {
      const onAccept = vi.fn()
      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="traffic-video"
          frames={mockTrafficDetections}
          onAccept={onAccept}
          initialConfidenceThreshold={0.3}
        />
      )

      const acceptAllButton = screen.getByRole('button', {
        name: /accept all \(3\)/i,
      })
      fireEvent.click(acceptAllButton)

      expect(onAccept).toHaveBeenCalledTimes(3)
      expect(screen.getByText('Accepted: 3')).toBeInTheDocument()
      expect(screen.getByText('Pending: 0')).toBeInTheDocument()
    })

    it('rejects all retail detections at once', () => {
      const onReject = vi.fn()
      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="retail-video"
          frames={mockRetailDetections}
          onReject={onReject}
        />
      )

      const rejectAllButton = screen.getByRole('button', {
        name: /reject all \(3\)/i,
      })
      fireEvent.click(rejectAllButton)

      expect(onReject).toHaveBeenCalledTimes(3)
      expect(screen.getByText('Rejected: 3')).toBeInTheDocument()
    })

    it('batch operations respect confidence filter', () => {
      const onAccept = vi.fn()
      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="traffic-video"
          frames={mockTrafficDetections}
          onAccept={onAccept}
          initialConfidenceThreshold={0.8}
        />
      )

      // Only 2 detections meet threshold
      const acceptAllButton = screen.getByRole('button', {
        name: /accept all \(2\)/i,
      })
      fireEvent.click(acceptAllButton)

      expect(onAccept).toHaveBeenCalledTimes(2)
    })
  })

  describe('UI interactions', () => {
    it('toggles filter panel', () => {
      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="sports-video"
          frames={mockSportsDetections}
        />
      )

      // Filter panel hidden initially (Collapsible does not render content when closed)
      expect(screen.queryByLabelText('Confidence Threshold')).not.toBeInTheDocument()

      // Toggle filters
      const filterButton = screen.getByLabelText('toggle filters')
      fireEvent.click(filterButton)

      // Filter panel visible
      expect(screen.getByLabelText('Confidence Threshold')).toBeInTheDocument()
    })

    it('displays bounding box coordinates', () => {
      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="wildlife-video"
          frames={mockWildlifeDetections}
        />
      )

      // Check elephant bounding box
      expect(screen.getByText(/Box: \(0\.100, 0\.200\)/)).toBeInTheDocument()
    })
  })

  describe('edge cases', () => {
    it('handles detections without track IDs', () => {
      const noTrackDetections: FrameDetections[] = [
        {
          frameNumber: 0,
          timestamp: 0.0,
          detections: [
            {
              label: 'person',
              boundingBox: { x: 0.5, y: 0.5, width: 0.2, height: 0.4 },
              confidence: 0.9,
              trackId: null,
            },
          ],
        },
      ]

      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="test-video"
          frames={noTrackDetections}
        />
      )

      expect(screen.getByText('person')).toBeInTheDocument()
      expect(screen.queryByText(/Track ID:/)).not.toBeInTheDocument()
    })

    it('handles zero confidence threshold', () => {
      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="traffic-video"
          frames={mockTrafficDetections}
          initialConfidenceThreshold={0.0}
        />
      )

      // All detections visible
      expect(screen.getByText('sedan')).toBeInTheDocument()
      expect(screen.getByText('bicycle')).toBeInTheDocument()
    })

    it('handles single frame with multiple detections', () => {
      renderWithQueryClient(
        <AnnotationCandidatesList
          videoId="retail-video"
          frames={mockRetailDetections}
        />
      )

      expect(screen.getByText('Total: 3')).toBeInTheDocument()
      expect(screen.getAllByText(/Frame: 0/).length).toBe(3)
    })
  })
})
