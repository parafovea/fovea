import React, { useState } from 'react'
import { Plus, Trash2, Pencil, Users, Zap, Package, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  useWorld,
  useAddEntityCollection,
  useUpdateEntityCollection,
  useDeleteEntityCollection,
  useAddEventCollection,
  useUpdateEventCollection,
  useDeleteEventCollection,
  useAddTimeCollection,
  useUpdateTimeCollection,
  useDeleteTimeCollection,
} from '@store/queries'
import {
  EntityCollection,
  EventCollection,
  TimeCollection,
  TimeInstant,
  TimeInterval,
  GlossItem,
} from '@models/types'
import GlossEditor from '@components/ontology/GlossEditor'
import { TypeObjectBadge } from '../shared/TypeObjectToggle'

/** Entity collection type options */
type EntityCollectionType = 'group' | 'kind' | 'functional' | 'stage' | 'portion' | 'variant'

/** Event collection type options */
type EventCollectionType = 'sequence' | 'iteration' | 'complex' | 'alternative' | 'group'

/** Time collection type options */
type TimeCollectionType = 'periodic' | 'calendar' | 'irregular' | 'anchored' | 'habitual'

/** Habitual frequency options */
type HabitualFrequency = 'always' | 'usually' | 'often' | 'sometimes' | 'rarely' | 'never'

