/**
 * Panel for reviewing and managing tracking results.
 * Displays candidate tracks with confidence indicators and frame coverage.
 * Allows preview, accept, and reject actions for each track.
 *
 * @module
 */

import { useState } from 'react'
import { CheckCircle, XCircle, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { TrackingResult } from '@models/types'

/**
 * Props for TrackingResultsPanel component.
 *
 * @param trackingResults - Array of tracking results from model service
 * @param videoId - ID of the video being annotated
 * @param onAcceptTrack - Callback when track is accepted
 * @param onRejectTrack - Callback when track is rejected
 * @param onPreviewTrack - Callback when track preview is requested
 */
export interface TrackingResultsPanelProps {
  trackingResults: TrackingResult[]
  videoId: string
  onAcceptTrack: (trackId: string | number) => void
  onRejectTrack: (trackId: string | number) => void
  onPreviewTrack: (trackId: string | number) => void
}

/**
 * Get color based on confidence level.
 *
 * @param confidence - Confidence value (0-1)
 * @returns CSS class name for confidence color
 */
function getConfidenceColorClass(confidence: number): string {
  if (confidence > 0.9) return 'bg-green-500'
  if (confidence > 0.7) return 'bg-yellow-500'
  return 'bg-red-500'
}

/**
 * Get badge variant for confidence level.
 */
function getConfidenceVariant(confidence: number): 'default' | 'secondary' | 'destructive' {
  if (confidence > 0.9) return 'default'
  if (confidence > 0.7) return 'secondary'
  return 'destructive'
}

/**
 * Panel for reviewing tracking results from automated tracking.
 * Displays list of tracked candidates with confidence indicators, frame coverage
 * visualization, and preview, accept, and reject actions.
 *
 * @param props - Component properties
 * @returns React component
 */
export function TrackingResultsPanel({
  trackingResults,
  onAcceptTrack,
  onRejectTrack,
  onPreviewTrack,
}: TrackingResultsPanelProps) {
  const [hoveredTrack, setHoveredTrack] = useState<string | number | null>(null)

  const handleAcceptAll = () => {
    trackingResults
      .filter((track) => track.confidence > 0.9)
      .forEach((track) => onAcceptTrack(track.trackId))
  }

  const handleRejectAll = () => {
    trackingResults
      .filter((track) => track.confidence < 0.7)
      .forEach((track) => onRejectTrack(track.trackId))
  }

  return (
    <div
      data-tour-id="tracking-results-panel"
      className="p-4 max-h-[400px] overflow-y-auto bg-card rounded-lg ring-1 ring-foreground/10 shadow-sm"
    >
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-base font-semibold">Tracking Results</h3>
        <p className="text-sm text-muted-foreground">
          Found {trackingResults.length} track{trackingResults.length !== 1 ? 's' : ''}
        </p>
      </div>

      {trackingResults.length > 1 && (
        <div className="flex flex-row gap-2 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAcceptAll}
            disabled={trackingResults.filter((t) => t.confidence > 0.9).length === 0}
          >
            Accept All High Confidence ({'>'}90%)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRejectAll}
            disabled={trackingResults.filter((t) => t.confidence < 0.7).length === 0}
          >
            Reject All Low Confidence ({'<'}70%)
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {trackingResults.map((track) => {
          const frameNumbers = track.frames.map((f) => f.frameNumber)
          const minFrame = Math.min(...frameNumbers)
          const maxFrame = Math.max(...frameNumbers)
          const totalRange = maxFrame - minFrame + 1
          const coverage = (track.frames.length / totalRange) * 100

          // Calculate gaps
          const gaps: Array<{ start: number; end: number }> = []
          const sortedFrames = [...frameNumbers].sort((a, b) => a - b)
          for (let i = 1; i < sortedFrames.length; i++) {
            if (sortedFrames[i] - sortedFrames[i - 1] > 1) {
              gaps.push({
                start: sortedFrames[i - 1] + 1,
                end: sortedFrames[i] - 1,
              })
            }
          }

          return (
            <div
              key={track.trackId}
              className={`p-4 rounded-lg ring-1 ring-foreground/10 cursor-pointer transition-colors ${
                hoveredTrack === track.trackId ? 'bg-muted' : 'bg-transparent hover:bg-muted'
              }`}
              onMouseEnter={() => setHoveredTrack(track.trackId)}
              onMouseLeave={() => setHoveredTrack(null)}
              onClick={() => onPreviewTrack(track.trackId)}
            >
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    Track #{track.trackId}
                  </span>
                  <Badge variant={getConfidenceVariant(track.confidence)}>
                    {track.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    conf: {track.confidence.toFixed(2)}
                  </span>
                </div>
                <div className="flex flex-row gap-1">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            onPreviewTrack(track.trackId)
                          }}
                        />
                      }
                    >
                      <Eye className="size-4" />
                    </TooltipTrigger>
                    <TooltipContent>Preview Track</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            onAcceptTrack(track.trackId)
                          }}
                        />
                      }
                    >
                      <CheckCircle className="size-4 text-green-600" />
                    </TooltipTrigger>
                    <TooltipContent>Accept Track</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            onRejectTrack(track.trackId)
                          }}
                        />
                      }
                    >
                      <XCircle className="size-4 text-red-600" />
                    </TooltipTrigger>
                    <TooltipContent>Reject Track</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mb-2">
                Frames {minFrame}-{maxFrame} ({gaps.length > 0 ? `${gaps.length} gap${gaps.length !== 1 ? 's' : ''}` : 'continuous'})
              </p>

              <div className="flex items-center gap-2">
                <div className="flex-1 relative h-5">
                  <div className="absolute inset-0 rounded bg-muted overflow-hidden">
                    <div
                      className={`h-full ${getConfidenceColorClass(track.confidence)} rounded`}
                      style={{ width: `${coverage}%` }}
                    />
                  </div>
                  {/* Show gaps as overlays */}
                  {gaps.map((gap, idx) => {
                    const gapStart = ((gap.start - minFrame) / totalRange) * 100
                    const gapWidth = ((gap.end - gap.start + 1) / totalRange) * 100
                    return (
                      <div
                        key={idx}
                        className="absolute top-0 h-5 bg-muted border-l border-r border-border"
                        style={{
                          left: `${gapStart}%`,
                          width: `${gapWidth}%`,
                        }}
                      />
                    )
                  })}
                </div>
                <span className="text-xs text-muted-foreground min-w-[60px]">
                  {track.frames.length}/{totalRange} frames
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {trackingResults.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            No tracking results available
          </p>
        </div>
      )}
    </div>
  )
}
