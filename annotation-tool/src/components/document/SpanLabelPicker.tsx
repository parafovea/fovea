/**
 * Label picker for a committed token selection.
 *
 * Anchors a popover at the selection's bounding box and offers a type/object
 * mode toggle plus the shared `AnnotationAutocomplete`. Choosing a type writes
 * an ontology-type-referencing span; choosing an object writes a
 * world-node-referencing span. The picker reuses the autocomplete with
 * `emitLinkTarget={false}` so it never mutates the video-annotation link state.
 *
 * @module
 */

import { useState } from 'react'

import AnnotationAutocomplete from '@components/annotation/AnnotationAutocomplete'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useTourAnchor } from '@/tours/engine/anchorRegistry'

import type { PendingLabelSpanDraft } from '@store/zustand/createSpanAnnotatorStore'

/** The label-picker mode: assign an ontology type or link a world object. */
export type SpanLabelMode = 'type' | 'object'

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
}: SpanLabelPickerProps): JSX.Element {
  const [mode, setMode] = useState<SpanLabelMode>('type')
  const anchorRef = useTourAnchor('span-label-picker')
  const bbox = draft.bbox

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
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
      <PopoverContent align="start" side="bottom" sideOffset={6} className="w-[420px] gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Label span</span>
          <ToggleGroup
            value={[mode]}
            onValueChange={(value) => {
              const next = value[value.length - 1]
              if (next === 'type' || next === 'object') setMode(next)
            }}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="type">Type</ToggleGroupItem>
            <ToggleGroupItem value="object">Object</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <AnnotationAutocomplete
          mode={mode}
          personaId={personaId}
          emitLinkTarget={false}
          onSelect={(option) => {
            if (option) onSelect(mode, option)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
