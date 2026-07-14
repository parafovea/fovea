/**
 * Component for displaying and managing object detection results as annotation candidates.
 * Allows accepting or rejecting detected objects to create annotations.
 */

import { useState, useMemo } from 'react'
import { CheckCircle, XCircle, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { useAddAnnotation } from '@store/queries'
import { useTourAnchor } from '@/tours/engine/anchorRegistry'
import type { Detection, FrameDetections } from '@api/client'
import { v4 as uuidv4 } from 'uuid'

/**
 * Props for AnnotationCandidatesList component.
 */
export interface AnnotationCandidatesListProps {
  /**
   * Video identifier for the detections.
   */
  videoId: string
  /**
   * Detection results from the API.
   */
  frames: FrameDetections[]
  /**
   * Persona ID for type-based annotations.
   * If provided, candidates are converted to TypeAnnotations.
   */
  personaId?: string
  /**
   * Type ID for type-based annotations.
   * Required if personaId is provided.
   */
  typeId?: string
  /**
   * Type category for type-based annotations.
   * Required if personaId is provided.
   */
  typeCategory?: 'entity' | 'role' | 'event'
  /**
   * Callback when a detection is accepted.
   */
  onAccept?: (detection: Detection, frameNumber: number) => void
  /**
   * Callback when a detection is rejected.
   */
  onReject?: (detection: Detection, frameNumber: number) => void
  /**
   * Show frame thumbnails with bounding box overlays.
   * @default false
   */
  showThumbnails?: boolean
  /**
   * Initial confidence threshold filter (0-1).
   * @default 0.3
   */
  initialConfidenceThreshold?: number
}

/**
 * Individual detection candidate item.
 */
interface CandidateItem {
  detection: Detection
  frameNumber: number
  timestamp: number
  status: 'pending' | 'accepted' | 'rejected'
}

/**
 * Get confidence level classification.
 */
function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.7) return 'high'
  if (confidence >= 0.4) return 'medium'
  return 'low'
}

/**
 * Get badge variant for confidence level.
 */
function getConfidenceVariant(
  level: 'high' | 'medium' | 'low'
): 'default' | 'secondary' | 'destructive' {
  switch (level) {
    case 'high':
      return 'default'
    case 'medium':
      return 'secondary'
    case 'low':
      return 'destructive'
  }
}

/**
 * Component for displaying and managing object detection results.
 * Displays detection candidates with accept/reject controls and confidence filtering.
 *
 * @param props - Component properties
 * @returns AnnotationCandidatesList component
 *
 * @example
 * ```tsx
 * // Basic usage with object annotations
 * <AnnotationCandidatesList
 *   videoId="video-123"
 *   frames={detectionResponse.frames}
 *   onAccept={(detection, frame) => console.log('Accepted:', detection)}
 * />
 *
 * // With type annotations
 * <AnnotationCandidatesList
 *   videoId="video-456"
 *   frames={detectionResponse.frames}
 *   personaId="analyst-1"
 *   typeId="vehicle-type-id"
 *   typeCategory="entity"
 * />
 * ```
 */
