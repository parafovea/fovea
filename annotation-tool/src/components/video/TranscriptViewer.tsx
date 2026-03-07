/**
 * Component for displaying audio transcript with timestamps and speaker labels.
 * Highlights active segment based on video playback position and supports click-to-seek functionality.
 */

import { cn } from '@/lib/utils'
import { TranscriptJson } from './types'

/**
 * Props for TranscriptViewer component.
 */
export interface TranscriptViewerProps {
  /** Structured transcript with segments, speakers, and language. */
  transcript: TranscriptJson
  /** Current video playback time in seconds. Used to highlight active segment. */
  currentTime: number
  /** Callback invoked when user clicks a segment to seek to that timestamp. */
  onSeek: (time: number) => void
}

/**
 * Format timestamp in seconds to MM:SS format.
 *
 * @param seconds - Time in seconds
 * @returns Formatted time string (e.g., "01:23")
 */
function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
}

/**
 * Component for displaying transcript segments with timestamps and speaker labels.
 * Provides synchronized highlighting with video playback and click-to-seek functionality.
 *
 * @param props - Component properties
 * @returns TranscriptViewer component
 *
 * @example
 * ```tsx
 * const transcript = {
 *   segments: [
 *     { start: 0, end: 5, text: "Hello world", speaker: "Speaker 1", confidence: 0.95 },
 *     { start: 5, end: 10, text: "How are you?", speaker: "Speaker 2", confidence: 0.92 }
 *   ]
 * }
 *
 * <TranscriptViewer
 *   transcript={transcript}
 *   currentTime={3.5}
 *   onSeek={(time) => videoPlayer.currentTime = time}
 * />
 * ```
 */
export function TranscriptViewer({ transcript, currentTime, onSeek }: TranscriptViewerProps) {
  // Handle empty transcript
  if (!transcript || !transcript.segments || transcript.segments.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">
          No transcript available.
        </p>
      </div>
    )
  }

  return (
    <ul className="w-full max-h-[400px] overflow-auto bg-card">
      {transcript.segments.map((segment, index) => {
        // Determine if this segment is currently active
        const isActive = currentTime >= segment.start && currentTime < segment.end

        return (
          <li
            key={index}
            className={cn(
              'transition-colors duration-200',
              isActive ? 'bg-primary/20' : 'hover:bg-muted'
            )}
          >
            <button
              type="button"
              className="w-full px-4 py-2 text-left"
              onClick={() => onSeek(segment.start)}
            >
              <div className="w-full">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs text-muted-foreground font-medium min-w-[50px]">
                    [{formatTimestamp(segment.start)}]
                  </span>
                  {segment.speaker && (
                    <span className="text-xs text-primary font-medium">
                      ({segment.speaker})
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    'text-sm',
                    isActive ? 'text-primary' : 'text-foreground'
                  )}
                >
                  {segment.text}
                </p>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
