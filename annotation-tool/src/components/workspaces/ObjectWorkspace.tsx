import { useState, useRef, useEffect } from 'react'
import { useCommands, useCommandContext } from '@hooks/commands'
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  User,
  CalendarDays,
  MapPin,
  Clock,
  Globe,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import {
  useWorld,
  useAddEntity,
  useAddEvent,
  useAddTime,
  useAddEntityCollection,
  useAddEventCollection,
  useDeleteEntity,
  useDeleteEvent,
  useDeleteTime,
  useDeleteEntityCollection,
  useDeleteEventCollection,
} from '@store/queries'
import { Entity, Event, Time, TimeInstant, TimeInterval, LocationPoint, LocationExtent, EntityCollection, EventCollection, GlossItem } from '@models/types'
import { buildDuplicatePayload } from './duplicateWorldObject'
import EntityEditor from '../world/EntityEditor'
import EventEditor from '../world/EventEditor'
import LocationEditor from '../world/LocationEditor'
import TimeEditor from '../world/TimeEditor'
import CollectionEditor from '../world/CollectionEditor'
import { WikidataChip } from '../shared/WikidataChip'

// Union type for all workspace items
type WorkspaceItem = Entity | Event | Time | EntityCollection | EventCollection

// Type guard to check if an Entity is a Location
function isLocation(entity: Entity): entity is LocationPoint | LocationExtent {
  return 'locationType' in entity
}

