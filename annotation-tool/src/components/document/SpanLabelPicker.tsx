/**
 * Label picker for a committed token selection.
 *
 * Anchors a popover at the selection's bounding box and renders the shared
 * `AnnotationAutocomplete` inline in unified `'both'` mode, so typing surfaces
 * the persona's ontology types and the world's objects in one list. The chosen
 * option's kind decides the write: a type writes an ontology-type-referencing
 * span, an object a world-node-referencing span. The picker reuses the
 * autocomplete with `emitLinkTarget={false}` so it never mutates the
 * video-annotation link state.
 *
 * @module
 */

import { useEffect, useRef } from 'react'

import AnnotationAutocomplete from '@components/annotation/AnnotationAutocomplete'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTourAnchor } from '@/tours/engine/anchorRegistry'

import type { PendingLabelSpanDraft } from '@store/zustand/createSpanAnnotatorStore'

/** The label-picker mode: assign an ontology type or link a world object. */
export type SpanLabelMode = 'type' | 'object'

/** The option kinds that denote an ontology type rather than a world object. */
const TYPE_OPTION_KINDS = ['entity', 'role', 'event']

/** The structural shape of a chosen option from the autocomplete. */
export interface SpanLabelOption {
  /** The option's id (ontology type ref id or world node id). */
  id: string
  /** The option's display label. */
  label: string
  /** The option's ontology/world category label. */
  category: string
  /** The option's kind slug. */
  type: string
}

/**
 * Props for {@link SpanLabelPicker}.
 */
export interface SpanLabelPickerProps {
  /** The committed selection awaiting a label. */
  draft: PendingLabelSpanDraft
  /** The active persona, whose ontology backs type mode. */
  personaId?: string | null
  /** Called with the chosen mode and option. */
  onSelect: (mode: SpanLabelMode, option: SpanLabelOption) => void
  /** Called when the picker is dismissed without a choice. */
  onCancel: () => void
  /**
   * The highlighted span's concatenated text, seeded into the search box so the
   * ranked list surfaces the closest existing types/objects and a quick-create
   * is pre-named after the span.
   */
  initialQuery?: string
}

/**
 * Renders the span label picker anchored at the selection box.
 *
 * @param props - the draft selection, persona, and selection handlers
 * @returns the anchored popover element
 */
export function SpanLabelPicker({
  draft,
  personaId,
  onSelect,
  onCancel,
  initialQuery,
}: SpanLabelPickerProps): JSX.Element {
  const anchorRef = useTourAnchor('span-label-picker')
  const bbox = draft.bbox

  // When opened by a click (the edit-label control), the same click's
  // outside-press would dismiss the picker before it paints. Ignore any close
  // for a beat after mount so it stays up.
  const canDismiss = useRef(false)
  useEffect(() => {
    const timer = setTimeout(() => {
      canDismiss.current = true
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open && canDismiss.current) onCancel()
      }}
    >
      <PopoverTrigger
        render={
          <span
            ref={anchorRef}
            aria-hidden
            data-testid="span-label-anchor"
            style={{
              position: 'absolute',
              left: bbox?.x ?? 0,
              top: bbox?.y ?? 0,
              width: Math.max(1, bbox?.width ?? 1),
              height: Math.max(1, bbox?.height ?? 1),
              pointerEvents: 'none',
            }}
          />
        }
      />
      <PopoverContent align="start" side="bottom" sideOffset={6} className="w-[420px] gap-2">
        <span className="text-sm font-medium">Label span</span>
        {/* One unified search: typing surfaces the persona's types and the
            world's objects together, so the user picks either without a mode
            toggle. The chosen option's kind decides how it is written. */}
        <AnnotationAutocomplete
          mode="both"
          personaId={personaId}
          emitLinkTarget={false}
          inline
          initialQuery={initialQuery}
          onSelect={(option) => {
            if (!option) return
            const mode: SpanLabelMode = TYPE_OPTION_KINDS.includes(option.type) ? 'type' : 'object'
            onSelect(mode, option)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
