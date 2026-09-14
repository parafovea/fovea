/**
 * Hosts the span annotator over a video's projected text expressions.
 *
 * Materializes a video's text expressions (its metadata text and ASR
 * transcript) and lets the annotator work over whichever the user selects, so
 * token spans and relations can be drawn on a video's associated text without
 * leaving the annotation workspace.
 *
 * @module
 */

import { useEffect, useState } from 'react'

import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useVideoTextExpressions } from '@store/queries'
import type { LayersExpressionWithTokens } from '@store/queries'
import { useTourAnchor } from '@/tours/engine/anchorRegistry'

import { DocumentEditor } from './DocumentEditor'

/**
 * Props for {@link VideoTextPanel}.
 */
export interface VideoTextPanelProps {
  /** The source video id whose text expressions to annotate. */
  videoId: string
  /** The active persona, scoping layers and backing type labels. */
  personaId?: string | null
  /**
   * Forces the annotator read-only (`true`) or editable (`false`). When omitted,
   * editability defaults to the CASL ability on each expression's spans.
   */
  readOnly?: boolean
}

/** A friendly tab label for a projected text expression. */
function expressionLabel(expression: LayersExpressionWithTokens): string {
  const kind = expression.sourceKind || expression.kind
  if (kind.includes('transcript') || kind.includes('asr')) return 'Transcript'
  if (kind.includes('meta') || kind.includes('text') || kind.includes('tweet')) return 'Post text'
  return kind || 'Text'
}

/**
 * Renders the video-associated-text span annotator.
 *
 * @param props - the video id, active persona, and read-only override
 * @returns the panel element
 */
export function VideoTextPanel({ videoId, personaId, readOnly }: VideoTextPanelProps): JSX.Element {
  const { data: expressions = [], isLoading, isError } = useVideoTextExpressions(videoId)
  const [activeId, setActiveId] = useState<string | null>(null)
  const panelAnchorRef = useTourAnchor('video-text-panel')

  useEffect(() => {
    if (expressions.length === 0) return
    const isValid = expressions.some((expression) => expression.id === activeId)
    if (!isValid) setActiveId(expressions[0].id)
  }, [activeId, expressions])

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load this video's text.</AlertDescription>
      </Alert>
    )
  }

  if (expressions.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          This video has no associated text (post text or transcript) to annotate.
        </AlertDescription>
      </Alert>
    )
  }

  const active = activeId ?? expressions[0].id

  return (
    <div ref={panelAnchorRef}>
      <Tabs value={active} onValueChange={setActiveId} className="w-full">
        <TabsList>
          {expressions.map((expression) => (
            <TabsTrigger key={expression.id} value={expression.id}>
              {expressionLabel(expression)}
            </TabsTrigger>
          ))}
        </TabsList>
        {expressions.map((expression) => (
          <TabsContent key={expression.id} value={expression.id} className="pt-3">
            <DocumentEditor expressionUri={expression.id} personaId={personaId} readOnly={readOnly} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
