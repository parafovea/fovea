import React, { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import {
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  Fab,
} from '@mui/material'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  GroupWork as CollectionIcon,
  FlashOn as EventIcon,
  Inventory2 as EntityIcon,
  AccessTime as TimeIcon,
} from '@mui/icons-material'
import { RootState, AppDispatch } from '../../store/store'
import {
  addEntityCollection,
  updateEntityCollection,
  deleteEntityCollection,
  addEventCollection,
  updateEventCollection,
  deleteEventCollection,
  addTimeCollection,
  updateTimeCollection,
  deleteTimeCollection,
} from '../../store/worldSlice'
import {
  EntityCollection,
  EventCollection,
  TimeCollection,
  GlossItem,
} from '../../models/types'
import GlossEditor from '../GlossEditor'
import { TypeObjectBadge } from '../shared/TypeObjectToggle'

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`collection-tabpanel-${index}`}
      aria-labelledby={`collection-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  )
}

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
  const dispatch = useDispatch<AppDispatch>()
  const { entities } = useSelector((state: RootState) => state.world)
  
  const [name, setName] = useState(collection?.name || '')
  const [description, setDescription] = useState<GlossItem[]>(
    collection?.description || [{ type: 'text', content: '' }]
  )
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>(
    collection?.entityIds || []
  )
  const [collectionType, setCollectionType] = useState<string>(
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
      collectionType: collectionType as any,
      typeAssignments: collection?.typeAssignments || [],
      aggregateProperties: {
        homogeneous,
        ordered,
        mereological: 'mixed',
      },
      metadata: {},
    }

    if (collection) {
      dispatch(updateEntityCollection({ ...collection, ...collectionData }))
    } else {
      dispatch(addEntityCollection(collectionData))
    }

    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CollectionIcon color="secondary" />
          {collection ? 'Edit' : 'Create'} Entity Collection
          <TypeObjectBadge isType={false} />
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <TextField
            label="Collection Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
          />

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Description
            </Typography>
            <GlossEditor
              gloss={description}
              onChange={setDescription}
              personaId={null}
            />
          </Box>

          <FormControl fullWidth>
            <InputLabel>Collection Type</InputLabel>
            <Select
              value={collectionType}
              onChange={(e) => setCollectionType(e.target.value)}
              label="Collection Type"
            >
              <MenuItem value="group">Group (set of entities)</MenuItem>
              <MenuItem value="kind">Kind (entities of same type)</MenuItem>
              <MenuItem value="functional">Functional (entities with shared function)</MenuItem>
              <MenuItem value="stage">Stage (temporal slice)</MenuItem>
              <MenuItem value="portion">Portion (part of whole)</MenuItem>
              <MenuItem value="variant">Variant (alternative versions)</MenuItem>
            </Select>
          </FormControl>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Entities in Collection
            </Typography>
            <FormControl fullWidth>
              <InputLabel>Select Entities</InputLabel>
              <Select
                multiple
                value={selectedEntityIds}
                onChange={(e) => setSelectedEntityIds(e.target.value as string[])}
                label="Select Entities"
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((id) => {
                      const entity = entities.find(e => e.id === id)
                      return (
                        <Chip key={id} label={entity?.name || 'Unknown'} size="small" />
                      )
                    })}
                  </Box>
                )}
              >
                {entities.map((entity) => (
                  <MenuItem key={entity.id} value={entity.id}>
                    {entity.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Properties
            </Typography>
            <ToggleButtonGroup
              value={[
                ...(homogeneous ? ['homogeneous'] : []),
                ...(ordered ? ['ordered'] : []),
              ]}
              onChange={(_, newFormats) => {
                setHomogeneous(newFormats.includes('homogeneous'))
                setOrdered(newFormats.includes('ordered'))
              }}
            >
              <ToggleButton value="homogeneous">
                Homogeneous (same type)
              </ToggleButton>
              <ToggleButton value="ordered">
                Ordered (sequence matters)
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          color="secondary"
          disabled={!name || selectedEntityIds.length === 0}
        >
          {collection ? 'Update' : 'Create'} Collection
        </Button>
      </DialogActions>
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
  const dispatch = useDispatch<AppDispatch>()
  const { events, timeCollections } = useSelector((state: RootState) => state.world)
  
  const [name, setName] = useState(collection?.name || '')
  const [description, setDescription] = useState<GlossItem[]>(
    collection?.description || [{ type: 'text', content: '' }]
  )
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>(
    collection?.eventIds || []
  )
  const [collectionType, setCollectionType] = useState<string>(
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
      collectionType: collectionType as any,
      typeAssignments: collection?.typeAssignments || [],
      timeCollectionId: timeCollectionId || undefined,
      structure: collection?.structure,
      metadata: {},
    }

    if (collection) {
      dispatch(updateEventCollection({ ...collection, ...collectionData }))
    } else {
      dispatch(addEventCollection(collectionData))
    }

    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CollectionIcon color="secondary" />
          {collection ? 'Edit' : 'Create'} Event Collection
          <TypeObjectBadge isType={false} />
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <TextField
            label="Collection Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
          />

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Description
            </Typography>
            <GlossEditor
              gloss={description}
              onChange={setDescription}
              personaId={null}
            />
          </Box>

          <FormControl fullWidth>
            <InputLabel>Collection Type</InputLabel>
            <Select
              value={collectionType}
              onChange={(e) => setCollectionType(e.target.value)}
              label="Collection Type"
            >
              <MenuItem value="sequence">Sequence (ordered events)</MenuItem>
              <MenuItem value="iteration">Iteration (repeated pattern)</MenuItem>
              <MenuItem value="complex">Complex (structured events)</MenuItem>
              <MenuItem value="alternative">Alternative (options)</MenuItem>
              <MenuItem value="group">Group (unordered set)</MenuItem>
            </Select>
          </FormControl>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Events in Collection
            </Typography>
            <FormControl fullWidth>
              <InputLabel>Select Events</InputLabel>
              <Select
                multiple
                value={selectedEventIds}
                onChange={(e) => setSelectedEventIds(e.target.value as string[])}
                label="Select Events"
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((id) => {
                      const event = events.find(e => e.id === id)
                      return (
                        <Chip key={id} label={event?.name || 'Unknown'} size="small" />
                      )
                    })}
                  </Box>
                )}
              >
                {events.map((event) => (
                  <MenuItem key={event.id} value={event.id}>
                    {event.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {collectionType === 'iteration' && (
            <FormControl fullWidth>
              <InputLabel>Time Pattern</InputLabel>
              <Select
                value={timeCollectionId}
                onChange={(e) => setTimeCollectionId(e.target.value)}
                label="Time Pattern"
              >
                <MenuItem value="">None</MenuItem>
                {timeCollections.map((tc) => (
                  <MenuItem key={tc.id} value={tc.id}>
                    {tc.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          color="secondary"
          disabled={!name || selectedEventIds.length === 0}
        >
          {collection ? 'Update' : 'Create'} Collection
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// Time Collection Editor (for patterns)
function TimeCollectionEditor({
  open,
  onClose,
  collection,
}: {
  open: boolean
  onClose: () => void
  collection: TimeCollection | null
}) {
  const dispatch = useDispatch<AppDispatch>()
  const { times } = useSelector((state: RootState) => state.world)
  
  const [name, setName] = useState(collection?.name || '')
  const [description, setDescription] = useState(collection?.description || '')
  const [selectedTimeIds, setSelectedTimeIds] = useState<string[]>(
    collection?.times?.map(t => t.id) || []
  )
  const [collectionType, setCollectionType] = useState<string>(
    collection?.collectionType || 'periodic'
  )
  const [frequency, setFrequency] = useState(
    collection?.habituality?.frequency || 'sometimes'
  )

  const handleSave = () => {
    const collectionData: Omit<TimeCollection, 'id'> = {
      name,
      description,
      times: times.filter(t => selectedTimeIds.includes(t.id)),
      collectionType: collectionType as any,
      habituality: {
        frequency: frequency as any,
        typicality: 0.5,
      },
      metadata: {},
    }

    if (collection) {
      dispatch(updateTimeCollection({ ...collection, ...collectionData }))
    } else {
      dispatch(addTimeCollection(collectionData))
    }

    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TimeIcon color="secondary" />
          {collection ? 'Edit' : 'Create'} Time Collection
          <TypeObjectBadge isType={false} />
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <TextField
            label="Collection Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
          />

          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />

          <FormControl fullWidth>
            <InputLabel>Collection Type</InputLabel>
            <Select
              value={collectionType}
              onChange={(e) => setCollectionType(e.target.value)}
              label="Collection Type"
            >
              <MenuItem value="periodic">Periodic (regular intervals)</MenuItem>
              <MenuItem value="cyclical">Cyclical (repeating cycle)</MenuItem>
              <MenuItem value="calendar">Calendar (date-based)</MenuItem>
              <MenuItem value="irregular">Irregular (no pattern)</MenuItem>
              <MenuItem value="anchored">Anchored (event-based)</MenuItem>
            </Select>
          </FormControl>

          {(collectionType === 'periodic' || collectionType === 'cyclical') && (
            <FormControl fullWidth>
              <InputLabel>Frequency</InputLabel>
              <Select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as 'always' | 'usually' | 'often' | 'sometimes' | 'rarely' | 'never')}
                label="Frequency"
              >
                <MenuItem value="always">Always</MenuItem>
                <MenuItem value="usually">Usually</MenuItem>
                <MenuItem value="often">Often</MenuItem>
                <MenuItem value="sometimes">Sometimes</MenuItem>
                <MenuItem value="rarely">Rarely</MenuItem>
                <MenuItem value="never">Never</MenuItem>
              </Select>
            </FormControl>
          )}

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Times in Collection
            </Typography>
            <FormControl fullWidth>
              <InputLabel>Select Times</InputLabel>
              <Select
                multiple
                value={selectedTimeIds}
                onChange={(e) => setSelectedTimeIds(e.target.value as string[])}
                label="Select Times"
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((id) => {
                      const time = times.find(t => t.id === id)
                      return (
                        <Chip 
                          key={id} 
                          label={time ? `${time.type} time` : 'Unknown'} 
                          size="small" 
                        />
                      )
                    })}
                  </Box>
                )}
              >
                {times.map((time) => (
                  <MenuItem key={time.id} value={time.id}>
                    {time.type === 'instant' 
                      ? `Instant: ${(time as any).timestamp || 'unspecified'}`
                      : `Interval: ${(time as any).startTime || '?'} - ${(time as any).endTime || '?'}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          color="secondary"
          disabled={!name}
        >
          {collection ? 'Update' : 'Create'} Collection
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// Main CollectionBuilder Component
export default function CollectionBuilder() {
  const dispatch = useDispatch<AppDispatch>()
  const { entityCollections, eventCollections, timeCollections } = useSelector(
    (state: RootState) => state.world
  )
  
  const [tabValue, setTabValue] = useState(0)
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
    <Box sx={{ width: '100%' }}>
      <Paper sx={{ mb: 2, p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <CollectionIcon fontSize="large" color="secondary" />
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5">Collection Builder</Typography>
            <Typography variant="body2" color="text.secondary">
              Create and manage collections of entities, events, and times
            </Typography>
          </Box>
          <TypeObjectBadge isType={false} />
        </Box>
      </Paper>

      <Alert severity="info" sx={{ mb: 2 }}>
        Collections group related objects together. Entity collections group entities,
        event collections can represent complex events or patterns, and time collections
        define temporal patterns for habitual events.
      </Alert>

      <Paper sx={{ width: '100%' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} aria-label="collection tabs">
            <Tab 
              label={`Entity Collections (${entityCollections.length})`} 
              icon={<EntityIcon />} 
              iconPosition="start" 
            />
            <Tab 
              label={`Event Collections (${eventCollections.length})`} 
              icon={<EventIcon />} 
              iconPosition="start" 
            />
            <Tab 
              label={`Time Patterns (${timeCollections.length})`} 
              icon={<TimeIcon />} 
              iconPosition="start" 
            />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          <List>
            {entityCollections.map((collection) => (
              <React.Fragment key={collection.id}>
                <ListItem>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography>{collection.name}</Typography>
                        <Chip 
                          label={`${collection.entityIds.length} entities`} 
                          size="small" 
                        />
                        <Chip 
                          label={collection.collectionType} 
                          size="small" 
                          variant="outlined"
                        />
                      </Box>
                    }
                    secondary={
                      <Typography variant="body2" color="text.secondary">
                        {collection.aggregateProperties?.homogeneous && 'Homogeneous • '}
                        {collection.aggregateProperties?.ordered && 'Ordered • '}
                        {collection.typeAssignments.length} type assignments
                      </Typography>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton 
                      edge="end" 
                      onClick={() => handleEditEntityCollection(collection)}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton 
                      edge="end" 
                      onClick={() => dispatch(deleteEntityCollection(collection.id))}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
                <Divider />
              </React.Fragment>
            ))}
          </List>
          <Fab
            color="secondary"
            aria-label="add entity collection"
            sx={{ position: 'fixed', bottom: 24, right: 24 }}
            onClick={() => {
              setSelectedEntityCollection(null)
              setEntityCollectionEditorOpen(true)
            }}
          >
            <AddIcon />
          </Fab>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <List>
            {eventCollections.map((collection) => (
              <React.Fragment key={collection.id}>
                <ListItem>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography>{collection.name}</Typography>
                        <Chip 
                          label={`${collection.eventIds.length} events`} 
                          size="small" 
                        />
                        <Chip 
                          label={collection.collectionType} 
                          size="small" 
                          variant="outlined"
                        />
                        {collection.timeCollectionId && (
                          <Chip 
                            label="has time pattern" 
                            size="small" 
                            icon={<TimeIcon />}
                            variant="outlined"
                          />
                        )}
                      </Box>
                    }
                    secondary={
                      <Typography variant="body2" color="text.secondary">
                        {collection.typeAssignments.length} type assignments
                        {collection.structure && ' • Has structure'}
                      </Typography>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton 
                      edge="end" 
                      onClick={() => handleEditEventCollection(collection)}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton 
                      edge="end" 
                      onClick={() => dispatch(deleteEventCollection(collection.id))}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
                <Divider />
              </React.Fragment>
            ))}
          </List>
          <Fab
            color="secondary"
            aria-label="add event collection"
            sx={{ position: 'fixed', bottom: 24, right: 24 }}
            onClick={() => {
              setSelectedEventCollection(null)
              setEventCollectionEditorOpen(true)
            }}
          >
            <AddIcon />
          </Fab>
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <List>
            {timeCollections.map((collection) => (
              <React.Fragment key={collection.id}>
                <ListItem>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography>{collection.name}</Typography>
                        <Chip 
                          label={`${collection.times.length} times`} 
                          size="small" 
                        />
                        <Chip 
                          label={collection.collectionType} 
                          size="small" 
                          variant="outlined"
                        />
                        {collection.habituality && (
                          <Chip 
                            label={collection.habituality.frequency} 
                            size="small" 
                            color="primary"
                            variant="outlined"
                          />
                        )}
                      </Box>
                    }
                    secondary={collection.description}
                  />
                  <ListItemSecondaryAction>
                    <IconButton 
                      edge="end" 
                      onClick={() => handleEditTimeCollection(collection)}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton 
                      edge="end" 
                      onClick={() => dispatch(deleteTimeCollection(collection.id))}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
                <Divider />
              </React.Fragment>
            ))}
          </List>
          <Fab
            color="secondary"
            aria-label="add time collection"
            sx={{ position: 'fixed', bottom: 24, right: 24 }}
            onClick={() => {
              setSelectedTimeCollection(null)
              setTimeCollectionEditorOpen(true)
            }}
          >
            <AddIcon />
          </Fab>
        </TabPanel>
      </Paper>

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
        <TimeCollectionEditor
          open={timeCollectionEditorOpen}
          onClose={() => {
            setTimeCollectionEditorOpen(false)
            setSelectedTimeCollection(null)
          }}
          collection={selectedTimeCollection}
        />
      )}
    </Box>
  )
}