/**
 * Unit tests for TrackingResultsPanel component.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TrackingResultsPanel } from './TrackingResultsPanel.js'
import { TrackingResult } from '../../models/types.js'

describe('TrackingResultsPanel', () => {
  const mockTracks: TrackingResult[] = [
    {
      trackId: 1,
      label: 'person',
      confidence: 0.92,
      model: 'samurai',
      frames: [
        { frameNumber: 0, box: { x: 10, y: 10, width: 50, height: 50 }, confidence: 0.9, occluded: false },
        { frameNumber: 1, box: { x: 15, y: 10, width: 50, height: 50 }, confidence: 0.92, occluded: false },
        { frameNumber: 2, box: { x: 20, y: 10, width: 50, height: 50 }, confidence: 0.94, occluded: false },
      ],
    },
    {
      trackId: 2,
      label: 'car',
      confidence: 0.68,
      model: 'sam2',
      frames: [
        { frameNumber: 0, box: { x: 30, y: 30, width: 60, height: 40 }, confidence: 0.68, occluded: false },
        { frameNumber: 1, box: { x: 35, y: 30, width: 60, height: 40 }, confidence: 0.65, occluded: false },
      ],
    },
  ]

  const mockHandlers = {
    onAcceptTrack: vi.fn(),
    onRejectTrack: vi.fn(),
    onPreviewTrack: vi.fn(),
  }

  it('renders tracking results panel', () => {
    render(
      <TrackingResultsPanel
        trackingResults={mockTracks}
        videoId="video1"
        {...mockHandlers}
      />
    )

    expect(screen.getByText('Tracking Results')).toBeInTheDocument()
    expect(screen.getByText(/Found 2 tracks/)).toBeInTheDocument()
  })

  it('displays track information', () => {
    render(
      <TrackingResultsPanel
        trackingResults={mockTracks}
        videoId="video1"
        {...mockHandlers}
      />
    )

    expect(screen.getByText(/Track #1/)).toBeInTheDocument()
    expect(screen.getByText('person')).toBeInTheDocument()
    expect(screen.getByText(/conf: 0.92/)).toBeInTheDocument()

    expect(screen.getByText(/Track #2/)).toBeInTheDocument()
    expect(screen.getByText('car')).toBeInTheDocument()
    expect(screen.getByText(/conf: 0.68/)).toBeInTheDocument()
  })

  it('calls onAcceptTrack when accept button clicked', () => {
    render(
      <TrackingResultsPanel
        trackingResults={mockTracks}
        videoId="video1"
        {...mockHandlers}
      />
    )

    const acceptButtons = screen.getAllByLabelText(/Accept Track/)
    fireEvent.click(acceptButtons[0])

    expect(mockHandlers.onAcceptTrack).toHaveBeenCalledWith(1)
  })

  it('calls onRejectTrack when reject button clicked', () => {
    render(
      <TrackingResultsPanel
        trackingResults={mockTracks}
        videoId="video1"
        {...mockHandlers}
      />
    )

    const rejectButtons = screen.getAllByLabelText(/Reject Track/)
    fireEvent.click(rejectButtons[0])

    expect(mockHandlers.onRejectTrack).toHaveBeenCalledWith(1)
  })

  it('calls onPreviewTrack when preview button clicked', () => {
    render(
      <TrackingResultsPanel
        trackingResults={mockTracks}
        videoId="video1"
        {...mockHandlers}
      />
    )

    const previewButtons = screen.getAllByLabelText(/Preview Track/)
    fireEvent.click(previewButtons[0])

    expect(mockHandlers.onPreviewTrack).toHaveBeenCalledWith(1)
  })

  it('calls onPreviewTrack when track row clicked', () => {
    render(
      <TrackingResultsPanel
        trackingResults={mockTracks}
        videoId="video1"
        {...mockHandlers}
      />
    )

    const trackRow = screen.getByText(/Track #1/).closest('div[role="button"]')
    if (trackRow) {
      fireEvent.click(trackRow)
      expect(mockHandlers.onPreviewTrack).toHaveBeenCalledWith(1)
    }
  })

  it('shows accept all button when high confidence tracks exist', () => {
    render(
      <TrackingResultsPanel
        trackingResults={mockTracks}
        videoId="video1"
        {...mockHandlers}
      />
    )

    const acceptAllButton = screen.getByText(/Accept All High Confidence/)
    expect(acceptAllButton).toBeInTheDocument()
    expect(acceptAllButton).not.toBeDisabled()
  })

  it('shows reject all button when low confidence tracks exist', () => {
    render(
      <TrackingResultsPanel
        trackingResults={mockTracks}
        videoId="video1"
        {...mockHandlers}
      />
    )

    const rejectAllButton = screen.getByText(/Reject All Low Confidence/)
    expect(rejectAllButton).toBeInTheDocument()
    expect(rejectAllButton).not.toBeDisabled()
  })

  it('displays empty state when no tracks', () => {
    render(
      <TrackingResultsPanel
        trackingResults={[]}
        videoId="video1"
        {...mockHandlers}
      />
    )

    expect(screen.getByText(/No tracking results available/)).toBeInTheDocument()
  })

  it('shows frame coverage information', () => {
    render(
      <TrackingResultsPanel
        trackingResults={mockTracks}
        videoId="video1"
        {...mockHandlers}
      />
    )

    expect(screen.getByText(/3\/3 frames/)).toBeInTheDocument()
    expect(screen.getByText(/2\/2 frames/)).toBeInTheDocument()
  })

  it('indicates discontiguous tracks', () => {
    const discontiguousTrack: TrackingResult = {
      trackId: 3,
      label: 'person',
      confidence: 0.85,
      model: 'samurai',
      frames: [
        { frameNumber: 0, box: { x: 10, y: 10, width: 50, height: 50 }, confidence: 0.9, occluded: false },
        { frameNumber: 1, box: { x: 15, y: 10, width: 50, height: 50 }, confidence: 0.92, occluded: false },
        { frameNumber: 5, box: { x: 20, y: 10, width: 50, height: 50 }, confidence: 0.88, occluded: false },
      ],
    }

    render(
      <TrackingResultsPanel
        trackingResults={[discontiguousTrack]}
        videoId="video1"
        {...mockHandlers}
      />
    )

    expect(screen.getByText(/1 gap/)).toBeInTheDocument()
  })
})
