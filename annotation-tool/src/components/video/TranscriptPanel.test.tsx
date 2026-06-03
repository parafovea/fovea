/**
 * Tests for the TranscriptPanel component, which powers the
 * Transcribe Audio dialog in AnnotationWorkspace.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TranscriptSegment } from '@api/client'
import { TranscriptPanel, type TranscriptPanelProps } from './TranscriptPanel'

// jsdom does not implement scrollIntoView; the component calls it on the
// active segment so we stub it once for every test in this file.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const baseSegments: TranscriptSegment[] = [
  { start: 0, end: 5, text: 'Hello and welcome.', confidence: 0.95, speaker: 'SPEAKER_00' },
  { start: 5, end: 12, text: 'Today we discuss techniques.', confidence: 0.92, speaker: 'SPEAKER_01' },
  { start: 75, end: 90, text: 'These techniques are effective.', confidence: 0.88, speaker: 'SPEAKER_00' },
]

function renderPanel(overrides: Partial<TranscriptPanelProps> = {}): {
  onSeek: ReturnType<typeof vi.fn>
  rerender: (props: Partial<TranscriptPanelProps>) => void
} {
  const onSeek = vi.fn()
  const props: TranscriptPanelProps = {
    segments: baseSegments,
    currentTime: 0,
    onSeek,
    ...overrides,
  }
  const utils = render(<TranscriptPanel {...props} />)
  return {
    onSeek,
    rerender: (next) => utils.rerender(<TranscriptPanel {...props} {...next} />),
  }
}

describe('TranscriptPanel', () => {
  it('renders the header summary with language, duration, model, and processing time', () => {
    renderPanel({
      language: 'en',
      duration: 42,
      modelUsed: 'faster-whisper-tiny',
      processingTime: 3.2,
    })

    expect(screen.getByText('Language:')).toBeInTheDocument()
    expect(screen.getByText('EN')).toBeInTheDocument()
    expect(screen.getByText('Duration:')).toBeInTheDocument()
    expect(screen.getByText('42.0s')).toBeInTheDocument()
    expect(screen.getByText('ASR:')).toBeInTheDocument()
    expect(screen.getByText(/faster-whisper-tiny/)).toBeInTheDocument()
    expect(screen.getByText('(3.2s)')).toBeInTheDocument()
  })

  it('renders a speaker legend chip per entry with friendly pyannote labels', () => {
    renderPanel({ speakers: ['SPEAKER_00', 'SPEAKER_01', 'Alice'] })

    const legend = screen.getByTestId('speaker-legend')
    expect(within(legend).getByText('Speaker 1')).toBeInTheDocument()
    expect(within(legend).getByText('Speaker 2')).toBeInTheDocument()
    expect(within(legend).getByText('Alice')).toBeInTheDocument()
  })

  it('renders each segment as a button with MM:SS timestamp and seeks on click', async () => {
    const user = userEvent.setup()
    const { onSeek } = renderPanel()

    const segments = screen.getAllByTestId('transcript-segment')
    expect(segments).toHaveLength(3)

    // Segment 3 start=75 → "01:15"
    const third = segments[2]
    expect(within(third).getByText('01:15')).toBeInTheDocument()
    expect(within(third).getByText('These techniques are effective.')).toBeInTheDocument()

    await user.click(third)
    expect(onSeek).toHaveBeenCalledTimes(1)
    expect(onSeek).toHaveBeenCalledWith(75)
  })

  it('marks only the segment containing currentTime with data-active="true"', () => {
    renderPanel({ currentTime: 7 })

    const segments = screen.getAllByTestId('transcript-segment')
    expect(segments[0]).not.toHaveAttribute('data-active')
    expect(segments[1]).toHaveAttribute('data-active', 'true')
    expect(segments[2]).not.toHaveAttribute('data-active')
  })

  it('moves the active marker between rerenders as currentTime changes', () => {
    const { rerender } = renderPanel({ currentTime: 2 })

    let segments = screen.getAllByTestId('transcript-segment')
    expect(segments[0]).toHaveAttribute('data-active', 'true')
    expect(segments[1]).not.toHaveAttribute('data-active')

    rerender({ currentTime: 7 })

    segments = screen.getAllByTestId('transcript-segment')
    expect(segments[0]).not.toHaveAttribute('data-active')
    expect(segments[1]).toHaveAttribute('data-active', 'true')
  })

  it('shows friendly speaker chips per segment, falling back to "Unknown" when a segment has no speaker', () => {
    const segments: TranscriptSegment[] = [
      { start: 0, end: 5, text: 'First.', confidence: 0.9, speaker: 'SPEAKER_00' },
      { start: 5, end: 10, text: 'Second.', confidence: 0.9, speaker: null },
    ]
    renderPanel({ segments, speakers: ['SPEAKER_00'] })

    const buttons = screen.getAllByTestId('transcript-segment')
    expect(within(buttons[0]).getByText('Speaker 1')).toBeInTheDocument()
    expect(within(buttons[1]).getByText('Unknown')).toBeInTheDocument()
  })

  it('omits per-segment speaker chips when there are no speakers anywhere', () => {
    const segments: TranscriptSegment[] = [
      { start: 0, end: 5, text: 'No speaker here.', confidence: 0.9 },
      { start: 5, end: 10, text: 'Still no speaker.', confidence: 0.9 },
    ]
    renderPanel({ segments, speakers: [] })

    expect(screen.queryByTestId('speaker-legend')).not.toBeInTheDocument()

    const buttons = screen.getAllByTestId('transcript-segment')
    for (const btn of buttons) {
      expect(within(btn).queryByText('Unknown')).not.toBeInTheDocument()
      expect(within(btn).queryByText(/Speaker \d+/)).not.toBeInTheDocument()
    }
    // Timestamps + text still appear.
    expect(screen.getByText('No speaker here.')).toBeInTheDocument()
    expect(screen.getByText('Still no speaker.')).toBeInTheDocument()
  })

  it('renders the italic "(silence)" placeholder for empty/whitespace segment text', () => {
    const segments: TranscriptSegment[] = [
      { start: 0, end: 5, text: '   ', confidence: 0.9 },
    ]
    renderPanel({ segments })

    const silence = screen.getByText('(silence)')
    expect(silence).toBeInTheDocument()
    expect(silence.tagName.toLowerCase()).toBe('span')
    expect(silence).toHaveClass('italic')
  })

  it('surfaces diarization metadata in the header when provided', () => {
    renderPanel({
      diarizationModelUsed: 'pyannote/speaker-diarization-3.1',
      diarizationProcessingTime: 8.4,
    })

    expect(screen.getByText('Diarization:')).toBeInTheDocument()
    expect(screen.getByText(/pyannote\/speaker-diarization-3\.1/)).toBeInTheDocument()
    expect(screen.getByText('(8.4s)')).toBeInTheDocument()
  })
})
