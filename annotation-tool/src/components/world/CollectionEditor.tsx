import { useState, useEffect, useRef } from 'react'
import { Library, User, CalendarDays } from 'lucide-react'
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
import {
  useWorld,
  useAddEntityCollection,
  useUpdateEntityCollection,
  useDeleteEntityCollection,
  useAddEventCollection,
  useUpdateEventCollection,
  useDeleteEventCollection,
} from '@store/queries'
import { useAnnotationUiStore } from '@store/zustand/annotationUiStore'
import { EntityCollection, EventCollection, GlossItem } from '@models/types'
import GlossEditor from '@components/ontology/GlossEditor'
import { TypeObjectBadge } from '../shared/TypeObjectToggle'
import { useAutoSave, SaveStatusIndicator } from '../../hooks/data'

/** Entity collection type options */
type EntityCollectionTypeOption = 'group' | 'kind' | 'functional' | 'stage' | 'portion' | 'variant'

/** Event collection type options */
type EventCollectionTypeOption = 'sequence' | 'iteration' | 'complex' | 'alternative' | 'group'

interface CollectionEditorProps {
  open: boolean
  onClose: () => void
  collection?: EntityCollection | EventCollection | null
  collectionType?: 'entity' | 'event'
}

export default function CollectionEditor({ open, onClose, collection, collectionType: initialType }: CollectionEditorProps) {
  const { data: worldData } = useWorld()
  const entities = worldData?.entities ?? []
  const events = worldData?.events ?? []

  // Active persona from Zustand store
  const activePersonaId = useAnnotationUiStore((state) => state.selectedPersonaId)

  const { mutateAsync: addEntityCollection } = useAddEntityCollection()
  const { mutateAsync: updateEntityCollection } = useUpdateEntityCollection()
  const { mutate: deleteEntityCollection } = useDeleteEntityCollection()
  const { mutateAsync: addEventCollection } = useAddEventCollection()
  const { mutateAsync: updateEventCollection } = useUpdateEventCollection()
  const { mutate: deleteEventCollection } = useDeleteEventCollection()

  const [collectionType, setCollectionType] = useState<'entity' | 'event'>(initialType || 'entity')
  const [name, setName] = useState('')
  const [description, setDescription] = useState<GlossItem[]>([{ type: 'text', content: '' }])
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [entityCollectionType, setEntityCollectionType] = useState<'group' | 'kind' | 'functional' | 'stage' | 'portion' | 'variant'>('group')
  const [eventCollectionType, setEventCollectionType] = useState<'sequence' | 'iteration' | 'complex' | 'alternative' | 'group'>('sequence')

  // Track auto-created collection ID for cancel cleanup
  const [autoCreatedCollectionId, setAutoCreatedCollectionId] = useState<string | null>(null)
  const autoCreatedIdRef = useRef<string | null>(null)

  // Keep ref in sync with state for callbacks
  useEffect(() => {
    autoCreatedIdRef.current = autoCreatedCollectionId
  }, [autoCreatedCollectionId])

  // Auto-save hook for new collections
  const { saveStatus, lastSavedAt, errorMessage, retryCount, forceSave } = useAutoSave({
    data: { name, description, selectedMembers, collectionType, entityCollectionType, eventCollectionType },
    isEnabled: open && !!name && !collection, // Only for new collections, require name
    onSave: async (collectionData) => {
      const now = new Date().toISOString()

      if (collectionData.collectionType === 'entity') {
        const entityCollectionData: Omit<EntityCollection, 'id' | 'createdAt' | 'updatedAt'> = {
          name: collectionData.name,
          description: collectionData.description,
          entityIds: collectionData.selectedMembers,
          collectionType: collectionData.entityCollectionType,
          typeAssignments: [],
          metadata: {},
        }

        if (autoCreatedIdRef.current) {
          // Update the auto-created collection
          await updateEntityCollection({
            id: autoCreatedIdRef.current,
            createdAt: now,
            updatedAt: now,
            ...entityCollectionData,
          })
        } else {
          // Create new collection and track ID
          const result = await addEntityCollection(entityCollectionData)
          // Get the newly created collection ID from the result
          const newCollection = result.entityCollections[result.entityCollections.length - 1]
          if (newCollection) {
            setAutoCreatedCollectionId(newCollection.id)
          }
        }
      } else {
        const eventCollectionData: Omit<EventCollection, 'id' | 'createdAt' | 'updatedAt'> = {
          name: collectionData.name,
          description: collectionData.description,
          eventIds: collectionData.selectedMembers,
          collectionType: collectionData.eventCollectionType,
          typeAssignments: [],
          metadata: {},
        }

        if (autoCreatedIdRef.current) {
          // Update the auto-created collection
          await updateEventCollection({
            id: autoCreatedIdRef.current,
            createdAt: now,
            updatedAt: now,
            ...eventCollectionData,
          })
        } else {
          // Create new collection and track ID
          const result = await addEventCollection(eventCollectionData)
          // Get the newly created collection ID from the result
          const newCollection = result.eventCollections[result.eventCollections.length - 1]
          if (newCollection) {
            setAutoCreatedCollectionId(newCollection.id)
          }
        }
      }
    },
    entityType: 'world-object',
    entityId: collection?.id || autoCreatedIdRef.current || undefined,
  })

  useEffect(() => {
    if (collection) {
      setName(collection.name)
      setDescription(collection.description)

      if ('entityIds' in collection) {
        setCollectionType('entity')
        setSelectedMembers(collection.entityIds)
        setEntityCollectionType(collection.collectionType)
      } else if ('eventIds' in collection) {
        setCollectionType('event')
        setSelectedMembers(collection.eventIds)
        setEventCollectionType(collection.collectionType)
      }
    } else {
      // Reset for new collection
      setCollectionType(initialType || 'entity')
      setName('')
      setDescription([{ type: 'text', content: '' }])
      setSelectedMembers([])
      setEntityCollectionType('group')
      setEventCollectionType('sequence')
    }
    // Reset auto-created ID when dialog opens/closes or collection changes
    setAutoCreatedCollectionId(null)
  }, [collection, initialType, open])

  const handleSave = async () => {
    const now = new Date().toISOString()

    if (collectionType === 'entity') {
      const entityCollectionData: Omit<EntityCollection, 'id' | 'createdAt' | 'updatedAt'> = {
        name,
        description,
        entityIds: selectedMembers,
        collectionType: entityCollectionType,
        typeAssignments: [],
        metadata: {},
      }

      if (collection && 'entityIds' in collection) {
        await updateEntityCollection({
          ...collection,
          ...entityCollectionData,
          updatedAt: now
        })
      } else {
        await addEntityCollection(entityCollectionData)
      }
    } else {
      const eventCollectionData: Omit<EventCollection, 'id' | 'createdAt' | 'updatedAt'> = {
        name,
        description,
        eventIds: selectedMembers,
        collectionType: eventCollectionType,
        typeAssignments: [],
        metadata: {},
      }

      if (collection && 'eventIds' in collection) {
        await updateEventCollection({
          ...collection,
          ...eventCollectionData,
          updatedAt: now
        })
      } else {
        await addEventCollection(eventCollectionData)
      }
    }

    onClose()
  }

  // Cancel handler deletes auto-created collection
  const handleCancel = () => {
    if (autoCreatedIdRef.current) {
      if (collectionType === 'entity') {
        deleteEntityCollection(autoCreatedIdRef.current)
      } else {
        deleteEventCollection(autoCreatedIdRef.current)
      }
    }
    setAutoCreatedCollectionId(null)
    onClose()
  }

  // Done handler keeps the collection (already saved via autosave)
  const handleDone = async () => {
    // Force save any pending changes before closing
    if (!collection && autoCreatedIdRef.current) {
      await forceSave()
    }
    setAutoCreatedCollectionId(null)
    onClose()
  }

  const availableMembers = collectionType === 'entity' ? entities : events
  const selectedMemberObjects = availableMembers.filter(m => selectedMembers.includes(m.id))

  const toggleMember = (id: string) => {
    setSelectedMembers(prev =>
      prev.includes(id)
        ? prev.filter(m => m !== id)
        : [...prev, id]
    )
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCancel() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="size-5 text-secondary" />
            {collection ? 'Edit Collection' : 'Create Collection'}
            <TypeObjectBadge isType={false} />
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Alert>
            <Library className="size-4" />
            <AlertDescription>
              A collection groups multiple {collectionType === 'entity' ? 'entities' : 'events'} together with a semantic relationship.
            </AlertDescription>
          </Alert>

          {/* Collection Type Selector */}
          {!collection && (
            <div className="space-y-1">
              <Label>Collection Type</Label>
              <ToggleGroup
                value={[collectionType]}
                onValueChange={(value) => {
                  if (value.length > 0) {
                    setCollectionType(value[0] as 'entity' | 'event')
                    setSelectedMembers([])
                  }
                }}
                className="w-full"
              >
                <ToggleGroupItem value="entity" className="flex flex-1 items-center gap-1">
                  <User className="size-4" />
                  Entity Collection
                </ToggleGroupItem>
                <ToggleGroupItem value="event" className="flex flex-1 items-center gap-1">
                  <CalendarDays className="size-4" />
                  Event Collection
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="collection-name">Name *</Label>
            <Input
              id="collection-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Collection name"
            />
            <p className="text-xs text-muted-foreground">The name of this collection</p>
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <GlossEditor
              gloss={description}
              onChange={setDescription}
              personaId={activePersonaId}
            />
          </div>

          {/* Collection Subtype Selector */}
          <div className="space-y-1">
            <Label>Collection Subtype</Label>
            {collectionType === 'entity' ? (
              <Select value={entityCollectionType} onValueChange={(value) => setEntityCollectionType(value as EntityCollectionTypeOption)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="group">Group - A set of related entities</SelectItem>
                  <SelectItem value="kind">Kind - Entities of the same type</SelectItem>
                  <SelectItem value="functional">Functional - Entities serving a purpose</SelectItem>
                  <SelectItem value="stage">Stage - Entities in a developmental stage</SelectItem>
                  <SelectItem value="portion">Portion - Part of a larger whole</SelectItem>
                  <SelectItem value="variant">Variant - Different versions</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Select value={eventCollectionType} onValueChange={(value) => setEventCollectionType(value as EventCollectionTypeOption)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequence">Sequence - Ordered events</SelectItem>
                  <SelectItem value="iteration">Iteration - Repeating events</SelectItem>
                  <SelectItem value="complex">Complex - Nested event structure</SelectItem>
                  <SelectItem value="alternative">Alternative - Mutually exclusive</SelectItem>
                  <SelectItem value="group">Group - Related events</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          <Separator />

          {/* Member Selection */}
          <div className="space-y-2">
            <Label>
              {collectionType === 'entity' ? 'Entities' : 'Events'} ({selectedMembers.length})
            </Label>
            <p className="text-xs text-muted-foreground">
              Select {collectionType === 'entity' ? 'entities' : 'events'} to include in this collection
            </p>

            <div className="max-h-48 overflow-y-auto rounded-lg border p-2 space-y-1">
              {availableMembers.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => toggleMember(member.id)}
                  className={`w-full text-left px-2 py-1 rounded text-sm transition-colors ${
                    selectedMembers.includes(member.id)
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted'
                  }`}
                >
                  {member.name}
                </button>
              ))}
            </div>

            {selectedMembers.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">
                  Selected members:
                </span>
                <div className="flex flex-wrap gap-1">
                  {selectedMemberObjects.map(member => (
                    <Badge
                      key={member.id}
                      variant="outline"
                    >
                      {member.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="flex items-center justify-between">
          <div>
            {!collection && (
              <SaveStatusIndicator
                status={saveStatus}
                lastSavedAt={lastSavedAt}
                errorMessage={errorMessage}
                retryCount={retryCount}
                onRetry={forceSave}
              />
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCancel}>Cancel</Button>
            {collection ? (
              <Button
                variant="secondary"
                onClick={handleSave}
                disabled={!name || description.length === 0}
              >
                Update Collection
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={handleDone}
                disabled={!name || description.length === 0 || !autoCreatedCollectionId}
              >
                Done
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
