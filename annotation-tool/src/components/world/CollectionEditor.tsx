import { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
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
import { RootState, AppDispatch } from '../../store/store'
import { addEntityCollection, updateEntityCollection, addEventCollection, updateEventCollection } from '../../store/worldSlice'
import { EntityCollection, EventCollection, GlossItem } from '../../models/types'
import GlossEditor from '../GlossEditor'
import { TypeObjectBadge } from '../shared/TypeObjectToggle'

interface CollectionEditorProps {
  open: boolean
  onClose: () => void
  collection?: EntityCollection | EventCollection | null
  collectionType?: 'entity' | 'event'
}

export default function CollectionEditor({ open, onClose, collection, collectionType: initialType }: CollectionEditorProps) {
  const dispatch = useDispatch<AppDispatch>()
  const { entities, events } = useSelector((state: RootState) => state.world)
  const { activePersonaId } = useSelector((state: RootState) => state.persona)

  const [collectionType, setCollectionType] = useState<'entity' | 'event'>(initialType || 'entity')
  const [name, setName] = useState('')
  const [description, setDescription] = useState<GlossItem[]>([{ type: 'text', content: '' }])
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [entityCollectionType, setEntityCollectionType] = useState<'group' | 'kind' | 'functional' | 'stage' | 'portion' | 'variant'>('group')
  const [eventCollectionType, setEventCollectionType] = useState<'sequence' | 'iteration' | 'complex' | 'alternative' | 'group'>('sequence')

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
  }, [collection, initialType])

  const handleSave = () => {
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
        dispatch(updateEntityCollection({
          ...collection,
          ...entityCollectionData,
          updatedAt: now
        }))
      } else {
        dispatch(addEntityCollection(entityCollectionData))
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
        dispatch(updateEventCollection({
          ...collection,
          ...eventCollectionData,
          updatedAt: now
        }))
      } else {
        dispatch(addEventCollection(eventCollectionData))
      }
    }

    onClose()
  }

  const availableMembers = collectionType === 'entity' ? entities : events
  const selectedMemberObjects = availableMembers.filter(m => selectedMembers.includes(m.id))

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
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
                onChange={(e) => setEntityCollectionType(e.target.value as any)}
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
                onChange={(e) => setEventCollectionType(e.target.value as any)}
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
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          color="secondary"
          disabled={!name || description.length === 0}
        >
          {collection ? 'Update' : 'Create'} Collection
        </Button>
      </DialogActions>
    </Dialog>
  )
}
