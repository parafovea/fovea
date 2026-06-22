/**
 * Inline text that truncates past a character threshold and toggles between
 * a collapsed preview and the full text via a "Show more"/"Show less" control.
 *
 * @module
 */

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Props for {@link ExpandableText}.
 */
export interface ExpandableTextProps {
  /** The full text to display. */
  text: string
  /** Maximum number of characters to show when collapsed. */
  collapsedChars?: number
  /** Additional class names applied to the wrapping paragraph. */
  className?: string
}

/**
 * Renders text with a "Show more"/"Show less" toggle when it exceeds
 * `collapsedChars`. Text shorter than the threshold renders as-is with no
 * toggle.
 *
 * @param props - the text, optional collapse threshold, and optional class name
 * @returns a paragraph that expands and collapses long text
 *
 * @example
 * ```typescript
 * <ExpandableText text={persona.informationNeed} collapsedChars={100} />
 * ```
 */
export function ExpandableText({
  text,
  collapsedChars = 100,
  className,
}: ExpandableTextProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)

  const needsToggle = text.length > collapsedChars
  const displayText = needsToggle && !expanded
    ? `${text.substring(0, collapsedChars)}...`
    : text

  return (
    <p className={cn('whitespace-pre-wrap break-words', className)}>
      {displayText}
      {needsToggle && (
        <Button
          variant="link"
          size="xs"
          className="ml-1 h-auto p-0 align-baseline"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      )}
    </p>
  )
}
