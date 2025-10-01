/**
 * Tests for VideoSummaryCard component.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VideoSummaryCard } from './VideoSummaryCard'
import { VideoSummary } from '../api/client'

const mockSummary: VideoSummary = {
  id: 'summary-1',
  videoId: 'video-1',
  personaId: 'persona-1',
  summary: 'Video shows three distinct whale pod interactions over 45-second period',
  visualAnalysis: 'Clear water conditions with excellent visibility of whale movements',
  audioTranscript: 'Whale vocalizations detected at timestamps 10s, 23s, and 38s',
  keyFrames: [150, 345, 567],
  confidence: 0.92,
  createdAt: '2025-10-01T10:00:00Z',
  updatedAt: '2025-10-01T10:00:00Z',
}

describe('VideoSummaryCard', () => {
  describe('Loading State', () => {
    it('shows skeleton loading state when loading is true', () => {
      const { container } = render(<VideoSummaryCard summary={null} loading={true} />)

      const skeletons = container.querySelectorAll('.MuiSkeleton-root')
      expect(skeletons.length).toBeGreaterThan(0)
    })

    it('does not show summary content when loading', () => {
      render(<VideoSummaryCard summary={mockSummary} loading={true} />)

      expect(
        screen.queryByText(/whale pod interactions/i)
      ).not.toBeInTheDocument()
    })
  })

  describe('Error State', () => {
    it('displays error message when error prop is provided', () => {
      const errorMessage = 'Failed to load summary'
      render(<VideoSummaryCard summary={null} error={errorMessage} />)

      expect(screen.getByText(errorMessage)).toBeInTheDocument()
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    it('does not show summary content when error is present', () => {
      render(
        <VideoSummaryCard
          summary={mockSummary}
          error="Failed to load summary"
        />
      )

      expect(
        screen.queryByText(/whale pod interactions/i)
      ).not.toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('displays info message when summary is null', () => {
      render(<VideoSummaryCard summary={null} />)

      expect(
        screen.getByText(/no summary available/i)
      ).toBeInTheDocument()
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  describe('Summary Display', () => {
    it('renders summary text', () => {
      render(<VideoSummaryCard summary={mockSummary} />)

      expect(
        screen.getByText(/whale pod interactions/i)
      ).toBeInTheDocument()
    })

    it('displays persona name when provided', () => {
      render(
        <VideoSummaryCard
          summary={mockSummary}
          personaName="Marine Biologist"
        />
      )

      expect(screen.getByText('Marine Biologist')).toBeInTheDocument()
    })

    it('displays persona role when provided', () => {
      render(
        <VideoSummaryCard
          summary={mockSummary}
          personaRole="Marine Biology Research"
        />
      )

      expect(screen.getByText('Marine Biology Research')).toBeInTheDocument()
    })

    it('displays confidence percentage as chip', () => {
      render(<VideoSummaryCard summary={mockSummary} />)

      expect(screen.getByText(/92% confidence/i)).toBeInTheDocument()
    })

    it('shows success color for high confidence', () => {
      render(<VideoSummaryCard summary={mockSummary} />)

      const chip = screen.getByText(/92% confidence/i).closest('.MuiChip-root')
      expect(chip).toHaveClass('MuiChip-colorSuccess')
    })

    it('shows warning color for low confidence', () => {
      const lowConfidenceSummary = { ...mockSummary, confidence: 0.65 }
      render(<VideoSummaryCard summary={lowConfidenceSummary} />)

      const chip = screen.getByText(/65% confidence/i).closest('.MuiChip-root')
      expect(chip).toHaveClass('MuiChip-colorWarning')
    })

    it('displays key frames chip when available', () => {
      render(<VideoSummaryCard summary={mockSummary} />)

      expect(screen.getByText(/3 key frames/i)).toBeInTheDocument()
    })

    it('displays visual analysis chip when available', () => {
      render(<VideoSummaryCard summary={mockSummary} />)

      expect(screen.getByText(/visual analysis available/i)).toBeInTheDocument()
    })

    it('displays audio transcript chip when available', () => {
      render(<VideoSummaryCard summary={mockSummary} />)

      expect(screen.getByText(/audio transcript available/i)).toBeInTheDocument()
    })

    it('does not show chips for missing optional fields', () => {
      const minimalSummary: VideoSummary = {
        ...mockSummary,
        visualAnalysis: null,
        audioTranscript: null,
        keyFrames: null,
      }
      render(<VideoSummaryCard summary={minimalSummary} />)

      expect(screen.queryByText(/key frames/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/visual analysis/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/audio transcript/i)).not.toBeInTheDocument()
    })
  })

  describe('Expand/Collapse Functionality', () => {
    it('shows "Show more" button initially', () => {
      render(<VideoSummaryCard summary={mockSummary} />)

      expect(screen.getByText(/show more/i)).toBeInTheDocument()
    })

    it('expands to show detailed content when clicking "Show more"', async () => {
      const user = userEvent.setup()
      render(<VideoSummaryCard summary={mockSummary} />)

      const showMoreButton = screen.getByText(/show more/i)
      await user.click(showMoreButton)

      await waitFor(() => {
        expect(
          screen.getByText(/clear water conditions/i)
        ).toBeInTheDocument()
      })
    })

    it('changes button text to "Show less" when expanded', async () => {
      const user = userEvent.setup()
      render(<VideoSummaryCard summary={mockSummary} />)

      const showMoreButton = screen.getByText(/show more/i)
      await user.click(showMoreButton)

      await waitFor(() => {
        expect(screen.getByText(/show less/i)).toBeInTheDocument()
      })
    })

    it('collapses content when clicking "Show less"', async () => {
      const user = userEvent.setup()
      render(<VideoSummaryCard summary={mockSummary} />)

      const showMoreButton = screen.getByText(/show more/i)
      await user.click(showMoreButton)

      await waitFor(() => {
        expect(
          screen.getByText(/clear water conditions/i)
        ).toBeInTheDocument()
      })

      const showLessButton = screen.getByText(/show less/i)
      await user.click(showLessButton)

      await waitFor(() => {
        expect(
          screen.queryByText(/clear water conditions/i)
        ).not.toBeInTheDocument()
      })
    })

    it('displays visual analysis in expanded view', async () => {
      const user = userEvent.setup()
      render(<VideoSummaryCard summary={mockSummary} />)

      const showMoreButton = screen.getByText(/show more/i)
      await user.click(showMoreButton)

      await waitFor(() => {
        expect(screen.getByText('Visual Analysis')).toBeInTheDocument()
        expect(
          screen.getByText(/clear water conditions/i)
        ).toBeInTheDocument()
      })
    })

    it('displays audio transcript in expanded view', async () => {
      const user = userEvent.setup()
      render(<VideoSummaryCard summary={mockSummary} />)

      const showMoreButton = screen.getByText(/show more/i)
      await user.click(showMoreButton)

      await waitFor(() => {
        expect(screen.getByText('Audio Transcript')).toBeInTheDocument()
        expect(
          screen.getByText(/whale vocalizations detected/i)
        ).toBeInTheDocument()
      })
    })

    it('displays key frames list in expanded view', async () => {
      const user = userEvent.setup()
      render(<VideoSummaryCard summary={mockSummary} />)

      const showMoreButton = screen.getByText(/show more/i)
      await user.click(showMoreButton)

      await waitFor(() => {
        expect(screen.getByText('Key Frames')).toBeInTheDocument()
        expect(screen.getByText(/150, 345, 567/i)).toBeInTheDocument()
      })
    })

    it('displays creation and update timestamps in expanded view', async () => {
      const user = userEvent.setup()
      render(<VideoSummaryCard summary={mockSummary} />)

      const showMoreButton = screen.getByText(/show more/i)
      await user.click(showMoreButton)

      await waitFor(() => {
        expect(screen.getByText(/created:/i)).toBeInTheDocument()
      })
    })

    it('uses controlled expanded state when provided', async () => {
      const onExpandChange = vi.fn()
      const { rerender } = render(
        <VideoSummaryCard
          summary={mockSummary}
          expanded={false}
          onExpandChange={onExpandChange}
        />
      )

      const showMoreButton = screen.getByText(/show more/i)
      const user = userEvent.setup()
      await user.click(showMoreButton)

      expect(onExpandChange).toHaveBeenCalledWith(true)

      rerender(
        <VideoSummaryCard
          summary={mockSummary}
          expanded={true}
          onExpandChange={onExpandChange}
        />
      )

      await waitFor(() => {
        expect(
          screen.getByText(/clear water conditions/i)
        ).toBeInTheDocument()
      })
    })
  })

  describe('Action Buttons', () => {
    it('displays all action buttons when callbacks are provided', () => {
      const onEdit = vi.fn()
      const onDelete = vi.fn()
      const onRegenerate = vi.fn()

      render(
        <VideoSummaryCard
          summary={mockSummary}
          onEdit={onEdit}
          onDelete={onDelete}
          onRegenerate={onRegenerate}
        />
      )

      expect(screen.getByLabelText(/edit summary/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/delete summary/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/regenerate summary/i)).toBeInTheDocument()
    })

    it('calls onEdit when edit button is clicked', async () => {
      const onEdit = vi.fn()
      const user = userEvent.setup()

      render(<VideoSummaryCard summary={mockSummary} onEdit={onEdit} />)

      const editButton = screen.getByLabelText(/edit summary/i)
      await user.click(editButton)

      expect(onEdit).toHaveBeenCalledWith(mockSummary)
    })

    it('calls onDelete when delete button is clicked', async () => {
      const onDelete = vi.fn()
      const user = userEvent.setup()

      render(<VideoSummaryCard summary={mockSummary} onDelete={onDelete} />)

      const deleteButton = screen.getByLabelText(/delete summary/i)
      await user.click(deleteButton)

      expect(onDelete).toHaveBeenCalledWith(mockSummary)
    })

    it('calls onRegenerate when regenerate button is clicked', async () => {
      const onRegenerate = vi.fn()
      const user = userEvent.setup()

      render(
        <VideoSummaryCard summary={mockSummary} onRegenerate={onRegenerate} />
      )

      const regenerateButton = screen.getByLabelText(/regenerate summary/i)
      await user.click(regenerateButton)

      expect(onRegenerate).toHaveBeenCalledWith(
        mockSummary.videoId,
        mockSummary.personaId
      )
    })

    it('hides actions when showActions is false', () => {
      const onEdit = vi.fn()
      const onDelete = vi.fn()

      render(
        <VideoSummaryCard
          summary={mockSummary}
          onEdit={onEdit}
          onDelete={onDelete}
          showActions={false}
        />
      )

      expect(screen.queryByLabelText(/edit summary/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/delete summary/i)).not.toBeInTheDocument()
    })

    it('does not display button when callback is not provided', () => {
      render(<VideoSummaryCard summary={mockSummary} />)

      expect(screen.queryByLabelText(/edit summary/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/delete summary/i)).not.toBeInTheDocument()
      expect(
        screen.queryByLabelText(/regenerate summary/i)
      ).not.toBeInTheDocument()
    })
  })

  describe('Diverse Example Scenarios', () => {
    it('renders baseball scout summary correctly', () => {
      const baseballSummary: VideoSummary = {
        ...mockSummary,
        summary:
          'Pitcher demonstrates three pitch types: fastball (92 mph), curveball, and changeup across nine pitches',
        visualAnalysis: 'Clear grip visibility on all pitch releases',
        confidence: 0.88,
      }

      render(
        <VideoSummaryCard
          summary={baseballSummary}
          personaName="Baseball Scout"
          personaRole="Player Development Analyst"
        />
      )

      expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      expect(
        screen.getByText('Player Development Analyst')
      ).toBeInTheDocument()
      expect(screen.getByText(/pitcher demonstrates/i)).toBeInTheDocument()
    })

    it('renders retail analyst summary correctly', () => {
      const retailSummary: VideoSummary = {
        ...mockSummary,
        summary:
          'Customer flow analysis shows peak traffic at cosmetics section between 2-4pm',
        visualAnalysis: 'High dwell time observed at product displays',
        confidence: 0.79,
      }

      render(
        <VideoSummaryCard
          summary={retailSummary}
          personaName="Store Manager"
          personaRole="Retail Analytics"
        />
      )

      expect(screen.getByText('Store Manager')).toBeInTheDocument()
      expect(screen.getByText('Retail Analytics')).toBeInTheDocument()
      expect(screen.getByText(/customer flow analysis/i)).toBeInTheDocument()
    })

    it('renders film editor summary correctly', () => {
      const filmSummary: VideoSummary = {
        ...mockSummary,
        summary:
          'Continuity check reveals consistent prop placement across all takes',
        visualAnalysis: 'Coffee cup position maintained in frames 120-450',
        confidence: 0.95,
      }

      render(
        <VideoSummaryCard
          summary={filmSummary}
          personaName="Continuity Editor"
          personaRole="Post-Production Specialist"
        />
      )

      expect(screen.getByText('Continuity Editor')).toBeInTheDocument()
      expect(
        screen.getByText('Post-Production Specialist')
      ).toBeInTheDocument()
      expect(screen.getByText(/continuity check reveals/i)).toBeInTheDocument()
    })
  })
})