// Entity Collection Editor
function EntityCollectionEditor({
  open,
  onClose,
  collection,
}: {
  open: boolean
  onClose: () => void
  collection: EntityCollection | null
}) {
  const { data: worldData } = useWorld()
  const entities = worldData?.entities ?? []
  const { mutate: addEntityCollection } = useAddEntityCollection()
  const { mutate: updateEntityCollection } = useUpdateEntityCollection()

  const [name, setName] = useState(collection?.name || '')
  const [description, setDescription] = useState<GlossItem[]>(
    collection?.description || [{ type: 'text', content: '' }]
  )
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>(
    collection?.entityIds || []
  )
  const [collectionType, setCollectionType] = useState<EntityCollectionType>(
    collection?.collectionType || 'group'
  )
  const [homogeneous, setHomogeneous] = useState(
    collection?.aggregateProperties?.homogeneous || false
  )
  const [ordered, setOrdered] = useState(
    collection?.aggregateProperties?.ordered || false
  )

  const handleSave = () => {
    const collectionData: Omit<EntityCollection, 'id' | 'createdAt' | 'updatedAt'> = {
      name,
      description,
      entityIds: selectedEntityIds,
      collectionType,
      typeAssignments: collection?.typeAssignments || [],
      aggregateProperties: {
        homogeneous,
        ordered,
        mereological: 'mixed',
      },
      metadata: {},
    }

    if (collection) {
      updateEntityCollection({ ...collection, ...collectionData })
    } else {
      addEntityCollection(collectionData)
    }

    onClose()
  }

  const toggleEntity = (id: string) => {
    setSelectedEntityIds(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    )
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent data-tour-id="collection-builder" className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5 text-secondary" />
            {collection ? 'Edit' : 'Create'} Entity Collection
            <TypeObjectBadge isType={false} />
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="space-y-1">
            <Label>Collection Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Collection name"
            />
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <GlossEditor
              gloss={description}
              onChange={setDescription}
              personaId={null}
            />
          </div>

          <div className="space-y-1">
            <Label>Collection Type</Label>
            <Select value={collectionType} onValueChange={(value) => setCollectionType(value as EntityCollectionType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="group">Group (set of entities)</SelectItem>
                <SelectItem value="kind">Kind (entities of same type)</SelectItem>
                <SelectItem value="functional">Functional (entities with shared function)</SelectItem>
                <SelectItem value="stage">Stage (temporal slice)</SelectItem>
                <SelectItem value="portion">Portion (part of whole)</SelectItem>
                <SelectItem value="variant">Variant (alternative versions)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Entities in Collection</Label>
            <div className="max-h-48 overflow-y-auto rounded-lg border p-2 space-y-1">
              {entities.map((entity) => (
                <button
                  key={entity.id}
                  type="button"
                  onClick={() => toggleEntity(entity.id)}
                  className={`w-full text-left px-2 py-1 rounded text-sm transition-colors ${
                    selectedEntityIds.includes(entity.id)
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted'
                  }`}
                >
                  {entity.name}
                </button>
              ))}
            </div>
            {selectedEntityIds.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedEntityIds.map((id) => {
                  const entity = entities.find(e => e.id === id)
                  return (
                    <Badge key={id} variant="outline">
                      {entity?.name || 'Unknown'}
                    </Badge>
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label>Properties</Label>
            <ToggleGroup
              value={[
                ...(homogeneous ? ['homogeneous'] : []),
                ...(ordered ? ['ordered'] : []),
              ]}
              onValueChange={(newFormats) => {
                setHomogeneous(newFormats.includes('homogeneous'))
                setOrdered(newFormats.includes('ordered'))
              }}
              multiple
            >
              <ToggleGroupItem value="homogeneous">
                Homogeneous (same type)
              </ToggleGroupItem>
              <ToggleGroupItem value="ordered">
                Ordered (sequence matters)
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="secondary"
            onClick={handleSave}
            disabled={!name || selectedEntityIds.length === 0}
          >
            {collection ? 'Update' : 'Create'} Collection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Event Collection Editor
function EventCollectionEditor({
  open,
  onClose,
  collection,
}: {
  open: boolean
  onClose: () => void
  collection: EventCollection | null
}) {
  const { data: worldData } = useWorld()
  const events = worldData?.events ?? []
  const timeCollections = worldData?.timeCollections ?? []
  const { mutate: addEventCollection } = useAddEventCollection()
  const { mutate: updateEventCollection } = useUpdateEventCollection()

  const [name, setName] = useState(collection?.name || '')
  const [description, setDescription] = useState<GlossItem[]>(
    collection?.description || [{ type: 'text', content: '' }]
  )
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>(
    collection?.eventIds || []
  )
  const [collectionType, setCollectionType] = useState<EventCollectionType>(
    collection?.collectionType || 'sequence'
  )
  const [timeCollectionId, setTimeCollectionId] = useState(
    collection?.timeCollectionId || ''
  )

  const handleSave = () => {
    const collectionData: Omit<EventCollection, 'id' | 'createdAt' | 'updatedAt'> = {
      name,
      description,
      eventIds: selectedEventIds,
      collectionType,
      typeAssignments: collection?.typeAssignments || [],
      timeCollectionId: timeCollectionId || undefined,
      structure: collection?.structure,
      metadata: {},
    }

    if (collection) {
      updateEventCollection({ ...collection, ...collectionData })
    } else {
      addEventCollection(collectionData)
    }

    onClose()
  }

  const toggleEvent = (id: string) => {
    setSelectedEventIds(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    )
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5 text-secondary" />
            {collection ? 'Edit' : 'Create'} Event Collection
            <TypeObjectBadge isType={false} />
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="space-y-1">
            <Label>Collection Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Collection name"
            />
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <GlossEditor
              gloss={description}
              onChange={setDescription}
              personaId={null}
            />
          </div>

          <div className="space-y-1">
            <Label>Collection Type</Label>
            <Select value={collectionType} onValueChange={(value) => setCollectionType(value as EventCollectionType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sequence">Sequence (ordered events)</SelectItem>
                <SelectItem value="iteration">Iteration (repeated pattern)</SelectItem>
                <SelectItem value="complex">Complex (structured events)</SelectItem>
                <SelectItem value="alternative">Alternative (options)</SelectItem>
                <SelectItem value="group">Group (unordered set)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Events in Collection</Label>
            <div className="max-h-48 overflow-y-auto rounded-lg border p-2 space-y-1">
              {events.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => toggleEvent(event.id)}
                  className={`w-full text-left px-2 py-1 rounded text-sm transition-colors ${
                    selectedEventIds.includes(event.id)
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted'
                  }`}
                >
                  {event.name}
                </button>
              ))}
            </div>
            {selectedEventIds.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedEventIds.map((id) => {
                  const event = events.find(e => e.id === id)
                  return (
                    <Badge key={id} variant="outline">
                      {event?.name || 'Unknown'}
                    </Badge>
                  )
                })}
              </div>
            )}
          </div>

          {collectionType === 'iteration' && (
            <div className="space-y-1">
              <Label>Time Pattern</Label>
              <Select value={timeCollectionId || '_none'} onValueChange={(value) => setTimeCollectionId(!value || value === '_none' ? '' : value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {timeCollections.map((tc) => (
                    <SelectItem key={tc.id} value={tc.id}>
                      {tc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="secondary"
            onClick={handleSave}
            disabled={!name || selectedEventIds.length === 0}
          >
            {collection ? 'Update' : 'Create'} Collection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Time Collection Editor (for patterns)
function TimeCollectionEditorDialog({
  open,
  onClose,
  collection,
}: {
  open: boolean
  onClose: () => void
  collection: TimeCollection | null
}) {
  const { data: worldData } = useWorld()
  const times = worldData?.times ?? []
  const { mutate: addTimeCollection } = useAddTimeCollection()
  const { mutate: updateTimeCollection } = useUpdateTimeCollection()

  const [name, setName] = useState(collection?.name || '')
  const [description, setDescription] = useState(collection?.description || '')
  const [selectedTimeIds, setSelectedTimeIds] = useState<string[]>(
    collection?.times?.map(t => t.id) || []
  )
  const [collectionType, setCollectionType] = useState<TimeCollectionType>(
    collection?.collectionType || 'periodic'
  )
  const [frequency, setFrequency] = useState<HabitualFrequency>(
    collection?.habituality?.frequency || 'sometimes'
  )

  const handleSave = () => {
    const collectionData: Omit<TimeCollection, 'id'> = {
      name,
      description,
      times: times.filter(t => selectedTimeIds.includes(t.id)),
      collectionType,
      habituality: {
        frequency,
        typicality: 0.5,
      },
      metadata: {},
    }

    if (collection) {
      updateTimeCollection({ ...collection, ...collectionData })
    } else {
      addTimeCollection(collectionData)
    }

    onClose()
  }

  const toggleTime = (id: string) => {
    setSelectedTimeIds(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    )
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent data-tour-id="time-collection-builder" className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="size-5 text-secondary" />
            {collection ? 'Edit' : 'Create'} Time Collection
            <TypeObjectBadge isType={false} />
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="space-y-1">
            <Label>Collection Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Collection name"
            />
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <textarea
              className="flex min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-1">
            <Label>Collection Type</Label>
            <Select value={collectionType} onValueChange={(value) => setCollectionType(value as TimeCollectionType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="periodic">Periodic (regular intervals)</SelectItem>
                <SelectItem value="habitual">Habitual (repeating pattern)</SelectItem>
                <SelectItem value="calendar">Calendar (date-based)</SelectItem>
                <SelectItem value="irregular">Irregular (no pattern)</SelectItem>
                <SelectItem value="anchored">Anchored (event-based)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(collectionType === 'periodic' || collectionType === 'habitual') && (
            <div className="space-y-1">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={(value) => setFrequency(value as HabitualFrequency)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="always">Always</SelectItem>
                  <SelectItem value="usually">Usually</SelectItem>
                  <SelectItem value="often">Often</SelectItem>
                  <SelectItem value="sometimes">Sometimes</SelectItem>
                  <SelectItem value="rarely">Rarely</SelectItem>
                  <SelectItem value="never">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Times in Collection</Label>
            <div className="max-h-48 overflow-y-auto rounded-lg border p-2 space-y-1">
              {times.map((time) => (
                <button
                  key={time.id}
                  type="button"
                  onClick={() => toggleTime(time.id)}
                  className={`w-full text-left px-2 py-1 rounded text-sm transition-colors ${
                    selectedTimeIds.includes(time.id)
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted'
                  }`}
                >
                  {time.type === 'instant'
                    ? `Instant: ${(time as TimeInstant).timestamp || 'unspecified'}`
                    : `Interval: ${(time as TimeInterval).startTime || '?'} - ${(time as TimeInterval).endTime || '?'}`}
                </button>
              ))}
            </div>
            {selectedTimeIds.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedTimeIds.map((id) => {
                  const time = times.find(t => t.id === id)
                  return (
                    <Badge key={id} variant="outline">
                      {time ? `${time.type} time` : 'Unknown'}
                    </Badge>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="secondary"
            onClick={handleSave}
            disabled={!name}
          >
            {collection ? 'Update' : 'Create'} Collection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Main CollectionBuilder Component
export default function CollectionBuilder() {
  const { data: worldData } = useWorld()
  const entityCollections = worldData?.entityCollections ?? []
  const eventCollections = worldData?.eventCollections ?? []
  const timeCollections = worldData?.timeCollections ?? []
  const { mutate: deleteEntityCollection } = useDeleteEntityCollection()
  const { mutate: deleteEventCollection } = useDeleteEventCollection()
  const { mutate: deleteTimeCollection } = useDeleteTimeCollection()

  const [entityCollectionEditorOpen, setEntityCollectionEditorOpen] = useState(false)
  const [eventCollectionEditorOpen, setEventCollectionEditorOpen] = useState(false)
  const [timeCollectionEditorOpen, setTimeCollectionEditorOpen] = useState(false)
  const [selectedEntityCollection, setSelectedEntityCollection] = useState<EntityCollection | null>(null)
  const [selectedEventCollection, setSelectedEventCollection] = useState<EventCollection | null>(null)
  const [selectedTimeCollection, setSelectedTimeCollection] = useState<TimeCollection | null>(null)

  const handleEditEntityCollection = (collection: EntityCollection) => {
    setSelectedEntityCollection(collection)
    setEntityCollectionEditorOpen(true)
  }

  const handleEditEventCollection = (collection: EventCollection) => {
    setSelectedEventCollection(collection)
    setEventCollectionEditorOpen(true)
  }

  const handleEditTimeCollection = (collection: TimeCollection) => {
    setSelectedTimeCollection(collection)
    setTimeCollectionEditorOpen(true)
  }

  return (
    <div className="w-full">
      <div className="rounded-lg border bg-card p-4 mb-4">
        <div className="flex items-center gap-4">
          <Users className="size-8 text-secondary" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Collection Builder</h2>
            <p className="text-sm text-muted-foreground">
              Create and manage collections of entities, events, and times
            </p>
          </div>
          <TypeObjectBadge isType={false} />
        </div>
      </div>

      <Alert className="mb-4">
        <AlertDescription>
          Collections group related objects together. Entity collections group entities,
          event collections can represent complex events or patterns, and time collections
          define temporal patterns for habitual events.
        </AlertDescription>
      </Alert>

      <div className="rounded-lg border bg-card">
        <Tabs defaultValue="entities">
          <TabsList className="w-full">
            <TabsTrigger value="entities" className="flex items-center gap-1">
              <Package className="size-4" />
              Entity Collections ({entityCollections.length})
            </TabsTrigger>
            <TabsTrigger value="events" className="flex items-center gap-1">
              <Zap className="size-4" />
              Event Collections ({eventCollections.length})
            </TabsTrigger>
            <TabsTrigger value="times" className="flex items-center gap-1">
              <Clock className="size-4" />
              Time Patterns ({timeCollections.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="entities" className="p-6">
            <ul className="space-y-2">
              {entityCollections.map((collection) => (
                <React.Fragment key={collection.id}>
                  <li className="flex items-center justify-between py-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{collection.name}</span>
                        <Badge variant="outline">{collection.entityIds.length} entities</Badge>
                        <Badge variant="outline">{collection.collectionType}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {collection.aggregateProperties?.homogeneous && 'Homogeneous \u2022 '}
                        {collection.aggregateProperties?.ordered && 'Ordered \u2022 '}
                        {collection.typeAssignments.length} type assignments
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleEditEntityCollection(collection)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => deleteEntityCollection(collection.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </li>
                  <Separator />
                </React.Fragment>
              ))}
            </ul>
            <Button
              className="fixed bottom-6 right-6 rounded-full size-12"
              variant="secondary"
              size="icon"
              aria-label="add entity collection"
              onClick={() => {
                setSelectedEntityCollection(null)
                setEntityCollectionEditorOpen(true)
              }}
            >
              <Plus className="size-5" />
            </Button>
          </TabsContent>

          <TabsContent value="events" className="p-6">
            <ul className="space-y-2">
              {eventCollections.map((collection) => (
                <React.Fragment key={collection.id}>
                  <li className="flex items-center justify-between py-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{collection.name}</span>
                        <Badge variant="outline">{collection.eventIds.length} events</Badge>
                        <Badge variant="outline">{collection.collectionType}</Badge>
                        {collection.timeCollectionId && (
                          <Badge variant="outline">
                            <Clock className="mr-1 size-3" />
                            has time pattern
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {collection.typeAssignments.length} type assignments
                        {collection.structure && ' \u2022 Has structure'}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleEditEventCollection(collection)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => deleteEventCollection(collection.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </li>
                  <Separator />
                </React.Fragment>
              ))}
            </ul>
            <Button
              className="fixed bottom-6 right-6 rounded-full size-12"
              variant="secondary"
              size="icon"
              aria-label="add event collection"
              onClick={() => {
                setSelectedEventCollection(null)
                setEventCollectionEditorOpen(true)
              }}
            >
              <Plus className="size-5" />
            </Button>
          </TabsContent>

          <TabsContent value="times" className="p-6">
            <ul className="space-y-2">
              {timeCollections.map((collection) => (
                <React.Fragment key={collection.id}>
                  <li className="flex items-center justify-between py-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{collection.name}</span>
                        <Badge variant="outline">{collection.times.length} times</Badge>
                        <Badge variant="outline">{collection.collectionType}</Badge>
                        {collection.habituality && (
                          <Badge variant="outline">
                            {collection.habituality.frequency}
                          </Badge>
                        )}
                      </div>
                      {collection.description && (
                        <p className="text-sm text-muted-foreground mt-1">{collection.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleEditTimeCollection(collection)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => deleteTimeCollection(collection.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </li>
                  <Separator />
                </React.Fragment>
              ))}
            </ul>
            <Button
              className="fixed bottom-6 right-6 rounded-full size-12"
              variant="secondary"
              size="icon"
              aria-label="add time collection"
              onClick={() => {
                setSelectedTimeCollection(null)
                setTimeCollectionEditorOpen(true)
              }}
            >
              <Plus className="size-5" />
            </Button>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      {entityCollectionEditorOpen && (
        <EntityCollectionEditor
          open={entityCollectionEditorOpen}
          onClose={() => {
            setEntityCollectionEditorOpen(false)
            setSelectedEntityCollection(null)
          }}
          collection={selectedEntityCollection}
        />
      )}

      {eventCollectionEditorOpen && (
        <EventCollectionEditor
          open={eventCollectionEditorOpen}
          onClose={() => {
            setEventCollectionEditorOpen(false)
            setSelectedEventCollection(null)
          }}
          collection={selectedEventCollection}
        />
      )}

      {timeCollectionEditorOpen && (
        <TimeCollectionEditorDialog
          open={timeCollectionEditorOpen}
          onClose={() => {
            setTimeCollectionEditorOpen(false)
            setSelectedTimeCollection(null)
          }}
          collection={selectedTimeCollection}
        />
      )}
    </div>
  )
}
