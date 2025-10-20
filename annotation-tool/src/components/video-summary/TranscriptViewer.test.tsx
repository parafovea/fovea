/**
 * Tests for TranscriptViewer component.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TranscriptViewer } from './TranscriptViewer'
import { TranscriptJson } from './types.js'

const mockTranscript: TranscriptJson = {
  segments: [
    {
      start: 0,
      end: 5,
      text: 'Hello and welcome to this video.',
      speaker: 'Speaker 1',
      confidence: 0.95,
    },
    {
      start: 5,
      end: 12,
      text: 'Today we will discuss advanced techniques.',
      speaker: 'Speaker 2',
      confidence: 0.92,
    },
    {
      start: 12,
      end: 18,
      text: 'These techniques are very effective.',
      speaker: 'Speaker 1',
      confidence: 0.88,
    },
  ],
}

const emptyTranscript: TranscriptJson = {
  segments: [],
}

describe('TranscriptViewer', () => {
  describe('Empty State', () => {
    it('displays message when transcript is empty', () => {
      const onSeek = vi.fn()

      render(
        <TranscriptViewer transcript={emptyTranscript} currentTime={0} onSeek={onSeek} />
      )

      expect(screen.getByText('No transcript available.')).toBeInTheDocument()
    })

    it('displays message when segments array is missing', () => {
      const onSeek = vi.fn()
      const invalidTranscript = {} as TranscriptJson

      render(
        <TranscriptViewer
          transcript={invalidTranscript}
          currentTime={0}
          onSeek={onSeek}
        />
      )

      expect(screen.getByText('No transcript available.')).toBeInTheDocument()
    })
  })

  describe('Segment Rendering', () => {
    it('renders all transcript segments', () => {
      const onSeek = vi.fn()

      render(
        <TranscriptViewer transcript={mockTranscript} currentTime={0} onSeek={onSeek} />
      )

      expect(screen.getByText(/Hello and welcome to this video/i)).toBeInTheDocument()
      expect(
        screen.getByText(/Today we will discuss advanced techniques/i)
      ).toBeInTheDocument()
      expect(
        screen.getByText(/These techniques are very effective/i)
      ).toBeInTheDocument()
    })

    it('displays timestamps in MM:SS format', () => {
      const onSeek = vi.fn()

      render(
        <TranscriptViewer transcript={mockTranscript} currentTime={0} onSeek={onSeek} />
      )

      expect(screen.getByText('[00:00]')).toBeInTheDocument()
      expect(screen.getByText('[00:05]')).toBeInTheDocument()
      expect(screen.getByText('[00:12]')).toBeInTheDocument()
    })

    it('displays speaker labels', () => {
      const onSeek = vi.fn()

      render(
        <TranscriptViewer transcript={mockTranscript} currentTime={0} onSeek={onSeek} />
      )

      // There are multiple instances of Speaker 1 and Speaker 2
      const speaker1Labels = screen.getAllByText('(Speaker 1)')
      const speaker2Labels = screen.getAllByText('(Speaker 2)')

      expect(speaker1Labels.length).toBeGreaterThan(0)
      expect(speaker2Labels.length).toBeGreaterThan(0)
    })

    it('renders segments without speaker labels when not provided', () => {
      const transcriptWithoutSpeakers: TranscriptJson = {
        segments: [
          {
            start: 0,
            end: 5,
            text: 'No speaker identified',
            confidence: 0.9,
          },
        ],
      }
      const onSeek = vi.fn()

      render(
        <TranscriptViewer
          transcript={transcriptWithoutSpeakers}
          currentTime={0}
          onSeek={onSeek}
        />
      )

      expect(screen.getByText('No speaker identified')).toBeInTheDocument()
      // Check that there are no speaker label elements (wrapped in parentheses)
      expect(screen.queryByText(/\(Speaker \d+\)/i)).not.toBeInTheDocument()
    })
  })

  describe('Active Segment Highlighting', () => {
    it('highlights segment when currentTime is within segment range', () => {
      const onSeek = vi.fn()

      render(
        <TranscriptViewer transcript={mockTranscript} currentTime={7} onSeek={onSeek} />
      )

      // Current time is 7, which falls in segment 2 (5-12 seconds)
      const activeSegment = screen
        .getByText(/Today we will discuss advanced techniques/i)
        .closest('.MuiListItem-root')

      expect(activeSegment).toBeInTheDocument()
      // Check that the active segment has background color applied
      expect(activeSegment).toHaveStyle({ backgroundColor: expect.any(String) })
    })

    it('does not highlight segments outside currentTime range', () => {
      const onSeek = vi.fn()

      render(
        <TranscriptViewer transcript={mockTranscript} currentTime={7} onSeek={onSeek} />
      )

      // Current time is 7, so segment 1 (0-5) should not be highlighted
      const inactiveSegment = screen
        .getByText(/Hello and welcome to this video/i)
        .closest('.MuiListItem-root')

      expect(inactiveSegment).toBeInTheDocument()
    })

    it('updates highlighting when currentTime changes', () => {
      const onSeek = vi.fn()

      const { rerender } = render(
        <TranscriptViewer transcript={mockTranscript} currentTime={2} onSeek={onSeek} />
      )

      // Initially at 2 seconds - segment 1 (0-5) should be active
      let activeText = screen.getByText(/Hello and welcome to this video/i)
      expect(activeText).toBeInTheDocument()

      // Update to 15 seconds - segment 3 (12-18) should now be active
      rerender(
        <TranscriptViewer transcript={mockTranscript} currentTime={15} onSeek={onSeek} />
      )

      activeText = screen.getByText(/These techniques are very effective/i)
      expect(activeText).toBeInTheDocument()
    })

    it('handles edge case when currentTime equals segment start time', () => {
      const onSeek = vi.fn()

      render(
        <TranscriptViewer transcript={mockTranscript} currentTime={5} onSeek={onSeek} />
      )

      // currentTime = 5 should activate segment 2 (5-12)
      const activeSegment = screen.getByText(/Today we will discuss advanced techniques/i)
      expect(activeSegment).toBeInTheDocument()
    })

    it('does not highlight when currentTime equals segment end time', () => {
      const onSeek = vi.fn()

      render(
        <TranscriptViewer transcript={mockTranscript} currentTime={12} onSeek={onSeek} />
      )

      // currentTime = 12 should NOT activate segment 2 (ends at 12)
      // but should activate segment 3 (starts at 12)
      const activeSegment = screen.getByText(/These techniques are very effective/i)
      expect(activeSegment).toBeInTheDocument()
    })
  })

  describe('Click-to-Seek Functionality', () => {
    it('calls onSeek with segment start time when segment is clicked', async () => {
      const onSeek = vi.fn()
      const user = userEvent.setup()

      render(
        <TranscriptViewer transcript={mockTranscript} currentTime={0} onSeek={onSeek} />
      )

      const segment = screen.getByText(/Today we will discuss advanced techniques/i)
      await user.click(segment)

      expect(onSeek).toHaveBeenCalledWith(5)
    })

    it('calls onSeek with correct time for each segment', async () => {
      const onSeek = vi.fn()
      const user = userEvent.setup()

      render(
        <TranscriptViewer transcript={mockTranscript} currentTime={0} onSeek={onSeek} />
      )

      // Click first segment
      const segment1 = screen.getByText(/Hello and welcome to this video/i)
      await user.click(segment1)
      expect(onSeek).toHaveBeenLastCalledWith(0)

      // Click third segment
      const segment3 = screen.getByText(/These techniques are very effective/i)
      await user.click(segment3)
      expect(onSeek).toHaveBeenLastCalledWith(12)
    })

    it('allows clicking timestamp area to seek', async () => {
      const onSeek = vi.fn()
      const user = userEvent.setup()

      render(
        <TranscriptViewer transcript={mockTranscript} currentTime={0} onSeek={onSeek} />
      )

      const timestamp = screen.getByText('[00:05]')
      await user.click(timestamp)

      expect(onSeek).toHaveBeenCalledWith(5)
    })

    it('allows clicking speaker label to seek', async () => {
      const onSeek = vi.fn()
      const user = userEvent.setup()

      render(
        <TranscriptViewer transcript={mockTranscript} currentTime={0} onSeek={onSeek} />
      )

      const speakerLabel = screen.getByText('(Speaker 2)')
      await user.click(speakerLabel)

      expect(onSeek).toHaveBeenCalledWith(5)
    })
  })

  describe('Timestamp Formatting', () => {
    it('formats timestamps with leading zeros for minutes and seconds', () => {
      const transcriptWithVariousTimes: TranscriptJson = {
        segments: [
          { start: 5, end: 10, text: 'Short time', confidence: 0.9 },
          { start: 65, end: 70, text: 'Over one minute', confidence: 0.9 },
          { start: 605, end: 610, text: 'Over ten minutes', confidence: 0.9 },
        ],
      }
      const onSeek = vi.fn()

      render(
        <TranscriptViewer
          transcript={transcriptWithVariousTimes}
          currentTime={0}
          onSeek={onSeek}
        />
      )

      expect(screen.getByText('[00:05]')).toBeInTheDocument()
      expect(screen.getByText('[01:05]')).toBeInTheDocument()
      expect(screen.getByText('[10:05]')).toBeInTheDocument()
    })

    it('handles zero timestamp correctly', () => {
      const onSeek = vi.fn()

      render(
        <TranscriptViewer transcript={mockTranscript} currentTime={0} onSeek={onSeek} />
      )

      expect(screen.getByText('[00:00]')).toBeInTheDocument()
    })
  })

  describe('Scrollable List', () => {
    it('renders list container for scrolling', () => {
      const onSeek = vi.fn()

      const { container } = render(
        <TranscriptViewer transcript={mockTranscript} currentTime={0} onSeek={onSeek} />
      )

      const list = container.querySelector('.MuiList-root')
      expect(list).toBeInTheDocument()
    })

    it('renders multiple segments in list', () => {
      const onSeek = vi.fn()

      const { container } = render(
        <TranscriptViewer transcript={mockTranscript} currentTime={0} onSeek={onSeek} />
      )

      const listItems = container.querySelectorAll('.MuiListItem-root')
      expect(listItems.length).toBe(3)
    })
  })

  describe('Long Transcript Scenarios', () => {
    it('handles transcript with many segments', () => {
      const longTranscript: TranscriptJson = {
        segments: Array.from({ length: 50 }, (_, i) => ({
          start: i * 5,
          end: (i + 1) * 5,
          text: `Segment ${i + 1} content`,
          speaker: `Speaker ${(i % 3) + 1}`,
          confidence: 0.9,
        })),
      }
      const onSeek = vi.fn()

      const { container } = render(
        <TranscriptViewer transcript={longTranscript} currentTime={25} onSeek={onSeek} />
      )

      const listItems = container.querySelectorAll('.MuiListItem-root')
      expect(listItems.length).toBe(50)
    })

    it('handles very long segment text', () => {
      const transcriptWithLongText: TranscriptJson = {
        segments: [
          {
            start: 0,
            end: 30,
            text: 'This is a very long segment text that contains multiple sentences and continues for quite some time to test how the component handles lengthy content without breaking the layout or causing issues.',
            speaker: 'Speaker 1',
            confidence: 0.9,
          },
        ],
      }
      const onSeek = vi.fn()

      render(
        <TranscriptViewer
          transcript={transcriptWithLongText}
          currentTime={0}
          onSeek={onSeek}
        />
      )

      expect(
        screen.getByText(/This is a very long segment text/i)
      ).toBeInTheDocument()
    })
  })
})