export default function ObjectWorkspace() {
  // World data from TanStack Query
  const { data: worldData } = useWorld()
  const entities = worldData?.entities ?? []
  const events = worldData?.events ?? []
  const times = worldData?.times ?? []
  const entityCollections = worldData?.entityCollections ?? []
  const eventCollections = worldData?.eventCollections ?? []

  // Mutation hooks
  const { mutate: addEntityMutate } = useAddEntity()
  const { mutate: addEventMutate } = useAddEvent()
  const { mutate: addTimeMutate } = useAddTime()
  const { mutate: addEntityCollectionMutate } = useAddEntityCollection()
  const { mutate: addEventCollectionMutate } = useAddEventCollection()
  const { mutate: deleteEntityMutate } = useDeleteEntity()
  const { mutate: deleteEventMutate } = useDeleteEvent()
  const { mutate: deleteTimeMutate } = useDeleteTime()
  const { mutate: deleteEntityCollectionMutate } = useDeleteEntityCollection()
  const { mutate: deleteEventCollectionMutate } = useDeleteEventCollection()

  const locations = entities.filter(isLocation) // Locations are specialized entities

  const [tabValue, setTabValue] = useState('entities')
  const [searchTerm, setSearchTerm] = useState('')
  const [wikidataFilter, setWikidataFilter] = useState<readonly string[]>(['all'])

  // Editor states
  const [entityEditorOpen, setEntityEditorOpen] = useState(false)
  const [eventEditorOpen, setEventEditorOpen] = useState(false)
  const [locationEditorOpen, setLocationEditorOpen] = useState(false)
  const [timeEditorOpen, setTimeEditorOpen] = useState(false)
  const [collectionEditorOpen, setCollectionEditorOpen] = useState(false)

  const [selectedEntity, setSelectedEntity] = useState<typeof entities[0] | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<typeof events[0] | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<LocationPoint | LocationExtent | null>(null)
  const [selectedTime, setSelectedTime] = useState<typeof times[0] | null>(null)
  const [selectedCollection, setSelectedCollection] = useState<EntityCollection | EventCollection | null>(null)
  const [selectedCollectionType, setSelectedCollectionType] = useState<'entity' | 'event'>('entity')

  // Refs for managing focus
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(-1)

  // Map tab string values to numeric indices for commands
  const tabMap: Record<string, number> = { entities: 0, events: 1, locations: 2, times: 3, collections: 4 }
  const tabKeys = ['entities', 'events', 'locations', 'times', 'collections']
  const tabIndex = tabMap[tabValue] ?? 0

  const handleEditEntity = (entity: typeof entities[0]) => {
    setSelectedEntity(entity)
    setEntityEditorOpen(true)
  }

  const handleEditEvent = (event: typeof events[0]) => {
    setSelectedEvent(event)
    setEventEditorOpen(true)
  }

  const handleEditLocation = (location: LocationPoint | LocationExtent) => {
    setSelectedLocation(location)
    setLocationEditorOpen(true)
  }

  const handleEditTime = (time: typeof times[0]) => {
    setSelectedTime(time)
    setTimeEditorOpen(true)
  }

  const handleAddNew = () => {
    switch(tabValue) {
      case 'entities':
        setSelectedEntity(null)
        setEntityEditorOpen(true)
        break
      case 'events':
        setSelectedEvent(null)
        setEventEditorOpen(true)
        break
      case 'locations':
        setSelectedLocation(null)
        setLocationEditorOpen(true)
        break
      case 'times':
        setSelectedTime(null)
        setTimeEditorOpen(true)
        break
      case 'collections':
        setSelectedCollection(null)
        setSelectedCollectionType('entity') // Default to entity collection
        setCollectionEditorOpen(true)
        break
    }
  }

  const filterByWikidata = (item: { wikidataId?: string }) => {
    if (wikidataFilter.includes('all') || wikidataFilter.length === 0) return true
    if (wikidataFilter.includes('wikidata')) return !!item.wikidataId
    if (wikidataFilter.includes('manual')) return !item.wikidataId
    return true
  }

  const searchMatches = (item: { id?: string; name?: string; label?: string; wikidataId?: string; description?: GlossItem[] | string }, term: string) => {
    const lowerTerm = term.toLowerCase()

    // Extract description text from GlossItem array or plain string
    let descriptionText = ''
    if (Array.isArray(item.description)) {
      descriptionText = item.description.map((d: GlossItem) => d.content || '').join(' ')
    } else if (typeof item.description === 'string') {
      descriptionText = item.description
    }

    return (
      item.name?.toLowerCase().includes(lowerTerm) ||
      item.label?.toLowerCase().includes(lowerTerm) ||
      item.id?.toLowerCase().includes(lowerTerm) ||
      item.wikidataId?.toLowerCase().includes(lowerTerm) ||
      descriptionText.toLowerCase().includes(lowerTerm)
    )
  }

  // Note: filteredEntities now includes ALL entities (including locations)
  const filteredEntities = entities.filter(e =>
    searchMatches(e, searchTerm) && filterByWikidata(e)
  )
  const filteredEvents = events.filter(e =>
    searchMatches(e, searchTerm) && filterByWikidata(e)
  )
  // Locations shown separately for location-specific view
  const filteredLocations = locations.filter(l =>
    searchMatches(l, searchTerm) && filterByWikidata(l)
  )
  const filteredTimes = times.filter(t =>
    searchMatches(t, searchTerm) && filterByWikidata(t)
  )
  const filteredEntityCollections = entityCollections.filter(c =>
    searchMatches(c, searchTerm)
  )
  const filteredEventCollections = eventCollections.filter(c =>
    searchMatches(c, searchTerm)
  )
  const filteredAllCollections = [...filteredEntityCollections, ...filteredEventCollections]

  const getEntityTypeNames = (entity: typeof entities[0]) => {
    // Show number of type assignments - handle undefined from API
    const count = entity.typeAssignments?.length ?? 0
    return count > 0 ? `${count} type${count > 1 ? 's' : ''}` : ''
  }

  const getEventTypeNames = (event: typeof events[0]) => {
    // Show number of persona interpretations - handle undefined from API
    const count = event.personaInterpretations?.length ?? 0
    return count > 0 ? `${count} interpretation${count > 1 ? 's' : ''}` : ''
  }

  const formatTimeDisplay = (time: typeof times[0]): string => {
    // Primary: Show label if available
    if (time.label) {
      return time.label
    }

    // Fallback: Format timestamp/interval
    if (time.type === 'instant') {
      const instant = time as TimeInstant
      if (instant.timestamp) {
        const date = new Date(instant.timestamp)
        // Check if it's a valid date
        if (!isNaN(date.getTime())) {
          // Format based on vagueness/granularity
          if (instant.vagueness?.granularity === 'year') {
            return date.getFullYear().toString()
          } else if (instant.vagueness?.granularity === 'month') {
            return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
          } else {
            return date.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: date.getHours() !== 0 || date.getMinutes() !== 0 ? 'numeric' : undefined,
              minute: date.getMinutes() !== 0 ? 'numeric' : undefined
            })
          }
        }
      }
      return 'Instant'
    } else {
      const interval = time as TimeInterval
      if (interval.startTime && interval.endTime) {
        const start = new Date(interval.startTime)
        const end = new Date(interval.endTime)
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          const formatDate = (d: Date) => d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })
          return `${formatDate(start)} - ${formatDate(end)}`
        }
      } else if (interval.startTime) {
        const start = new Date(interval.startTime)
        if (!isNaN(start.getTime())) {
          return `From ${start.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })}`
        }
      } else if (interval.endTime) {
        const end = new Date(interval.endTime)
        if (!isNaN(end.getTime())) {
          return `Until ${end.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })}`
        }
      }
      return 'Interval'
    }
  }

  const getTimeDescription = (time: typeof times[0]): string => {
    const parts: string[] = []

    if (time.type === 'instant') {
      const instant = time as TimeInstant
      if (instant.vagueness) {
        if (instant.vagueness.type === 'approximate') parts.push('Approximate')
        if (instant.vagueness.type === 'bounded') parts.push('Bounded')
        if (instant.vagueness.type === 'fuzzy') parts.push('Fuzzy')
        if (instant.vagueness.description) parts.push(instant.vagueness.description)
      }
    }

    if (time.certainty && time.certainty < 1) {
      parts.push(`${Math.round(time.certainty * 100)}% certain`)
    }

    if (time.videoReferences?.length) {
      parts.push(`${time.videoReferences.length} video ref${time.videoReferences.length > 1 ? 's' : ''}`)
    }

    return parts.join(' \u2022 ')
  }

  // Get the currently visible list items based on tab
  const getCurrentItems = (): WorkspaceItem[] => {
    switch(tabValue) {
      case 'entities': return filteredEntities
      case 'events': return filteredEvents
      case 'locations': return filteredLocations
      case 'times': return filteredTimes
      case 'collections': return filteredAllCollections
      default: return []
    }
  }

  // Set command context for when clauses
  useCommandContext({
    objectWorkspaceActive: true,
    annotationWorkspaceActive: false,
    ontologyWorkspaceActive: false,
    videoBrowserActive: false,
    dialogOpen: entityEditorOpen || eventEditorOpen || locationEditorOpen || timeEditorOpen || collectionEditorOpen,
    inputFocused: false, // Updated dynamically by focus events in App.tsx
    objectSelected: selectedItemIndex >= 0,
  })

  // Register command handlers
  useCommands({
    'object.new': () => handleAddNew(),
    'object.nextTab': () => {
      const nextIdx = (tabIndex + 1) % 5
      setTabValue(tabKeys[nextIdx])
    },
    'object.previousTab': () => {
      const prevIdx = (tabIndex - 1 + 5) % 5
      setTabValue(tabKeys[prevIdx])
    },
    'object.edit': () => {
      const items = getCurrentItems()
      if (selectedItemIndex >= 0 && selectedItemIndex < items.length) {
        const item = items[selectedItemIndex]
        switch(tabValue) {
          case 'entities': handleEditEntity(item as Entity); break
          case 'events': handleEditEvent(item as Event); break
          case 'locations': handleEditLocation(item as LocationPoint | LocationExtent); break
          case 'times': handleEditTime(item as Time); break
          case 'collections':
            setSelectedCollection(item as EntityCollection | EventCollection)
            setSelectedCollectionType('entityIds' in item ? 'entity' : 'event')
            setCollectionEditorOpen(true)
            break
        }
      }
    },
    'object.delete': () => {
      const items = getCurrentItems()
      if (selectedItemIndex >= 0 && selectedItemIndex < items.length) {
        const item = items[selectedItemIndex]
        switch(tabValue) {
          case 'entities': deleteEntityMutate(item.id); break
          case 'events': deleteEventMutate(item.id); break
          case 'locations': deleteEntityMutate(item.id); break // Locations are entities
          case 'times': deleteTimeMutate(item.id); break
          case 'collections':
            if ('entityIds' in item) {
              deleteEntityCollectionMutate(item.id)
            } else {
              deleteEventCollectionMutate(item.id)
            }
            break
        }
      }
    },
    'object.duplicate': () => {
      const items = getCurrentItems()
      if (selectedItemIndex < 0 || selectedItemIndex >= items.length) return
      const item = items[selectedItemIndex]
      const renamed = buildDuplicatePayload(item)
      switch (tabValue) {
        case 'entities':
          addEntityMutate(renamed as unknown as Omit<Entity, 'id' | 'createdAt' | 'updatedAt'>)
          break
        case 'events':
          addEventMutate(renamed as unknown as Omit<Event, 'id' | 'createdAt' | 'updatedAt'>)
          break
        case 'locations':
          // Locations are entities with a `locationType` field.
          addEntityMutate(renamed as unknown as Omit<Entity, 'id' | 'createdAt' | 'updatedAt'>)
          break
        case 'times':
          addTimeMutate(renamed as unknown as Omit<Time, 'id'>)
          break
        case 'collections':
          if ('entityIds' in item) {
            addEntityCollectionMutate(renamed as unknown as Omit<EntityCollection, 'id' | 'createdAt' | 'updatedAt'>)
          } else {
            addEventCollectionMutate(renamed as unknown as Omit<EventCollection, 'id' | 'createdAt' | 'updatedAt'>)
          }
          break
      }
    },
    'object.search': () => {
      searchInputRef.current?.focus()
    },
  }, {
    context: 'objectWorkspace',
    enabled: true
  })

  // Handle item selection with mouse
  const handleItemClick = (index: number) => {
    setSelectedItemIndex(index)
  }

  // Reset selection when tab or search changes
  useEffect(() => {
    setSelectedItemIndex(-1)
  }, [tabValue, searchTerm])

  const renderListItem = (
    item: { id: string; name?: string },
    index: number,
    primary: React.ReactNode,
    secondary: React.ReactNode | undefined,
    onEdit: () => void,
    onDelete: () => void,
    editLabel: string,
    deleteLabel: string,
  ) => (
    <li
      key={item.id}
      className={cn(
        'flex items-center justify-between py-2 px-3 border-b cursor-pointer hover:bg-accent/50',
        selectedItemIndex === index && 'bg-accent/30'
      )}
      onClick={() => handleItemClick(index)}
    >
      <div className="flex-1 min-w-0">
        <div>{primary}</div>
        {secondary && <div className="mt-0.5">{secondary}</div>}
      </div>
      <div className="flex gap-1 ml-2 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); onEdit() }} aria-label={editLabel}>
          <Pencil className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); onDelete() }} aria-label={deleteLabel}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  )

  return (
    <div className="h-full flex flex-col">
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Search objects (name, ID, or Wikidata ID)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-2"
          />
        </div>
        <div className="flex justify-end mt-2">
          <ToggleGroup
            value={wikidataFilter}
            onValueChange={(val) => val.length > 0 && setWikidataFilter(val)}
            size="sm"
          >
            <ToggleGroupItem value="all" aria-label="all objects">All</ToggleGroupItem>
            <ToggleGroupItem value="wikidata" aria-label="wikidata imports">
              <Globe className="size-4 mr-1" />Wikidata
            </ToggleGroupItem>
            <ToggleGroupItem value="manual" aria-label="manual entries">Manual</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <Tabs value={tabValue} onValueChange={setTabValue} className="flex-1 flex flex-col">
        <TabsList className="mx-4">
          <TabsTrigger value="entities">
            <User className="size-4 mr-1" />Entities ({entities.length})
          </TabsTrigger>
          <TabsTrigger value="events">
            <CalendarDays className="size-4 mr-1" />Events ({events.length})
          </TabsTrigger>
          <TabsTrigger value="locations">
            <MapPin className="size-4 mr-1" />Locations ({locations.length})
          </TabsTrigger>
          <TabsTrigger value="times">
            <Clock className="size-4 mr-1" />Times ({times.length})
          </TabsTrigger>
          <TabsTrigger value="collections">
            <Layers className="size-4 mr-1" />Collections ({entityCollections.length + eventCollections.length})
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-auto">
          <TabsContent value="entities" className="p-6">
            <ul>
              {filteredEntities.map((entity, index) => {
                const entityIsLocation = isLocation(entity)
                return renderListItem(
                  entity,
                  index,
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{entity.name}</span>
                    {entityIsLocation && (
                      <Badge variant="outline" className="gap-1">
                        <MapPin className="size-3" />Location
                      </Badge>
                    )}
                    <WikidataChip
                      wikidataId={entity.wikidataId}
                      wikidataUrl={entity.wikidataUrl}
                      wikibaseId={entity.wikibaseId}
                      importedAt={entity.importedAt}
                      size="small"
                      showTimestamp={false}
                    />
                  </div>,
                  <>
                    {(entityIsLocation || getEntityTypeNames(entity)) && (
                      <span className="text-xs text-muted-foreground block">
                        {entityIsLocation ? (
                          <>Type: {entity.locationType === 'point' ? 'Point' : 'Extent'} Location</>
                        ) : (
                          <>Types: {getEntityTypeNames(entity)}</>
                        )}
                      </span>
                    )}
                    {entity.metadata?.alternateNames && entity.metadata.alternateNames.length > 0 && (
                      <span className="text-xs text-muted-foreground block">
                        Also known as: {entity.metadata.alternateNames.join(', ')}
                      </span>
                    )}
                  </>,
                  () => entityIsLocation ? handleEditLocation(entity) : handleEditEntity(entity),
                  () => deleteEntityMutate(entity.id),
                  `Edit ${entity.name}`,
                  `Delete ${entity.name}`,
                )
              })}
            </ul>
          </TabsContent>

          <TabsContent value="events" className="p-6">
            <ul>
              {filteredEvents.map((event, index) => renderListItem(
                event,
                index,
                <div className="flex items-center gap-2">
                  <span className="text-sm">{event.name}</span>
                  <WikidataChip
                    wikidataId={event.wikidataId}
                    wikidataUrl={event.wikidataUrl}
                    wikibaseId={event.wikibaseId}
                    importedAt={event.importedAt}
                    size="small"
                    showTimestamp={false}
                  />
                </div>,
                getEventTypeNames(event) ? (
                  <span className="text-xs text-muted-foreground">
                    Types: {getEventTypeNames(event)}
                  </span>
                ) : undefined,
                () => handleEditEvent(event),
                () => deleteEventMutate(event.id),
                `Edit ${event.name}`,
                `Delete ${event.name}`,
              ))}
            </ul>
          </TabsContent>

          <TabsContent value="locations" className="p-6">
            <ul>
              {filteredLocations.map((location, index) => renderListItem(
                location,
                index,
                <div className="flex items-center gap-2">
                  <span className="text-sm">{location.name}</span>
                  <WikidataChip
                    wikidataId={location.wikidataId}
                    wikidataUrl={location.wikidataUrl}
                    wikibaseId={location.wikibaseId}
                    importedAt={location.importedAt}
                    size="small"
                    showTimestamp={false}
                  />
                </div>,
                <span className="text-xs text-muted-foreground">
                  Type: {location.locationType === 'point' ? 'Point' : 'Extent'}
                </span>,
                () => handleEditLocation(location),
                () => deleteEntityMutate(location.id),
                `Edit ${location.name}`,
                `Delete ${location.name}`,
              ))}
            </ul>
          </TabsContent>

          <TabsContent value="times" className="p-6">
            <ul>
              {filteredTimes.map((time, index) => renderListItem(
                time,
                index,
                <div className="flex items-center gap-2">
                  <span className="text-sm">{formatTimeDisplay(time)}</span>
                  <WikidataChip
                    wikidataId={time.wikidataId}
                    wikidataUrl={time.wikidataUrl}
                    wikibaseId={time.wikibaseId}
                    importedAt={time.importedAt}
                    size="small"
                    showTimestamp={false}
                  />
                </div>,
                getTimeDescription(time) ? (
                  <span className="text-xs text-muted-foreground">
                    {getTimeDescription(time)}
                  </span>
                ) : undefined,
                () => handleEditTime(time),
                () => deleteTimeMutate(time.id),
                `Edit time ${formatTimeDisplay(time)}`,
                `Delete time ${formatTimeDisplay(time)}`,
              ))}
            </ul>
          </TabsContent>

          <TabsContent value="collections" className="p-6">
            {/* Entity Collections */}
            {filteredEntityCollections.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                  <User className="size-4" />
                  Entity Collections ({filteredEntityCollections.length})
                </h3>
                <ul>
                  {filteredEntityCollections.map((collection) => (
                    <li
                      key={collection.id}
                      className="flex items-center justify-between py-2 px-3 border-b cursor-pointer hover:bg-accent/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{collection.name}</span>
                        <Badge variant="outline">{collection.collectionType}</Badge>
                        <Badge>{collection.entityIds.length} entities</Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            setSelectedCollection(collection)
                            setSelectedCollectionType('entity')
                            setCollectionEditorOpen(true)
                          }}
                          aria-label={`Edit ${collection.name}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => deleteEntityCollectionMutate(collection.id)}
                          aria-label={`Delete ${collection.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Event Collections */}
            {filteredEventCollections.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                  <CalendarDays className="size-4" />
                  Event Collections ({filteredEventCollections.length})
                </h3>
                <ul>
                  {filteredEventCollections.map((collection) => (
                    <li
                      key={collection.id}
                      className="flex items-center justify-between py-2 px-3 border-b cursor-pointer hover:bg-accent/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{collection.name}</span>
                        <Badge variant="outline">{collection.collectionType}</Badge>
                        <Badge>{collection.eventIds.length} events</Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            setSelectedCollection(collection)
                            setSelectedCollectionType('event')
                            setCollectionEditorOpen(true)
                          }}
                          aria-label={`Edit ${collection.name}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => deleteEventCollectionMutate(collection.id)}
                          aria-label={`Delete ${collection.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Empty state */}
            {filteredEntityCollections.length === 0 && filteredEventCollections.length === 0 && (
              <div className="text-center py-8">
                <Layers className="size-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-muted-foreground">
                  No collections yet
                </h3>
                <p className="text-sm text-muted-foreground">
                  Create a collection to group entities or events together
                </p>
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-lg"
                className="absolute bottom-4 right-4 rounded-full shadow-lg"
                aria-label="add"
                onClick={handleAddNew}
              />
            }
          >
            <Plus className="size-5" />
          </TooltipTrigger>
          <TooltipContent side="left">Add New Object (Cmd/Ctrl+N)</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Editors */}
      <EntityEditor
        open={entityEditorOpen}
        onClose={() => {
          setEntityEditorOpen(false)
          setSelectedEntity(null)
        }}
        entity={selectedEntity}
      />
      <EventEditor
        open={eventEditorOpen}
        onClose={() => {
          setEventEditorOpen(false)
          setSelectedEvent(null)
        }}
        event={selectedEvent}
      />
      <LocationEditor
        open={locationEditorOpen}
        onClose={() => {
          setLocationEditorOpen(false)
          setSelectedLocation(null)
        }}
        location={selectedLocation}
      />
      <TimeEditor
        open={timeEditorOpen}
        onClose={() => {
          setTimeEditorOpen(false)
          setSelectedTime(null)
        }}
        time={selectedTime}
      />
      <CollectionEditor
        open={collectionEditorOpen}
        onClose={() => {
          setCollectionEditorOpen(false)
          setSelectedCollection(null)
        }}
        collection={selectedCollection}
        collectionType={selectedCollectionType}
      />
    </div>
  )
}
