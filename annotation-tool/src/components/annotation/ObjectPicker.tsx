import React, { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Search, X, Clock, User, CalendarDays, MapPin, Folder } from 'lucide-react'
import { WikidataChip } from '../shared/WikidataChip'
import { useWorld, usePersonas } from '@store/queries'
import { GlossItem, LocationPoint } from '@models/types'

/**
 * Supported object type identifiers.
 */
type WorldObjectType = 'entity' | 'event' | 'location' | 'entity-collection' | 'event-collection' | 'time-collection'

/**
 * World object with all possible properties for rendering.
 * Using a permissive interface to handle various world object types.
 */
interface WorldObjectForDisplay {
  id: string
  name: string
  type?: WorldObjectType
  description?: GlossItem[] | string
  wikidataId?: string
  wikidataUrl?: string
  wikibaseId?: string
  importedAt?: string
  typeAssignments?: Array<{ personaId: string; entityTypeId?: string; eventTypeId?: string }>
  personaInterpretations?: Array<{ personaId: string; eventTypeId: string }>
  coordinates?: LocationPoint['coordinates']
  entityIds?: string[]
  eventIds?: string[]
}

interface ObjectPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (object: {
    id: string
    type: 'entity' | 'event' | 'location' | 'entity-collection' | 'event-collection' | 'time-collection'
    name: string
  }) => void
  allowedTypes?: ('entity' | 'event' | 'location' | 'collection')[]
  recentIds?: string[]
}

