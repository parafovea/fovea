import React, { useState } from 'react'
import { Tag, GitBranch, CalendarDays, User, MapPin, Folder, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { usePersonaOntology, useWorld } from '@store/queries'
import { useAnnotationUiStore } from '@store/zustand'

interface AnnotationOption {
  id: string
  label: string
  category: string
  type: 'entity' | 'role' | 'event' | 'entity-object' | 'event-object' | 'location-object' | 'collection'
  icon: React.ReactNode
}

interface AnnotationAutocompleteProps {
  mode: 'type' | 'object'
  personaId?: string | null
  onSelect: (option: AnnotationOption | null) => void
  disabled?: boolean
}

export default function AnnotationAutocomplete({
  mode,
  personaId,
  onSelect,
  disabled = false
}: AnnotationAutocompleteProps) {
  const [value, setValue] = useState<AnnotationOption | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [open, setOpen] = useState(false)

  // Zustand for link target state
  const setLinkTarget = useAnnotationUiStore((state) => state.setLinkTarget)

  // TanStack Query for persona ontology (type mode)
  const { data: personaOntology } = usePersonaOntology(personaId)

  // TanStack Query for world objects (object mode)
  const { data: worldData } = useWorld()
  const entities = React.useMemo(() => worldData?.entities ?? [], [worldData?.entities])
  const events = React.useMemo(() => worldData?.events ?? [], [worldData?.events])
  const entityCollections = React.useMemo(() => worldData?.entityCollections ?? [], [worldData?.entityCollections])
  const eventCollections = React.useMemo(() => worldData?.eventCollections ?? [], [worldData?.eventCollections])

  // Build options based on mode
  const options: AnnotationOption[] = React.useMemo(() => {
    const opts: AnnotationOption[] = []

    if (mode === 'type' && personaOntology) {
      // Add entity types
      personaOntology.entities.forEach(e => {
        opts.push({
          id: e.id,
          label: e.name,
          category: 'Entity Types',
          type: 'entity',
          icon: <Tag className="size-4" />
        })
      })

      // Add role types
      personaOntology.roles.forEach(r => {
        opts.push({
          id: r.id,
          label: r.name,
          category: 'Role Types',
          type: 'role',
          icon: <GitBranch className="size-4" />
        })
      })

      // Add event types
      personaOntology.events.forEach(e => {
        opts.push({
          id: e.id,
          label: e.name,
          category: 'Event Types',
          type: 'event',
          icon: <CalendarDays className="size-4" />
        })
      })
    } else if (mode === 'object') {
      // Add entity objects (excluding locations)
      entities.filter(e => !('locationType' in e)).forEach(e => {
        opts.push({
          id: e.id,
          label: e.name,
          category: 'Entities',
          type: 'entity-object',
          icon: <User className="size-4" />
        })
      })

      // Add location objects
      entities.filter(e => 'locationType' in e).forEach(l => {
        opts.push({
          id: l.id,
          label: l.name,
          category: 'Locations',
          type: 'location-object',
          icon: <MapPin className="size-4" />
        })
      })

      // Add event objects
      events.forEach(e => {
        opts.push({
          id: e.id,
          label: e.name,
          category: 'Events',
          type: 'event-object',
          icon: <CalendarDays className="size-4" />
        })
      })

      // Add entity collections
      entityCollections.forEach(c => {
        opts.push({
          id: c.id,
          label: c.name,
          category: 'Entity Collections',
          type: 'collection',
          icon: <Folder className="size-4" />
        })
      })

      // Add event collections
      eventCollections.forEach(c => {
        opts.push({
          id: c.id,
          label: c.name,
          category: 'Event Collections',
          type: 'collection',
          icon: <Folder className="size-4" />
        })
      })
    }

    return opts
  }, [mode, personaOntology, entities, events, entityCollections, eventCollections])

  // Group options by category
  const groupedOptions = React.useMemo(() => {
    const grouped: Record<string, AnnotationOption[]> = {}
    options.forEach(opt => {
      if (!grouped[opt.category]) {
        grouped[opt.category] = []
      }
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
      const filtered = opts.filter(o => o.label.toLowerCase().includes(lowerInput))
      if (filtered.length > 0) {
        result[category] = filtered
      }
    }
    return result
  }, [groupedOptions, inputValue])

  const handleSelect = (option: AnnotationOption) => {
    setValue(option)
    onSelect(option)
    setOpen(false)
    setInputValue('')

    // Update Zustand state for link target if in object mode
    if (mode === 'object') {
      let targetType: 'entity' | 'event' | 'location' | 'entity-collection' | 'event-collection' | null = null
      if (option.type === 'entity-object') targetType = 'entity'
      else if (option.type === 'event-object') targetType = 'event'
      else if (option.type === 'location-object') targetType = 'location'
      else if (option.type === 'collection') {
        // Determine if it's entity or event collection
        const isEntityCollection = entityCollections.some(c => c.id === option.id)
        targetType = isEntityCollection ? 'entity-collection' : 'event-collection'
      }

      setLinkTarget(option.id, targetType)
    }
  }

  // Generate label with counts for type mode
  const getTypeLabel = () => {
    if (mode === 'type' && personaOntology && !value) {
      const entityCount = personaOntology.entities.length
      const roleCount = personaOntology.roles.length
      const eventCount = personaOntology.events.length
      return `Select Type (${entityCount} entities, ${roleCount} roles, ${eventCount} events)`
    }
    return mode === 'type' ? 'Select Type' : 'Select Object'
  }

  const isDisabled = disabled || (mode === 'type' && !personaId)
  const placeholder = mode === 'type' && !personaId
    ? 'Please select a persona first'
    : mode === 'type'
      ? 'Search for entity, role, or event type...'
      : 'Search for world object...'

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
          {Object.keys(filteredGrouped).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No results found
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
