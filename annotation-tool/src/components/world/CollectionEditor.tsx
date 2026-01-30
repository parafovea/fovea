import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  Chip,
  Divider,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material'
import {
  Collections as CollectionIcon,
  Person as EntityIcon,
  Event as EventIcon,
} from '@mui/icons-material'
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

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CollectionIcon color="secondary" />
          {collection ? 'Edit Collection' : 'Create Collection'}
          <TypeObjectBadge isType={false} />
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <Alert severity="info" icon={<CollectionIcon />}>
            A collection groups multiple {collectionType === 'entity' ? 'entities' : 'events'} together with a semantic relationship.
          </Alert>

          {/* Collection Type Selector */}
          {!collection && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Collection Type
              </Typography>
              <ToggleButtonGroup
                value={collectionType}
                exclusive
                onChange={(_, value) => {
                  if (value) {
                    setCollectionType(value)
                    setSelectedMembers([])
                  }
                }}
                fullWidth
              >
                <ToggleButton value="entity">
                  <EntityIcon sx={{ mr: 1 }} />
                  Entity Collection
                </ToggleButton>
                <ToggleButton value="event">
                  <EventIcon sx={{ mr: 1 }} />
                  Event Collection
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          )}

          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            helperText="The name of this collection"
          />

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Description
            </Typography>
            <GlossEditor
              gloss={description}
              onChange={setDescription}
              personaId={activePersonaId}
            />
          </Box>

          {/* Collection Subtype Selector */}
          <FormControl fullWidth>
            <InputLabel>Collection Subtype</InputLabel>
            {collectionType === 'entity' ? (
              <Select
                value={entityCollectionType}
                onChange={(e) => setEntityCollectionType(e.target.value as EntityCollectionTypeOption)}
                label="Collection Subtype"
              >
                <MenuItem value="group">Group - A set of related entities</MenuItem>
                <MenuItem value="kind">Kind - Entities of the same type</MenuItem>
                <MenuItem value="functional">Functional - Entities serving a purpose</MenuItem>
                <MenuItem value="stage">Stage - Entities in a developmental stage</MenuItem>
                <MenuItem value="portion">Portion - Part of a larger whole</MenuItem>
                <MenuItem value="variant">Variant - Different versions</MenuItem>
              </Select>
            ) : (
              <Select
                value={eventCollectionType}
                onChange={(e) => setEventCollectionType(e.target.value as EventCollectionTypeOption)}
                label="Collection Subtype"
              >
                <MenuItem value="sequence">Sequence - Ordered events</MenuItem>
                <MenuItem value="iteration">Iteration - Repeating events</MenuItem>
                <MenuItem value="complex">Complex - Nested event structure</MenuItem>
                <MenuItem value="alternative">Alternative - Mutually exclusive</MenuItem>
                <MenuItem value="group">Group - Related events</MenuItem>
              </Select>
            )}
          </FormControl>

          <Divider />

          {/* Member Selection */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {collectionType === 'entity' ? 'Entities' : 'Events'} ({selectedMembers.length})
            </Typography>
            <Typography variant="caption" color="text.secondary" paragraph>
              Select {collectionType === 'entity' ? 'entities' : 'events'} to include in this collection
            </Typography>

            <Autocomplete
              multiple
              options={availableMembers}
              getOptionLabel={(option) => option.name}
              value={selectedMemberObjects}
              onChange={(_, newValue) => {
                setSelectedMembers(newValue.map(m => m.id))
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={`Select ${collectionType === 'entity' ? 'Entities' : 'Events'}`}
                  placeholder={`Search ${collectionType === 'entity' ? 'entities' : 'events'}...`}
                />
              )}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    label={option.name}
                    {...getTagProps({ index })}
                    color="primary"
                    variant="outlined"
                  />
                ))
              }
              isOptionEqualToValue={(option, value) => option.id === value.id}
            />

            {selectedMembers.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Selected members:
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                  {selectedMemberObjects.map(member => (
                    <Chip
                      key={member.id}
                      label={member.name}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3 }}>
        <Box>
          {!collection && (
            <SaveStatusIndicator
              status={saveStatus}
              lastSavedAt={lastSavedAt}
              errorMessage={errorMessage}
              retryCount={retryCount}
              onRetry={forceSave}
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={handleCancel}>Cancel</Button>
          {collection ? (
            <Button
              onClick={handleSave}
              variant="contained"
              color="secondary"
              disabled={!name || description.length === 0}
            >
              Update Collection
            </Button>
          ) : (
            <Button
              onClick={handleDone}
              variant="contained"
              color="secondary"
              disabled={!name || description.length === 0 || !autoCreatedCollectionId}
            >
              Done
            </Button>
          )}
        </Box>
      </DialogActions>
    </Dialog>
  )
}
