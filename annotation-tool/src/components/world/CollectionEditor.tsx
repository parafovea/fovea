import { useState, useEffect } from 'react'
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
  useAddEventCollection,
  useUpdateEventCollection,
} from '@store/queries'
import { useAnnotationUiStore } from '@store/zustand/annotationUiStore'
import { EntityCollection, EventCollection, GlossItem } from '@models/types'
import GlossEditor from '@components/ontology/GlossEditor'
import { TypeObjectBadge } from '../shared/TypeObjectToggle'
import { useUnsavedChangesPrompt } from '../../hooks/data'

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
  const { mutateAsync: addEventCollection } = useAddEventCollection()
  const { mutateAsync: updateEventCollection } = useUpdateEventCollection()

  const [collectionType, setCollectionType] = useState<'entity' | 'event'>(initialType || 'entity')
  const [name, setName] = useState('')
  const [description, setDescription] = useState<GlossItem[]>([{ type: 'text', content: '' }])
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [entityCollectionType, setEntityCollectionType] = useState<'group' | 'kind' | 'functional' | 'stage' | 'portion' | 'variant'>('group')
  const [eventCollectionType, setEventCollectionType] = useState<'sequence' | 'iteration' | 'complex' | 'alternative' | 'group'>('sequence')

  const isDirty = open && (
    collection
      ? name !== collection.name ||
        JSON.stringify(description) !== JSON.stringify(collection.description) ||
        JSON.stringify(selectedMembers) !== JSON.stringify(
          'entityIds' in collection ? collection.entityIds : collection.eventIds
        ) ||
        ('entityIds' in collection
          ? entityCollectionType !== collection.collectionType
          : eventCollectionType !== collection.collectionType)
      : !!name || selectedMembers.length > 0
  )

  const { confirmDiscard } = useUnsavedChangesPrompt({ isDirty })

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

  const handleCancel = () => {
    if (!confirmDiscard()) return
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
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button
            variant="secondary"
            onClick={handleSave}
            disabled={!name || description.length === 0}
          >
            {collection ? 'Update Collection' : 'Create Collection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