export default function ObjectPicker({
  open,
  onClose,
  onSelect,
  allowedTypes = ['entity', 'event', 'location', 'collection'],
  recentIds = [],
}: ObjectPickerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTab, setSelectedTab] = useState('entities')
  const [selectedObject, setSelectedObject] = useState<any>(null)

  // Get world objects from TanStack Query
  const { data: worldData } = useWorld()
  const entities = useMemo(() => worldData?.entities ?? [], [worldData?.entities])
  const events = useMemo(() => worldData?.events ?? [], [worldData?.events])
  const entityCollections = useMemo(() => worldData?.entityCollections ?? [], [worldData?.entityCollections])
  const eventCollections = useMemo(() => worldData?.eventCollections ?? [], [worldData?.eventCollections])
  const timeCollections = useMemo(() => worldData?.timeCollections ?? [], [worldData?.timeCollections])
  const { data: personas = [] } = usePersonas()

  // Filter locations from entities
  const locations = useMemo(() =>
    entities.filter(e => 'locationType' in e) as unknown as LocationPoint[],
    [entities]
  )

  // Filter non-location entities
  const regularEntities = useMemo(() =>
    entities.filter(e => !('locationType' in e)),
    [entities]
  )

  // Search filtering
  const filterBySearch = <T extends { name: string; description?: GlossItem[] | string }>(items: T[], query: string): T[] => {
    if (!query) return items
    const lowerQuery = query.toLowerCase()
    return items.filter(item => {
      if (item.name.toLowerCase().includes(lowerQuery)) return true
      if (typeof item.description === 'string') {
        return item.description.toLowerCase().includes(lowerQuery)
      }
      if (Array.isArray(item.description)) {
        return item.description.some((d: GlossItem) =>
          d.type === 'text' && d.content?.toLowerCase().includes(lowerQuery)
        )
      }
      return false
    })
  }

  const filteredEntities = filterBySearch(regularEntities, searchQuery)
  const filteredEvents = filterBySearch(events, searchQuery)
  const filteredLocations = filterBySearch(locations, searchQuery)
  const filteredEntityCollections = filterBySearch(entityCollections, searchQuery)
  const filteredEventCollections = filterBySearch(eventCollections, searchQuery)
  const filteredTimeCollections = filterBySearch(timeCollections, searchQuery)

  // Get recent objects
  const recentObjects = useMemo((): WorldObjectForDisplay[] => {
    const objects: WorldObjectForDisplay[] = []
    recentIds.forEach(id => {
      const entity = entities.find(e => e.id === id)
      if (entity) {
        objects.push({ ...entity, type: 'locationType' in entity ? 'location' : 'entity' })
        return
      }
      const event = events.find(e => e.id === id)
      if (event) {
        objects.push({ ...event, type: 'event' })
        return
      }
      const entityCol = entityCollections.find(c => c.id === id)
      if (entityCol) {
        objects.push({ ...entityCol, type: 'entity-collection' })
        return
      }
      const eventCol = eventCollections.find(c => c.id === id)
      if (eventCol) {
        objects.push({ ...eventCol, type: 'event-collection' })
      }
    })
    return objects
  }, [recentIds, entities, events, entityCollections, eventCollections])

  const handleObjectSelect = (object: { id: string; name: string }, type: WorldObjectType) => {
    setSelectedObject({ id: object.id, name: object.name, type })
  }

  const handleConfirmSelection = () => {
    if (selectedObject) {
      onSelect({
        id: selectedObject.id,
        type: selectedObject.type,
        name: selectedObject.name,
      })
      onClose()
      setSelectedObject(null)
      setSearchQuery('')
    }
  }

  const handleClose = () => {
    onClose()
    setSelectedObject(null)
    setSearchQuery('')
  }

  const renderObjectList = (items: WorldObjectForDisplay[], type: WorldObjectType, icon: React.ReactElement) => (
    <ul className="divide-y">
      {items.length === 0 && (
        <li className="py-3 px-2">
          <p className="text-sm text-muted-foreground">
            No {type}s found. Create one in the Persona Builder.
          </p>
        </li>
      )}
      {items.map((item) => (
        <li
          key={item.id}
          className={`flex items-start gap-3 py-2 px-3 cursor-pointer rounded-md ${
            selectedObject?.id === item.id ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
          }`}
          onClick={() => handleObjectSelect(item, type)}
        >
          <span className="mt-0.5 shrink-0">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm">{item.name}</span>
              <WikidataChip
                wikidataId={item.wikidataId}
                wikidataUrl={item.wikidataUrl}
                wikibaseId={item.wikibaseId}
                importedAt={item.importedAt}
                size="small"
                showTimestamp={false}
              />
            </div>
            <div className="flex flex-col gap-1 mt-0.5">
              {item.description && (
                <p className="text-xs text-muted-foreground">
                  {typeof item.description === 'string'
                    ? item.description
                    : item.description[0]?.content}
                </p>
              )}
              {/* Show type assignments for entities */}
              {type === 'entity' && item.typeAssignments && item.typeAssignments.length > 0 && (
                <div className="flex gap-1 flex-wrap mt-1">
                  {item.typeAssignments.map((assignment) => {
                    const persona = personas.find(p => p.id === assignment.personaId)
                    const typeId = assignment.entityTypeId || assignment.eventTypeId || 'Unknown'
                    return (
                      <Badge key={assignment.personaId} variant="outline" className="text-[10px]">
                        {persona?.name || 'Unknown'}: {typeId}
                      </Badge>
                    )
                  })}
                </div>
              )}
              {/* Show interpretations for events */}
              {type === 'event' && item.personaInterpretations && item.personaInterpretations.length > 0 && (
                <div className="flex gap-1 flex-wrap mt-1">
                  {item.personaInterpretations.map((interp) => {
                    const persona = personas.find(p => p.id === interp.personaId)
                    return (
                      <Badge key={interp.personaId} variant="outline" className="text-[10px]">
                        {persona?.name || 'Unknown'}: {interp.eventTypeId}
                      </Badge>
                    )
                  })}
                </div>
              )}
              {/* Show coordinates for locations */}
              {type === 'location' && item.coordinates && (
                <p className="text-xs text-muted-foreground">
                  {item.coordinates.latitude && item.coordinates.longitude
                    ? `${item.coordinates.latitude.toFixed(4)}, ${item.coordinates.longitude.toFixed(4)}`
                    : `x: ${item.coordinates.x}, y: ${item.coordinates.y}`}
                </p>
              )}
              {/* Show member count for collections */}
              {(type === 'entity-collection' || type === 'event-collection') && (
                <p className="text-xs text-muted-foreground">
                  {type === 'entity-collection'
                    ? `${item.entityIds?.length || 0} entities`
                    : `${item.eventIds?.length || 0} events`}
                </p>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )

  // Determine which tabs to show based on allowedTypes
  const showEntities = allowedTypes.includes('entity')
  const showEvents = allowedTypes.includes('event')
  const showLocations = allowedTypes.includes('location')
  const showCollections = allowedTypes.includes('collection')

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose() }}>
      <DialogContent className="sm:max-w-2xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select World Object</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Search Bar */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search objects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2"
                onClick={() => setSearchQuery('')}
              >
                <X className="size-4 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Recent Objects */}
          {recentObjects.length > 0 && !searchQuery && (
            <div className="mb-4">
              <p className="text-sm font-medium flex items-center gap-2 mb-2">
                <Clock className="size-4" />
                Recently Used
              </p>
              <div className="flex gap-2 flex-wrap">
                {recentObjects.slice(0, 5).filter(obj => obj.type).map((obj) => (
                  <Badge
                    key={obj.id}
                    variant={selectedObject?.id === obj.id ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => handleObjectSelect(obj, obj.type!)}
                  >
                    {obj.type === 'entity' ? <User className="size-3 mr-1" /> :
                     obj.type === 'event' ? <CalendarDays className="size-3 mr-1" /> :
                     obj.type === 'location' ? <MapPin className="size-3 mr-1" /> :
                     <Folder className="size-3 mr-1" />}
                    {obj.name}
                  </Badge>
                ))}
              </div>
              <Separator className="mt-4" />
            </div>
          )}

          {/* Tabs */}
          <Tabs value={selectedTab} onValueChange={(val) => { setSelectedTab(val); setSelectedObject(null) }} className="flex-1 flex flex-col overflow-hidden">
            <TabsList>
              {showEntities && <TabsTrigger value="entities">Entities ({filteredEntities.length})</TabsTrigger>}
              {showEvents && <TabsTrigger value="events">Events ({filteredEvents.length})</TabsTrigger>}
              {showLocations && <TabsTrigger value="locations">Locations ({filteredLocations.length})</TabsTrigger>}
              {showCollections && <TabsTrigger value="collections">Collections</TabsTrigger>}
            </TabsList>

            <div className="flex-1 overflow-auto mt-2">
              {showEntities && (
                <TabsContent value="entities">
                  {renderObjectList(filteredEntities, 'entity', <User className="size-4" />)}
                </TabsContent>
              )}
              {showEvents && (
                <TabsContent value="events">
                  {renderObjectList(filteredEvents, 'event', <CalendarDays className="size-4" />)}
                </TabsContent>
              )}
              {showLocations && (
                <TabsContent value="locations">
                  {renderObjectList(filteredLocations, 'location', <MapPin className="size-4" />)}
                </TabsContent>
              )}
              {showCollections && (
                <TabsContent value="collections">
                  <p className="text-sm font-medium mb-2">Entity Collections</p>
                  {renderObjectList(filteredEntityCollections, 'entity-collection', <Folder className="size-4" />)}

                  <p className="text-sm font-medium mb-2 mt-4">Event Collections</p>
                  {renderObjectList(filteredEventCollections, 'event-collection', <Folder className="size-4" />)}

                  <p className="text-sm font-medium mb-2 mt-4">Time Collections</p>
                  {renderObjectList(filteredTimeCollections, 'time-collection', <Folder className="size-4" />)}
                </TabsContent>
              )}
            </div>
          </Tabs>

          {/* Selected Object Info */}
          {selectedObject && (
            <Alert className="mt-4">
              <AlertDescription>
                Selected: <strong>{selectedObject.name}</strong> ({selectedObject.type})
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleConfirmSelection}
            disabled={!selectedObject}
          >
            Select
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
