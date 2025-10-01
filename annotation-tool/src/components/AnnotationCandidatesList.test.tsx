/**
 * Tests for AnnotationCandidatesList component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { AnnotationCandidatesList } from './AnnotationCandidatesList'
import annotationReducer from '../store/annotationSlice'
import type { FrameDetections } from '../api/client'

/**
 * Create a mock Redux store for testing.
 */
function createMockStore() {
  return configureStore({
    reducer: {
      annotations: annotationReducer,
    },
  })
}

/**
 * Render component with Redux provider.
 */
function renderWithStore(component: React.ReactElement) {
  const store = createMockStore()
  return {
    store,
    ...render(<Provider store={store}>{component}</Provider>),
  }
}

describe('AnnotationCandidatesList', () => {
  const mockWildlifeDetections: FrameDetections[] = [
    {
      frame_number: 0,
      timestamp: 0.0,
      detections: [
        {
          label: 'elephant',
          bounding_box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
          confidence: 0.92,
          track_id: 'elephant-1',
        },
        {
          label: 'lion',
          bounding_box: { x: 0.5, y: 0.3, width: 0.2, height: 0.3 },
          confidence: 0.78,
          track_id: 'lion-1',
        },
      ],
    },
    {
      frame_number: 30,
      timestamp: 1.0,
      detections: [
        {
          label: 'giraffe',
          bounding_box: { x: 0.2, y: 0.1, width: 0.25, height: 0.6 },
          confidence: 0.85,
          track_id: 'giraffe-1',
        },
      ],
    },
  ]

  const mockSportsDetections: FrameDetections[] = [
    {
      frame_number: 0,
      timestamp: 0.0,
      detections: [
        {
          label: 'player wearing red jersey',
          bounding_box: { x: 0.3, y: 0.4, width: 0.15, height: 0.4 },
          confidence: 0.88,
          track_id: 'player-1',
        },
        {
          label: 'soccer ball',
          bounding_box: { x: 0.45, y: 0.55, width: 0.05, height: 0.05 },
          confidence: 0.95,
          track_id: null,
        },
      ],
    },
  ]

  const mockTrafficDetections: FrameDetections[] = [
    {
      frame_number: 0,
      timestamp: 0.0,
      detections: [
        {
          label: 'sedan',
          bounding_box: { x: 0.1, y: 0.5, width: 0.3, height: 0.2 },
          confidence: 0.91,
          track_id: 'vehicle-1',
        },
        {
          label: 'truck',
          bounding_box: { x: 0.6, y: 0.4, width: 0.35, height: 0.3 },
          confidence: 0.87,
          track_id: 'vehicle-2',
        },
        {
          label: 'bicycle',
          bounding_box: { x: 0.05, y: 0.65, width: 0.1, height: 0.15 },
          confidence: 0.45,
          track_id: 'vehicle-3',
        },
      ],
    },
  ]

  const mockRetailDetections: FrameDetections[] = [
    {
      frame_number: 0,
      timestamp: 0.0,
      detections: [
        {
          label: 'milk carton',
          bounding_box: { x: 0.2, y: 0.3, width: 0.1, height: 0.2 },
          confidence: 0.82,
          track_id: null,
        },
        {
          label: 'bread loaf',
          bounding_box: { x: 0.4, y: 0.35, width: 0.15, height: 0.1 },
          confidence: 0.76,
          track_id: null,
        },
        {
          label: 'shopping cart',
          bounding_box: { x: 0.7, y: 0.5, width: 0.25, height: 0.4 },
          confidence: 0.93,
          track_id: 'cart-1',
        },
      ],
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('displays wildlife detection candidates with statistics', () => {
      renderWithStore(
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
      renderWithStore(
        <AnnotationCandidatesList
          videoId="sports-video"
          frames={mockSportsDetections}
        />
      )

      expect(screen.getByText('player wearing red jersey')).toBeInTheDocument()
      expect(screen.getByText('soccer ball')).toBeInTheDocument()
    })

    it('displays traffic detection candidates', () => {
      renderWithStore(
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
      renderWithStore(
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
      renderWithStore(
        <AnnotationCandidatesList videoId="empty-video" frames={[]} />
      )

      expect(
        screen.getByText(/No detections found/i)
      ).toBeInTheDocument()
    })

    it('displays confidence scores with color coding', () => {
      renderWithStore(
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
      renderWithStore(
        <AnnotationCandidatesList
          videoId="wildlife-video"
          frames={mockWildlifeDetections}
        />
      )

      expect(screen.getByText('Track ID: elephant-1')).toBeInTheDocument()
      expect(screen.getByText('Track ID: lion-1')).toBeInTheDocument()
    })

    it('displays frame and timestamp information', () => {
      renderWithStore(
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
      renderWithStore(
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
      renderWithStore(
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
      renderWithStore(
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
      renderWithStore(
        <AnnotationCandidatesList
          videoId="wildlife-video"
          frames={mockWildlifeDetections}
          onAccept={onAccept}
        />
      )

      // Find elephant card and accept it
      const elephantCard = screen.getByText('elephant').closest('.MuiCard-root') as HTMLElement
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
      renderWithStore(
        <AnnotationCandidatesList
          videoId="sports-video"
          frames={mockSportsDetections}
          onReject={onReject}
        />
      )

      // Find soccer ball card and reject it
      const ballCard = screen.getByText('soccer ball').closest('.MuiCard-root') as HTMLElement
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

    it('dispatches type annotation when persona and type provided', () => {
      const { store } = renderWithStore(
        <AnnotationCandidatesList
          videoId="retail-video"
          frames={mockRetailDetections}
          personaId="analyst-1"
          typeId="product-type"
          typeCategory="entity"
        />
      )

      // Accept milk carton
      const milkCard = screen.getByText('milk carton').closest('.MuiCard-root') as HTMLElement
      const acceptButton = within(milkCard).getByRole('button', {
        name: /accept/i,
      })
      fireEvent.click(acceptButton)

      // Check Redux store
      const state = store.getState()
      const annotations = state.annotations.annotations['retail-video']
      expect(annotations).toHaveLength(1)
      expect(annotations[0].annotationType).toBe('type')
      if (annotations[0].annotationType === 'type') {
        expect(annotations[0].personaId).toBe('analyst-1')
        expect(annotations[0].typeId).toBe('product-type')
      }
    })

    it('dispatches object annotation when no persona provided', () => {
      const { store } = renderWithStore(
        <AnnotationCandidatesList
          videoId="wildlife-video"
          frames={mockWildlifeDetections}
        />
      )

      // Accept lion
      const lionCard = screen.getByText('lion').closest('.MuiCard-root') as HTMLElement
      const acceptButton = within(lionCard).getByRole('button', {
        name: /accept/i,
      })
      fireEvent.click(acceptButton)

      // Check Redux store
      const state = store.getState()
      const annotations = state.annotations.annotations['wildlife-video']
      expect(annotations).toHaveLength(1)
      expect(annotations[0].annotationType).toBe('object')
    })
  })

  describe('batch operations', () => {
    it('accepts all traffic detections at once', () => {
      const onAccept = vi.fn()
      renderWithStore(
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
      renderWithStore(
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
      renderWithStore(
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
      renderWithStore(
        <AnnotationCandidatesList
          videoId="sports-video"
          frames={mockSportsDetections}
        />
      )

      // Filter panel hidden initially
      expect(screen.queryByLabelText('Confidence Threshold')).not.toBeVisible()

      // Toggle filters
      const filterButton = screen.getByLabelText('toggle filters')
      fireEvent.click(filterButton)

      // Filter panel visible
      expect(screen.getByLabelText('Confidence Threshold')).toBeVisible()
    })

    it('displays bounding box coordinates', () => {
      renderWithStore(
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
          frame_number: 0,
          timestamp: 0.0,
          detections: [
            {
              label: 'person',
              bounding_box: { x: 0.5, y: 0.5, width: 0.2, height: 0.4 },
              confidence: 0.9,
              track_id: null,
            },
          ],
        },
      ]

      renderWithStore(
        <AnnotationCandidatesList
          videoId="test-video"
          frames={noTrackDetections}
        />
      )

      expect(screen.getByText('person')).toBeInTheDocument()
      expect(screen.queryByText(/Track ID:/)).not.toBeInTheDocument()
    })

    it('handles zero confidence threshold', () => {
      renderWithStore(
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
      renderWithStore(
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
