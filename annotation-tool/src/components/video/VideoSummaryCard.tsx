/**
 * Card component for displaying video summary information.
 * Shows summary text, metadata, and actions for a video summary.
 */

import { useState } from 'react'
import { format } from 'date-fns'
import {
  ChevronDown,
  Pencil,
  Trash2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { VideoSummary } from '@api/client'
import { TranscriptViewer } from './TranscriptViewer'
import { TranscriptJson } from './types'

/**
 * Props for VideoSummaryCard component.
 */
export interface VideoSummaryCardProps {
  summary: VideoSummary | null
  personaName?: string
  personaRole?: string
  loading?: boolean
  error?: string | null
  onEdit?: (summary: VideoSummary) => void
  onDelete?: (summary: VideoSummary) => void
  onRegenerate?: (videoId: string, personaId: string) => void
  showActions?: boolean
  expanded?: boolean
  onExpandChange?: (expanded: boolean) => void
  /** Current video playback time in seconds (for transcript highlighting). */
  currentTime?: number
  /** Callback to seek video to specific timestamp. */
  onSeek?: (time: number) => void
}

/**
 * Card component for displaying video summary information.
 * Displays summary text with optional persona information and actions.
 *
 * @param props - Component properties
 * @returns VideoSummaryCard component
 */
export function VideoSummaryCard({
  summary,
  personaName,
  personaRole,
  loading = false,
  error = null,
  onEdit,
  onDelete,
  onRegenerate,
  showActions = true,
  expanded: controlledExpanded,
  onExpandChange,
  currentTime = 0,
  onSeek,
}: VideoSummaryCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState('summary')

  const isControlled = controlledExpanded !== undefined
  const expanded = isControlled ? controlledExpanded : internalExpanded

  const handleExpandClick = () => {
    const newExpanded = !expanded
    if (isControlled && onExpandChange) {
      onExpandChange(newExpanded)
    } else {
      setInternalExpanded(newExpanded)
    }
  }

  const handleEdit = () => {
    if (summary && onEdit) {
      onEdit(summary)
    }
  }

  const handleDelete = () => {
    if (summary && onDelete) {
      onDelete(summary)
    }
  }

  const handleRegenerate = () => {
    if (summary && onRegenerate) {
      onRegenerate(summary.videoId, summary.personaId)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Skeleton className="w-3/5 h-8" />
          <Skeleton className="w-2/5 h-6 mt-2" />
          <Skeleton className="w-full h-[100px] mt-4" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (!summary) {
    return (
      <Card>
        <CardContent>
          <Alert>
            <AlertDescription>
              No summary available. Generate a summary to get started.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  const confidencePercentage = summary.confidence
    ? Math.round(summary.confidence * 100)
    : null

  return (
    <Card>
      <CardContent>
        <div className="flex items-center mb-4">
          <div className="flex-1">
            {personaName && (
              <h3 className="text-base font-semibold mb-1">
                {personaName}
              </h3>
            )}
            {personaRole && (
              <p className="text-sm text-muted-foreground mb-1">
                {personaRole}
              </p>
            )}
          </div>
          {confidencePercentage !== null && (
            <Badge variant={confidencePercentage >= 80 ? 'default' : 'outline'}>
              <CheckCircle className="size-3 mr-1" />
              {confidencePercentage}% confidence
            </Badge>
          )}
        </div>

        <p className="text-sm mb-4">
          {Array.isArray(summary.summary)
            ? summary.summary.map(item => item.content).join(' ')
            : summary.summary}
        </p>

        <div className="flex gap-2 flex-wrap mt-4">
          {summary.keyFrames && summary.keyFrames.length > 0 && (
            <Badge variant="outline">
              {summary.keyFrames.length} key frames
            </Badge>
          )}
          {summary.visualAnalysis && (
            <Badge variant="outline">Visual analysis available</Badge>
          )}
          {summary.audioTranscript && (
            <Badge variant="outline">Audio transcript available</Badge>
          )}
        </div>

        {expanded && (
          <div className="mt-4">
            {/* Show tabs if transcript exists, otherwise show summary details directly */}
            {summary.transcriptJson ? (
              <div>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList>
                    <TabsTrigger value="summary">Summary</TabsTrigger>
                    <TabsTrigger value="transcript">Transcript</TabsTrigger>
                  </TabsList>

                  {/* Summary Tab Content */}
                  <TabsContent value="summary">
                    <div className="mt-4">
                      {summary.visualAnalysis && (
                        <div className="mb-4">
                          <p className="text-sm font-medium text-muted-foreground mb-1">
                            Visual Analysis
                          </p>
                          <p className="text-sm">{summary.visualAnalysis}</p>
                        </div>
                      )}

                      {summary.audioTranscript && (
                        <div className="mb-4">
                          <p className="text-sm font-medium text-muted-foreground mb-1">
                            Audio Transcript (Legacy)
                          </p>
                          <p className="text-sm">{summary.audioTranscript}</p>
                        </div>
                      )}

                      {summary.keyFrames && summary.keyFrames.length > 0 && (
                        <div className="mb-4">
                          <p className="text-sm font-medium text-muted-foreground mb-1">
                            Key Frames
                          </p>
                          <p className="text-sm">
                            Frames: {summary.keyFrames.join(', ')}
                          </p>
                        </div>
                      )}

                      {/* Audio Metadata */}
                      {(summary.audioLanguage || summary.speakerCount || summary.audioModelUsed || summary.visualModelUsed || summary.fusionStrategy) && (
                        <div className="mb-4">
                          <p className="text-sm font-medium text-muted-foreground mb-1">
                            Processing Details
                          </p>
                          <div className="flex flex-col gap-1">
                            {summary.audioLanguage && (
                              <p className="text-sm">
                                Language: <strong>{summary.audioLanguage}</strong>
                              </p>
                            )}
                            {summary.speakerCount != null && (
                              <p className="text-sm">
                                Speakers: <strong>{summary.speakerCount}</strong>
                              </p>
                            )}
                            {summary.audioModelUsed && (
                              <p className="text-sm">
                                Audio Model: <strong>{summary.audioModelUsed}</strong>
                              </p>
                            )}
                            {summary.visualModelUsed && (
                              <p className="text-sm">
                                Visual Model: <strong>{summary.visualModelUsed}</strong>
                              </p>
                            )}
                            {summary.fusionStrategy && (
                              <p className="text-sm">
                                Fusion Strategy: <strong>{summary.fusionStrategy}</strong>
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Processing Times */}
                      {(summary.processingTimeAudio != null || summary.processingTimeVisual != null || summary.processingTimeFusion != null) && (
                        <div className="mb-4">
                          <p className="text-sm font-medium text-muted-foreground mb-1">
                            Processing Times
                          </p>
                          <div className="flex flex-col gap-1">
                            {summary.processingTimeAudio != null && (
                              <p className="text-sm">
                                Audio: <strong>{summary.processingTimeAudio.toFixed(2)}s</strong>
                              </p>
                            )}
                            {summary.processingTimeVisual != null && (
                              <p className="text-sm">
                                Visual: <strong>{summary.processingTimeVisual.toFixed(2)}s</strong>
                              </p>
                            )}
                            {summary.processingTimeFusion != null && (
                              <p className="text-sm">
                                Fusion: <strong>{summary.processingTimeFusion.toFixed(2)}s</strong>
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      <Separator className="my-4" />

                      <div>
                        <span className="text-xs text-muted-foreground block">
                          Created: {format(new Date(summary.createdAt), 'PPpp')}
                        </span>
                        {summary.updatedAt !== summary.createdAt && (
                          <span className="text-xs text-muted-foreground block">
                            Updated: {format(new Date(summary.updatedAt), 'PPpp')}
                          </span>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  {/* Transcript Tab Content */}
                  <TabsContent value="transcript">
                    <div className="mt-4">
                      <TranscriptViewer
                        transcript={summary.transcriptJson as TranscriptJson}
                        currentTime={currentTime}
                        onSeek={onSeek || (() => {})}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              /* No transcript - show summary details directly without tabs */
              <div className="mt-4">
                {summary.visualAnalysis && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-muted-foreground mb-1">
                      Visual Analysis
                    </p>
                    <p className="text-sm">{summary.visualAnalysis}</p>
                  </div>
                )}

                {summary.audioTranscript && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-muted-foreground mb-1">
                      Audio Transcript
                    </p>
                    <p className="text-sm">{summary.audioTranscript}</p>
                  </div>
                )}

                {summary.keyFrames && summary.keyFrames.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-muted-foreground mb-1">
                      Key Frames
                    </p>
                    <p className="text-sm">
                      Frames: {summary.keyFrames.join(', ')}
                    </p>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t">
                  <span className="text-xs text-muted-foreground block">
                    Created: {format(new Date(summary.createdAt), 'PPpp')}
                  </span>
                  {summary.updatedAt !== summary.createdAt && (
                    <span className="text-xs text-muted-foreground block">
                      Updated: {format(new Date(summary.updatedAt), 'PPpp')}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {showActions && (
        <CardFooter className="justify-between px-4">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExpandClick}
            >
              {expanded ? 'Show less' : 'Show more'}
              <ChevronDown
                className={cn(
                  'ml-1 size-4 transition-transform duration-300',
                  expanded && 'rotate-180'
                )}
              />
            </Button>
          </div>
          <div className="flex gap-1">
            {onRegenerate && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleRegenerate}
                aria-label="regenerate summary"
                title="Regenerate summary"
              >
                <RefreshCw />
              </Button>
            )}
            {onEdit && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleEdit}
                aria-label="edit summary"
                title="Edit summary"
              >
                <Pencil />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="destructive"
                size="icon-sm"
                onClick={handleDelete}
                aria-label="delete summary"
                title="Delete summary"
              >
                <Trash2 />
              </Button>
            )}
          </div>
        </CardFooter>
      )}
    </Card>
  )
}
