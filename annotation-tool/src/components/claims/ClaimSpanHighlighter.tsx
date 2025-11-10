import { useMemo } from 'react'
import { Box, Typography } from '@mui/material'
import { ClaimSpan } from '../../models/types'

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
    <Box>
      {segments.map((segment, idx) => (
        <Typography
          key={idx}
          component="span"
          sx={{
            backgroundColor: segment.highlighted ? 'primary.light' : 'transparent',
            color: segment.highlighted ? 'primary.contrastText' : 'inherit',
            padding: segment.highlighted ? '2px 4px' : 0,
            borderRadius: segment.highlighted ? 1 : 0,
            transition: 'all 0.2s',
          }}
        >
          {segment.text}
        </Typography>
      ))}
    </Box>
  )
}
