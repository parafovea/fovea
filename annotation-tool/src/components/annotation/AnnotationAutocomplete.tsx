import React, { useState } from 'react'
import { Tag, GitBranch, CalendarDays, User, MapPin, Folder, Search, Plus, Globe, ArrowLeft, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { usePersonaOntology, useWorld, useAddEntityToPersona, useAddEntity } from '@store/queries'
import { useAnnotationUiStore } from '@store/zustand'
import { generateId } from '@utils/uuid'
import type { EntityType } from '@models/ontology'
import WikidataSearch, { type WikidataImportCallbackData } from '@components/shared/WikidataSearch'
import { useWikidataImport } from '@hooks/wikidata'

type OptionKind =
  | 'entity'
  | 'role'
  | 'event'
  | 'entity-object'
  | 'event-object'
  | 'location-object'
  | 'time-object'
  | 'collection'

/** The world-object kinds a Wikidata import can be filed under. */
type WorldObjectKind = 'entity' | 'location' | 'event' | 'time'

interface AnnotationOption {
  id: string
  label: string
  category: string
  type: OptionKind
  icon: React.ReactNode
}

/** The kinds that denote an ontology type rather than a world object. */
const TYPE_KINDS: OptionKind[] = ['entity', 'role', 'event']

/** Whether an option denotes an ontology type (vs a world object). */
function isTypeOption(kind: OptionKind): boolean {
  return TYPE_KINDS.includes(kind)
}

interface AnnotationAutocompleteProps {
  /**
   * Which denotations to offer: ontology types, world objects, or `'both'` in a
   * single unified list (the span label picker uses `'both'` so the user types
   * once and picks either).
   */
  mode: 'type' | 'object' | 'both'
  personaId?: string | null
  onSelect: (option: AnnotationOption | null) => void
  disabled?: boolean
  /**
   * Whether selecting an object writes the link target into the annotation UI
   * store. Defaults to `true`, preserving the video-annotation behavior. Set to
   * `false` when reusing the picker on a surface (such as the document span
   * annotator) that must not mutate video-annotation state.
   */
  emitLinkTarget?: boolean
  /** When `true`, opens the search dropdown immediately so the user can type at once. */
  autoOpen?: boolean
  /**
   * When `true`, renders the search input and results directly (no trigger
   * button or nested popover), autofocused, so the user types the moment the
   * host surface opens. Use inside another popover (the span label picker).
   */
  inline?: boolean
}

export default function AnnotationAutocomplete({
  mode,
  personaId,
  onSelect,
  disabled = false,
  emitLinkTarget = true,
  autoOpen = false,
  inline = false,
}: AnnotationAutocompleteProps) {
  const [value, setValue] = useState<AnnotationOption | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [open, setOpen] = useState(autoOpen)
  // When set, the picker shows a Wikidata search (seeded with the query) whose
  // import creates a linked ontology type or world object and assigns it. `null`
  // hides it.
  const [wikidataTarget, setWikidataTarget] = useState<{ query: string; kind: 'type' | 'object' } | null>(null)
  // Which world-object kind a Wikidata object import files under (entity /
  // location / event / time), chosen in the Wikidata sub-view.
  const [wikidataObjectKind, setWikidataObjectKind] = useState<WorldObjectKind>('entity')

  // Zustand for link target state
  const setLinkTarget = useAnnotationUiStore((state) => state.setLinkTarget)

  // Inline creation of a new ontology type or world object (name only), so a
  // fresh workspace with no types/objects is not a dead end. The quick-created
  // item is fully editable afterward in the persona or world builder.
  const addEntityType = useAddEntityToPersona()
  const addWorldEntity = useAddEntity()
  // Wikidata-backed creation: importing a picked Wikidata item mints a linked
  // world object (or ontology entity type) and returns its new id so it can be
  // assigned like any other. All hooks are declared unconditionally; which one
  // runs is chosen by the Wikidata sub-view's kind (ontology type vs the four
  // world-object kinds).
  const { importItem: importWikidataType } = useWikidataImport('entity-type', personaId ?? undefined)
  const { importItem: importWikidataEntity } = useWikidataImport('entity', personaId ?? undefined)
  const { importItem: importWikidataLocation } = useWikidataImport('location', personaId ?? undefined)
  const { importItem: importWikidataEvent } = useWikidataImport('event', personaId ?? undefined)
  const { importItem: importWikidataTime } = useWikidataImport('time', personaId ?? undefined)

  // Per-world-object-kind Wikidata wiring: the importItem to call, the
  // WikidataSearch filters, and how the imported result renders as a chosen
  // option. Keyed by WorldObjectKind so the sub-view's kind selector drives it.
  const wikidataObjectKinds: Record<
    WorldObjectKind,
    {
      label: string
      entityType: 'object' | 'time'
      objectSubtype?: 'entity' | 'event' | 'location'
      importType: 'entity' | 'event' | 'location' | 'time'
      importItem: (data: WikidataImportCallbackData) => Promise<string>
      category: string
      optionType: OptionKind
      icon: React.ReactNode
    }
  > = {
    entity: {
      label: 'Entity',
      entityType: 'object',
      objectSubtype: 'entity',
      importType: 'entity',
      importItem: importWikidataEntity,
      category: 'Entities',
      optionType: 'entity-object',
      icon: <User className="size-4" />,
    },
    location: {
      label: 'Location',
      entityType: 'object',
      objectSubtype: 'location',
      importType: 'location',
      importItem: importWikidataLocation,
      category: 'Locations',
      optionType: 'location-object',
      icon: <MapPin className="size-4" />,
    },
    event: {
      label: 'Event',
      entityType: 'object',
      objectSubtype: 'event',
      importType: 'event',
      importItem: importWikidataEvent,
      category: 'Events',
      optionType: 'event-object',
      icon: <CalendarDays className="size-4" />,
    },
    time: {
      label: 'Time',
      entityType: 'time',
      importType: 'time',
      importItem: importWikidataTime,
      category: 'Times',
      optionType: 'time-object',
      icon: <Clock className="size-4" />,
    },
  }

  // TanStack Query for persona ontology (type mode)
  const { data: personaOntology } = usePersonaOntology(personaId)

  // TanStack Query for world objects (object mode)
  const { data: worldData } = useWorld()
  const entities = React.useMemo(() => worldData?.entities ?? [], [worldData?.entities])
  const events = React.useMemo(() => worldData?.events ?? [], [worldData?.events])
  const entityCollections = React.useMemo(() => worldData?.entityCollections ?? [], [worldData?.entityCollections])
  const eventCollections = React.useMemo(() => worldData?.eventCollections ?? [], [worldData?.eventCollections])

  const wantsTypes = mode === 'type' || mode === 'both'
  const wantsObjects = mode === 'object' || mode === 'both'

  // Build options for the requested mode(s)
  const options: AnnotationOption[] = React.useMemo(() => {
    const opts: AnnotationOption[] = []

    if (wantsTypes && personaOntology) {
      personaOntology.entities.forEach((e) => {
        opts.push({ id: e.id, label: e.name, category: 'Entity Types', type: 'entity', icon: <Tag className="size-4" /> })
      })
      personaOntology.roles.forEach((r) => {
        opts.push({ id: r.id, label: r.name, category: 'Role Types', type: 'role', icon: <GitBranch className="size-4" /> })
      })
      personaOntology.events.forEach((e) => {
        opts.push({ id: e.id, label: e.name, category: 'Event Types', type: 'event', icon: <CalendarDays className="size-4" /> })
      })
    }

    if (wantsObjects) {
      entities.filter((e) => !('locationType' in e)).forEach((e) => {
        opts.push({ id: e.id, label: e.name, category: 'Entities', type: 'entity-object', icon: <User className="size-4" /> })
      })
      entities.filter((e) => 'locationType' in e).forEach((l) => {
        opts.push({ id: l.id, label: l.name, category: 'Locations', type: 'location-object', icon: <MapPin className="size-4" /> })
      })
      events.forEach((e) => {
        opts.push({ id: e.id, label: e.name, category: 'Events', type: 'event-object', icon: <CalendarDays className="size-4" /> })
      })
      entityCollections.forEach((c) => {
        opts.push({ id: c.id, label: c.name, category: 'Entity Collections', type: 'collection', icon: <Folder className="size-4" /> })
      })
      eventCollections.forEach((c) => {
        opts.push({ id: c.id, label: c.name, category: 'Event Collections', type: 'collection', icon: <Folder className="size-4" /> })
      })
    }

    return opts
  }, [wantsTypes, wantsObjects, personaOntology, entities, events, entityCollections, eventCollections])

  // Group options by category
  const groupedOptions = React.useMemo(() => {
    const grouped: Record<string, AnnotationOption[]> = {}
    options.forEach((opt) => {
      if (!grouped[opt.category]) grouped[opt.category] = []
      grouped[opt.category].push(opt)
    })
    return grouped
  }, [options])

  // Filter options by search input
  const filteredGrouped = React.useMemo(() => {
    if (!inputValue) return groupedOptions
    const lowerInput = inputValue.toLowerCase()
    const result: Record<string, AnnotationOption[]> = {}
    for (const [category, opts] of Object.entries(groupedOptions)) {
      const filtered = opts.filter((o) => o.label.toLowerCase().includes(lowerInput))
      if (filtered.length > 0) result[category] = filtered
    }
    return result
  }, [groupedOptions, inputValue])

  const handleSelect = (option: AnnotationOption) => {
    setValue(option)
    onSelect(option)
    setOpen(false)
    setInputValue('')

    // Update Zustand link-target state when an object is chosen. Surfaces that
    // own their own persistence (emitLinkTarget=false) skip this write so they
    // never mutate the video-annotation link state.
    if (!isTypeOption(option.type) && emitLinkTarget) {
      let targetType: 'entity' | 'event' | 'location' | 'entity-collection' | 'event-collection' | null = null
      if (option.type === 'entity-object') targetType = 'entity'
      else if (option.type === 'event-object') targetType = 'event'
      else if (option.type === 'location-object') targetType = 'location'
      else if (option.type === 'collection') {
        const isEntityCollection = entityCollections.some((c) => c.id === option.id)
        targetType = isEntityCollection ? 'entity-collection' : 'event-collection'
      }
      setLinkTarget(option.id, targetType)
    }
  }

  // Offer quick-create when the query names nothing that already exists. A type
  // needs an active persona; a world object can always be minted. The created
  // item is selected immediately (so it lands on the span) and stays editable in
  // its workspace. The create awaits the write so the id exists before a span
  // annotation references it.
  const trimmed = inputValue.trim()
  const lower = trimmed.toLowerCase()
  const hasTypeMatch = options.some((o) => isTypeOption(o.type) && o.label.toLowerCase() === lower)
  const hasObjectMatch = options.some((o) => !isTypeOption(o.type) && o.label.toLowerCase() === lower)
  const canCreateType = wantsTypes && trimmed.length > 0 && !hasTypeMatch && Boolean(personaId)
  const canCreateObject = wantsObjects && trimmed.length > 0 && !hasObjectMatch

  const handleCreateType = async () => {
    if (!personaId || !trimmed) return
    const id = generateId()
    const now = new Date().toISOString()
    const entity: EntityType = { id, name: trimmed, gloss: [], createdAt: now, updatedAt: now }
    await addEntityType.mutateAsync({ personaId, entity })
    handleSelect({ id, label: trimmed, category: 'Entity Types', type: 'entity', icon: <Tag className="size-4" /> })
  }

  const handleCreateObject = async () => {
    if (!trimmed) return
    const id = generateId()
    await addWorldEntity.mutateAsync({ id, name: trimmed, description: [], typeAssignments: [], metadata: {} })
    handleSelect({ id, label: trimmed, category: 'Entities', type: 'entity-object', icon: <User className="size-4" /> })
  }

  const handleWikidataImport = async (data: WikidataImportCallbackData) => {
    const kind = wikidataTarget?.kind ?? 'object'
    if (kind === 'type') {
      const id = await importWikidataType(data)
      setWikidataTarget(null)
      handleSelect({ id, label: data.name, category: 'Entity Types', type: 'entity', icon: <Tag className="size-4" /> })
      return
    }
    const cfg = wikidataObjectKinds[wikidataObjectKind]
    const id = await cfg.importItem(data)
    setWikidataTarget(null)
    handleSelect({ id, label: data.name, category: cfg.category, type: cfg.optionType, icon: cfg.icon })
  }

  // Generate label with counts for the trigger button (non-inline)
  const getTypeLabel = () => {
    if (mode === 'type' && personaOntology && !value) {
      const entityCount = personaOntology.entities.length
      const roleCount = personaOntology.roles.length
      const eventCount = personaOntology.events.length
      return `Select Type (${entityCount} entities, ${roleCount} roles, ${eventCount} events)`
    }
    if (mode === 'both') return 'Search types and world objects'
    return mode === 'type' ? 'Select Type' : 'Select Object'
  }

  const isDisabled = disabled || (mode === 'type' && !personaId)
  const placeholder =
    mode === 'type' && !personaId
      ? 'Please select a persona first'
      : mode === 'both'
        ? 'Search or create a type or world object...'
        : mode === 'type'
          ? 'Search for entity, role, or event type...'
          : 'Search for world object...'

  const body = (
    <>
      <div className="p-2">
        <div className="flex items-center gap-2 px-2 pb-2 border-b">
          <Search className="size-4 text-muted-foreground" />
          <input
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder={placeholder}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            autoFocus
          />
        </div>
      </div>
      <div className="max-h-[300px] overflow-y-auto p-1">
        {Object.entries(filteredGrouped).map(([category, opts]) => (
          <div key={category}>
            <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50">
              {category} ({opts.length})
            </div>
            {opts.map((option) => (
              <button
                key={option.id}
                className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                onClick={() => handleSelect(option)}
              >
                {option.icon}
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        ))}
        {Object.keys(filteredGrouped).length === 0 && !canCreateType && !canCreateObject && (
          <p className="text-sm text-muted-foreground text-center py-4">No results found</p>
        )}
        {canCreateType && (
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-primary hover:bg-accent hover:text-accent-foreground cursor-pointer"
            onClick={handleCreateType}
          >
            <Plus className="size-4 shrink-0" />
            <span className="truncate">
              Create type &ldquo;{trimmed}&rdquo;
            </span>
          </button>
        )}
        {canCreateType && (
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-primary hover:bg-accent hover:text-accent-foreground cursor-pointer"
            onClick={() => setWikidataTarget({ query: trimmed, kind: 'type' })}
          >
            <Globe className="size-4 shrink-0" />
            <span className="truncate">
              Search Wikidata for type &ldquo;{trimmed}&rdquo;
            </span>
          </button>
        )}
        {canCreateObject && (
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-primary hover:bg-accent hover:text-accent-foreground cursor-pointer"
            onClick={handleCreateObject}
          >
            <Plus className="size-4 shrink-0" />
            <span className="truncate">
              Create world object &ldquo;{trimmed}&rdquo;
            </span>
          </button>
        )}
        {canCreateObject && (
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-primary hover:bg-accent hover:text-accent-foreground cursor-pointer"
            onClick={() => setWikidataTarget({ query: trimmed, kind: 'object' })}
          >
            <Globe className="size-4 shrink-0" />
            <span className="truncate">
              Search Wikidata for object &ldquo;{trimmed}&rdquo;
            </span>
          </button>
        )}
      </div>
    </>
  )

  // The Wikidata search sub-view: picking a result imports the linked ontology
  // type or world object and assigns it. A back control returns to the list.
  const wikidataView = wikidataTarget && (
    <div className="p-2">
      <button
        className="mb-2 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        onClick={() => setWikidataTarget(null)}
      >
        <ArrowLeft className="size-4" />
        Back to types and objects
      </button>
      {wikidataTarget.kind === 'object' && (
        <div className="mb-2 flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">Import as:</span>
          {(Object.keys(wikidataObjectKinds) as WorldObjectKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setWikidataObjectKind(k)}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                wikidataObjectKind === k
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground hover:bg-accent'
              }`}
            >
              {wikidataObjectKinds[k].icon}
              {wikidataObjectKinds[k].label}
            </button>
          ))}
        </div>
      )}
      <WikidataSearch
        initialQuery={wikidataTarget.query}
        entityType={
          wikidataTarget.kind === 'type' ? 'type' : wikidataObjectKinds[wikidataObjectKind].entityType
        }
        objectSubtype={
          wikidataTarget.kind === 'object' ? wikidataObjectKinds[wikidataObjectKind].objectSubtype : undefined
        }
        importType={
          wikidataTarget.kind === 'type' ? 'entity-type' : wikidataObjectKinds[wikidataObjectKind].importType
        }
        onImport={handleWikidataImport}
      />
    </div>
  )

  const content = wikidataTarget !== null ? wikidataView : body

  // Inline: render the search and results directly (no trigger), so the user
  // types the instant the host popup opens.
  if (inline) {
    return <div className="rounded-md border bg-popover text-popover-foreground">{content}</div>
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={getTypeLabel()}
            disabled={isDisabled}
            className="w-full justify-start text-left font-normal"
          />
        }
      >
        {value ? (
          <span className="flex items-center gap-2">
            {value.icon}
            {value.label}
          </span>
        ) : (
          <span className="text-muted-foreground">{getTypeLabel()}</span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        {content}
      </PopoverContent>
    </Popover>
  )
}
