/**
 * Relation-type picker for the span relation builder.
 *
 * Anchors a command palette at the pending relation and lists the persona's
 * relation types, filtered by the source and target spans' kinds the way
 * `ClaimRelationEditor` filters by claim compatibility. Choosing a type commits
 * the relation.
 *
 * @module
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { RelationType } from '@models/ontology'
import type { Rect } from '@/lib/spans'
import { glossToText } from '@/utils/glossUtils'
import { useTourAnchor } from '@/tours/engine/anchorRegistry'
import { useAddRelationTypeToPersona } from '@store/queries'
import { generateId } from '@utils/uuid'

/**
 * Props for {@link RelationTypePicker}.
 */
export interface RelationTypePickerProps {
  /** The persona's relation types. */
  relationTypes: RelationType[]
  /** The relation-source kinds the source span admits (intersection filter). */
  sourceKinds?: string[]
  /** The relation-target kinds the target span admits (intersection filter). */
  targetKinds?: string[]
  /** The active persona, whose ontology receives an inline-created relation type. */
  personaId?: string | null
  /** The box to anchor the picker at (typically the target span's box). */
  bbox?: Rect | null
  /** Called with the chosen relation type. */
  onSelect: (relationType: RelationType) => void
  /** Called when the picker is dismissed without a choice. */
  onCancel: () => void
}

/**
 * Renders the relation-type picker anchored at the pending relation.
 *
 * @param props - the relation types, kind filters, anchor box, and handlers
 * @returns the anchored command palette
 */
export function RelationTypePicker({
  relationTypes,
  sourceKinds,
  targetKinds,
  personaId,
  bbox,
  onSelect,
  onCancel,
}: RelationTypePickerProps): JSX.Element {
  const anchorRef = useTourAnchor('relation-type-picker')
  const [search, setSearch] = useState('')
  const addRelationType = useAddRelationTypeToPersona()

  // The picker opens on the target span's pointer-down; the same click's
  // outside-press would otherwise dismiss it before it paints. Ignore any close
  // for a beat after mount so the picker actually stays up.
  const canDismiss = useRef(false)
  useEffect(() => {
    const timer = setTimeout(() => {
      canDismiss.current = true
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return relationTypes.filter((rt) => {
      const okSource =
        !sourceKinds || sourceKinds.length === 0 || rt.sourceTypes.some((t) => sourceKinds.includes(t))
      const okTarget =
        !targetKinds || targetKinds.length === 0 || rt.targetTypes.some((t) => targetKinds.includes(t))
      const okSearch = !query || rt.name.toLowerCase().includes(query)
      return okSource && okTarget && okSearch
    })
  }, [relationTypes, sourceKinds, targetKinds, search])

  const trimmed = search.trim()
  const hasExactMatch = relationTypes.some((rt) => rt.name.toLowerCase() === trimmed.toLowerCase())
  const canCreate = trimmed.length > 0 && !hasExactMatch && Boolean(personaId)

  const handleCreate = () => {
    if (!personaId || !trimmed) return
    const now = new Date().toISOString()
    const relationType: RelationType = {
      id: generateId(),
      name: trimmed,
      gloss: [],
      sourceTypes: [],
      targetTypes: [],
      symmetric: false,
      createdAt: now,
      updatedAt: now,
    }
    addRelationType.mutate({ personaId, relationType })
    onSelect(relationType)
  }

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
            data-testid="relation-type-anchor"
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
      <PopoverContent align="start" side="bottom" sideOffset={6} className="w-[320px] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or create a relation type..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {filtered.length === 0 && !canCreate && (
              <CommandEmpty>No relation types match this pair.</CommandEmpty>
            )}
            <CommandGroup heading="Relation types">
              {filtered.map((rt) => (
                <CommandItem key={rt.id} value={rt.name} onSelect={() => onSelect(rt)}>
                  <div className="flex flex-col">
                    <span className="text-sm">{rt.name}</span>
                    {rt.gloss && rt.gloss.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {glossToText(rt.gloss).slice(0, 64)}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
              {canCreate && (
                <CommandItem value={`create-relation-${trimmed}`} onSelect={handleCreate}>
                  <span className="text-sm text-primary">
                    Create relation type &ldquo;{trimmed}&rdquo;
                  </span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