export function AnnotationCandidatesList({
  videoId,
  frames,
  personaId,
  typeId,
  typeCategory,
  onAccept,
  onReject,
  initialConfidenceThreshold = 0.3,
}: AnnotationCandidatesListProps) {
  const { mutate: addAnnotation } = useAddAnnotation()
  const candidatesListAnchor = useTourAnchor('annotation-candidates-list')
  const [candidates, setCandidates] = useState<CandidateItem[]>(() => {
    // Flatten all detections into candidate items
    return frames.flatMap((frame) =>
      frame.detections.map((detection) => ({
        detection,
        frameNumber: frame.frameNumber,
        timestamp: frame.timestamp,
        status: 'pending' as const,
      }))
    )
  })
  const [confidenceThreshold, setConfidenceThreshold] = useState(
    initialConfidenceThreshold
  )
  const [showFilters, setShowFilters] = useState(false)

  // Filter candidates by confidence threshold and status
  const filteredCandidates = useMemo(() => {
    return candidates.filter(
      (candidate) =>
        candidate.detection.confidence >= confidenceThreshold &&
        candidate.status === 'pending'
    )
  }, [candidates, confidenceThreshold])

  // Statistics
  const stats = useMemo(() => {
    const accepted = candidates.filter((c) => c.status === 'accepted').length
    const rejected = candidates.filter((c) => c.status === 'rejected').length
    const pending = candidates.filter((c) => c.status === 'pending').length
    return { accepted, rejected, pending, total: candidates.length }
  }, [candidates])

  /**
   * Handle accepting a detection candidate.
   */
  const handleAccept = (index: number) => {
    const candidate = filteredCandidates[index]
    if (!candidate) return

    // Update candidate status
    setCandidates((prev) =>
      prev.map((c) =>
        c === candidate ? { ...c, status: 'accepted' as const } : c
      )
    )

    // Create annotation
    const annotationId = uuidv4()
    const bbox = candidate.detection.boundingBox

    if (personaId && typeId && typeCategory) {
      // Type annotation
      addAnnotation({
        id: annotationId,
        videoId,
        annotationType: 'type',
        personaId,
        typeCategory,
        typeId,
        boundingBoxSequence: {
          boxes: [{
            x: bbox.x,
            y: bbox.y,
            width: bbox.width,
            height: bbox.height,
            frameNumber: candidate.frameNumber,
            confidence: candidate.detection.confidence,
            isKeyframe: true,
          }],
          interpolationSegments: [],
          visibilityRanges: [{
            startFrame: candidate.frameNumber,
            endFrame: candidate.frameNumber,
            visible: true,
          }],
          totalFrames: 1,
          keyframeCount: 1,
          interpolatedFrameCount: 0,
        },
        confidence: candidate.detection.confidence,
        notes: `Detected: ${candidate.detection.label}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    } else {
      // Object annotation (without linking yet - user needs to link manually)
      addAnnotation({
        id: annotationId,
        videoId,
        annotationType: 'object',
        boundingBoxSequence: {
          boxes: [{
            x: bbox.x,
            y: bbox.y,
            width: bbox.width,
            height: bbox.height,
            frameNumber: candidate.frameNumber,
            confidence: candidate.detection.confidence,
            isKeyframe: true,
          }],
          interpolationSegments: [],
          visibilityRanges: [{
            startFrame: candidate.frameNumber,
            endFrame: candidate.frameNumber,
            visible: true,
          }],
          totalFrames: 1,
          keyframeCount: 1,
          interpolatedFrameCount: 0,
        },
        confidence: candidate.detection.confidence,
        notes: `Detected: ${candidate.detection.label}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }

    // Callback
    onAccept?.(candidate.detection, candidate.frameNumber)
  }

  /**
   * Handle rejecting a detection candidate.
   */
  const handleReject = (index: number) => {
    const candidate = filteredCandidates[index]
    if (!candidate) return

    setCandidates((prev) =>
      prev.map((c) =>
        c === candidate ? { ...c, status: 'rejected' as const } : c
      )
    )

    onReject?.(candidate.detection, candidate.frameNumber)
  }

  /**
   * Accept all filtered candidates.
   */
  const handleAcceptAll = () => {
    filteredCandidates.forEach((_, index) => handleAccept(index))
  }

  /**
   * Reject all filtered candidates.
   */
  const handleRejectAll = () => {
    filteredCandidates.forEach((_, index) => handleReject(index))
  }

  if (candidates.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          No detections found. Try adjusting the query or confidence threshold.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div ref={candidatesListAnchor}>
      {/* Statistics Bar */}
      <div className="mb-4 p-4 bg-card rounded-lg ring-1 ring-foreground/10">
        <div className="flex flex-row gap-4 items-center">
          <h3 className="text-base font-semibold">Detection Candidates</h3>
          <Badge variant="outline">Total: {stats.total}</Badge>
          <Badge variant="outline">Pending: {stats.pending}</Badge>
          <Badge variant="default">Accepted: {stats.accepted}</Badge>
          <Badge variant="destructive">Rejected: {stats.rejected}</Badge>
          <div className="flex-grow" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            aria-label="toggle filters"
          >
            <SlidersHorizontal className="size-4" />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Collapsible open={showFilters}>
        <CollapsibleContent>
          <div className="mb-4 p-4 bg-card rounded-lg ring-1 ring-foreground/10">
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Filters
            </p>
            <div className="flex flex-row gap-4 items-center">
              <div className="w-[200px]">
                <Label htmlFor="confidence-threshold">Confidence Threshold</Label>
                <Input
                  id="confidence-threshold"
                  type="number"
                  value={confidenceThreshold}
                  onChange={(e) =>
                    setConfidenceThreshold(parseFloat(e.target.value) || 0)
                  }
                  min={0}
                  max={1}
                  step={0.1}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Showing {filteredCandidates.length} candidates
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Batch Actions */}
      {filteredCandidates.length > 0 && (
        <div className="mb-4 flex flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAcceptAll}
          >
            <CheckCircle className="size-4 mr-1" />
            Accept All ({filteredCandidates.length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRejectAll}
          >
            <XCircle className="size-4 mr-1" />
            Reject All ({filteredCandidates.length})
          </Button>
        </div>
      )}

      {/* Candidates List */}
      {filteredCandidates.length === 0 ? (
        <Alert>
          <AlertDescription>
            No pending candidates match the current filters. Try lowering the
            confidence threshold.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {filteredCandidates.map((candidate, index) => {
            const confidenceLevel = getConfidenceLevel(
              candidate.detection.confidence
            )
            const confidenceVariant = getConfidenceVariant(confidenceLevel)

            return (
              <Card key={index}>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    {/* Label and Confidence */}
                    <div className="flex items-center justify-between">
                      <h4 className="text-base font-semibold">
                        {candidate.detection.label}
                      </h4>
                      <Badge variant={confidenceVariant}>
                        {Math.round(candidate.detection.confidence * 100)}%
                      </Badge>
                    </div>

                    <Separator />

                    {/* Frame Information */}
                    <p className="text-sm text-muted-foreground">
                      Frame: {candidate.frameNumber} ({candidate.timestamp.toFixed(2)}s)
                    </p>

                    {/* Bounding Box Info */}
                    <p className="text-xs text-muted-foreground">
                      Box: ({candidate.detection.boundingBox.x.toFixed(3)}, {candidate.detection.boundingBox.y.toFixed(3)})
                      {' '}W: {candidate.detection.boundingBox.width.toFixed(3)},
                      H: {candidate.detection.boundingBox.height.toFixed(3)}
                    </p>

                    {/* Track ID if available */}
                    {candidate.detection.trackId && (
                      <Badge variant="outline">
                        Track ID: {candidate.detection.trackId}
                      </Badge>
                    )}

                    {/* Tour-demo suggested type. Surfaced when the
                        detection carries an acceptAsLabel hint (mock
                        layer only). Wikidata QID renders as a sublink
                        so the booth visitor sees the type is already
                        grounded. */}
                    {candidate.detection.acceptAsLabel && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-xs text-muted-foreground">
                          Snap to type:
                        </span>
                        <Badge variant="secondary" data-testid="suggested-type-chip">
                          {candidate.detection.acceptAsLabel}
                          {candidate.detection.acceptAsWikidataId && (
                            <span className="ml-1.5 text-xs opacity-70">
                              {candidate.detection.acceptAsWikidataId}
                            </span>
                          )}
                        </Badge>
                      </div>
                    )}
                  </div>
                </CardContent>

                <CardFooter className="justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleReject(index)}
                  >
                    <XCircle className="size-4 mr-1" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleAccept(index)}
                  >
                    <CheckCircle className="size-4 mr-1" />
                    Accept
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
