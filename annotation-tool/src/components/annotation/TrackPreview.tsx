/**
 * Full-screen preview component for reviewing a single tracking result.
 * Displays all bounding boxes for a track with playback controls.
 * Supports keyboard shortcuts for accept/reject and frame navigation.
 *
 * @module
 */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  X,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react'
import { TrackingResult } from '@models/types'

/**
 * Props for TrackPreview component.
 *
 * @param track - Tracking result to preview, or null if no track selected
 * @param videoId - ID of the video being annotated
 * @param onAccept - Callback when user accepts the track
 * @param onReject - Callback when user rejects the track
 * @param onClose - Callback when user closes the preview
 * @param videoElement - Optional video element for playback control
 */
export interface TrackPreviewProps {
  track: TrackingResult | null
  videoId: string
  onAccept: () => void
  onReject: () => void
  onClose: () => void
  videoElement?: HTMLVideoElement | null
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
 * Get border color string for confidence.
 */
function getConfidenceBorderColor(confidence: number): string {
  if (confidence > 0.9) return 'green'
  if (confidence > 0.7) return 'orange'
  return 'red'
}

/**
 * Full-screen preview dialog for reviewing a single tracking result.
 * Shows all bounding boxes with frame-by-frame scrubbing, playback controls,
 * and keyboard shortcuts for quick accept/reject decisions.
 *
 * @param props - Component properties
 * @returns React component
 */
export function TrackPreview({
  track,
  onAccept,
  onReject,
  onClose,
}: TrackPreviewProps) {
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  // Reset state when track changes
  useEffect(() => {
    setCurrentFrameIndex(0)
    setIsPlaying(false)
  }, [track])

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!track) return

    const handleKeyPress = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case 'y':
          onAccept()
          break
        case 'n':
          onReject()
          break
        case ' ':
          e.preventDefault()
          setIsPlaying((prev) => !prev)
          break
        case 'arrowright':
          setCurrentFrameIndex((prev) => Math.min(prev + 1, track.frames.length - 1))
          break
        case 'arrowleft':
          setCurrentFrameIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'escape':
          onClose()
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [track, onAccept, onReject, onClose])

  // Playback loop
  useEffect(() => {
    if (!isPlaying || !track) return

    const interval = setInterval(() => {
      setCurrentFrameIndex((prev) => {
        if (prev >= track.frames.length - 1) {
          setIsPlaying(false)
          return prev
        }
        return prev + 1
      })
    }, 100) // ~10 fps playback

    return () => clearInterval(interval)
  }, [isPlaying, track])

  if (!track) {
    return null
  }

  const currentFrame = track.frames[currentFrameIndex]
  const frameNumbers = track.frames.map((f) => f.frameNumber)

  // Find gaps in tracking
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

  // Find low confidence frames
  const lowConfidenceFrames = track.frames.filter((f) => f.confidence < 0.7)

  return (
    <Dialog open={Boolean(track)} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="max-w-[90vw] h-[90vh] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <DialogTitle>
                Track #{track.trackId}: {track.label}
              </DialogTitle>
              <Badge variant={getConfidenceVariant(track.confidence)}>
                Confidence: {track.confidence.toFixed(2)}
              </Badge>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 overflow-hidden px-2">
          {/* Video preview area (placeholder) */}
          <div className="flex-1 bg-gray-900 rounded-lg flex items-center justify-center relative min-h-[400px]">
            <h3 className="text-lg text-gray-500">
              Video Preview with Bounding Box
            </h3>
            {/* In actual implementation, render video with bounding box overlay */}
            {currentFrame && (
              <div
                className="absolute pointer-events-none"
                style={{
                  border: `3px solid ${getConfidenceBorderColor(currentFrame.confidence)}`,
                  left: `${currentFrame.box.x}%`,
                  top: `${currentFrame.box.y}%`,
                  width: `${currentFrame.box.width}%`,
                  height: `${currentFrame.box.height}%`,
                }}
              />
            )}
          </div>

          {/* Frame info and warnings */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <p className="text-sm">
                Frame {currentFrame.frameNumber} ({currentFrameIndex + 1}/{track.frames.length})
              </p>
              <p className="text-sm text-muted-foreground">
                Confidence: {currentFrame.confidence.toFixed(2)}
              </p>
            </div>

            {gaps.length > 0 && (
              <Alert>
                <AlertTriangle className="size-4" />
                <AlertDescription>
                  Gaps detected: {gaps.map((g) => `Frame ${g.start}-${g.end}`).join(', ')}
                </AlertDescription>
              </Alert>
            )}

            {lowConfidenceFrames.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription>
                  {lowConfidenceFrames.length} low confidence frame{lowConfidenceFrames.length !== 1 ? 's' : ''} ({'<'}70%):{' '}
                  {lowConfidenceFrames
                    .slice(0, 5)
                    .map((f) => `Frame ${f.frameNumber} (${f.confidence.toFixed(2)})`)
                    .join(', ')}
                  {lowConfidenceFrames.length > 5 && '...'}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Timeline slider */}
          <div className="px-4">
            <Slider
              value={[currentFrameIndex]}
              onValueChange={(v) => setCurrentFrameIndex(Array.isArray(v) ? v[0] : v)}
              min={0}
              max={track.frames.length - 1}
              step={1}
            />
          </div>

          {/* Transport controls */}
          <div className="flex flex-row gap-4 justify-center items-center">
            <Button
              variant="outline"
              onClick={() => setCurrentFrameIndex((prev) => Math.max(prev - 1, 0))}
              disabled={currentFrameIndex === 0}
            >
              <ChevronLeft className="size-4 mr-1" />
              Prev
            </Button>

            <Button
              onClick={() => setIsPlaying((prev) => !prev)}
            >
              {isPlaying ? <Pause className="size-4 mr-1" /> : <Play className="size-4 mr-1" />}
              {isPlaying ? 'Pause' : 'Play'}
            </Button>

            <Button
              variant="outline"
              onClick={() => setCurrentFrameIndex((prev) => Math.min(prev + 1, track.frames.length - 1))}
              disabled={currentFrameIndex === track.frames.length - 1}
            >
              Next
              <ChevronRight className="size-4 ml-1" />
            </Button>
          </div>

          {/* Keyboard shortcuts hint */}
          <p className="text-xs text-muted-foreground text-center">
            Keyboard: Y (Accept) · N (Reject) · Space (Play/Pause) · ← → (Step) · Esc (Close)
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="outline"
            onClick={onReject}
            className="text-destructive"
          >
            <XCircle className="size-4 mr-1" />
            Reject (N)
          </Button>
          <Button
            onClick={onAccept}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle className="size-4 mr-1" />
            Accept (Y)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
