import { useMemo } from 'react'

import { cn } from '@/lib/utils'
import { ClaimSpan } from '@models/types'

interface ClaimSpanHighlighterProps {
  text: string
  highlightedSpans: ClaimSpan[]
  selectedClaimId?: string | null
}

export function ClaimSpanHighlighter({
  text,
  highlightedSpans,
  selectedClaimId: _selectedClaimId
}: ClaimSpanHighlighterProps) {
  // Split text into segments with highlighted regions
  const segments = useMemo(() => {
    if (!highlightedSpans || highlightedSpans.length === 0) {
      return [{ text, highlighted: false }]
    }

    const sorted = [...highlightedSpans].sort((a, b) => a.charStart - b.charStart)
    const segments = []
    let lastEnd = 0

    for (const span of sorted) {
      // Add non-highlighted text before span
      if (span.charStart > lastEnd) {
        segments.push({
          text: text.slice(lastEnd, span.charStart),
          highlighted: false
        })
      }

      // Add highlighted span
      segments.push({
        text: text.slice(span.charStart, span.charEnd),
        highlighted: true
      })

      lastEnd = span.charEnd
    }

    // Add remaining text
    if (lastEnd < text.length) {
      segments.push({
        text: text.slice(lastEnd),
        highlighted: false
      })
    }

    return segments
  }, [text, highlightedSpans])

  return (
    <div data-tour-id="claim-span-highlighter">
      {segments.map((segment, idx) => (
        <span
          key={idx}
          className={cn(
            'transition-all duration-200',
            segment.highlighted
              ? 'bg-primary/20 text-primary px-1 py-0.5 rounded'
              : 'bg-transparent text-inherit'
          )}
        >
          {segment.text}
        </span>
      ))}
    </div>
  )
}
