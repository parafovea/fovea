import { useState, useRef, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Fab,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  TextField,
  InputAdornment,
  Paper,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Chip,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Person as EntityIcon,
  Event as EventIcon,
  Place as LocationIcon,
  Schedule as TimeIcon,
  Language as WikidataIcon,
  Collections as CollectionIcon,
} from '@mui/icons-material'
import { RootState, AppDispatch } from '../../store/store'
import { deleteEntity, deleteEvent, deleteTime, deleteEntityCollection, deleteEventCollection, loadWorldState, saveWorldState } from '../../store/worldSlice'
import { fetchPersonas, fetchPersonaOntology } from '../../store/personaSlice'
import { Entity, LocationPoint, LocationExtent, EntityCollection, EventCollection } from '../../models/types'
import EntityEditor from '../world/EntityEditor'
import EventEditor from '../world/EventEditor'
import LocationEditor from '../world/LocationEditor'
import TimeEditor from '../world/TimeEditor'
import CollectionEditor from '../world/CollectionEditor'
import { WikidataChip } from '../shared/WikidataChip'
import { useWorkspaceKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'

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
      id={`object-tabpanel-${index}`}
      aria-labelledby={`object-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  )
}

// Type guard to check if an Entity is a Location
function isLocation(entity: Entity): entity is LocationPoint | LocationExtent {
  return 'locationType' in entity
}

export default function ObjectWorkspace() {
  const dispatch = useDispatch<AppDispatch>()
  const { entities, events, times, entityCollections, eventCollections, timeCollections, relations } = useSelector((state: RootState) => state.world)
  const { personaOntologies } = useSelector((state: RootState) => state.persona)
  const locations = entities.filter(isLocation) // Locations are specialized entities
  
  const [tabValue, setTabValue] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [wikidataFilter, setWikidataFilter] = useState<'all' | 'wikidata' | 'manual'>('all')
  
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

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue)
    setSearchTerm('')
  }

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
      case 0:
        setSelectedEntity(null)
        setEntityEditorOpen(true)
        break
      case 1:
        setSelectedEvent(null)
        setEventEditorOpen(true)
        break
      case 2:
        setSelectedLocation(null)
        setLocationEditorOpen(true)
        break
      case 3:
        setSelectedTime(null)
        setTimeEditorOpen(true)
        break
      case 4:
        setSelectedCollection(null)
        setSelectedCollectionType('entity') // Default to entity collection
        setCollectionEditorOpen(true)
        break
    }
  }

  const filterByWikidata = (item: any) => {
    if (wikidataFilter === 'all') return true
    if (wikidataFilter === 'wikidata') return !!item.wikidataId
    if (wikidataFilter === 'manual') return !item.wikidataId
    return true
  }
  
  const searchMatches = (item: any, term: string) => {
    const lowerTerm = term.toLowerCase()

    // Extract description text from GlossItem array or plain string
    let descriptionText = ''
    if (Array.isArray(item.description)) {
      descriptionText = item.description.map((d: any) => d.content || '').join(' ')
    } else if (typeof item.description === 'string') {
      descriptionText = item.description
    }

    return (
      item.name?.toLowerCase().includes(lowerTerm) ||
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
  const filteredLocations = locations.filter((l: any) =>
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
    return entity.typeAssignments.map(assignment => {
      const ontology = personaOntologies.find(o => o.personaId === assignment.personaId)
      const entityType = ontology?.entities.find(e => e.id === assignment.entityTypeId)
      return entityType?.name || 'Unknown'
    }).join(', ')
  }

  const getEventTypeNames = (event: typeof events[0]) => {
    return event.personaInterpretations.map(interp => {
      const ontology = personaOntologies.find(o => o.personaId === interp.personaId)
      const eventType = ontology?.events.find(e => e.id === interp.eventTypeId)
      return eventType?.name || 'Unknown'
    }).join(', ')
  }
  
  const formatTimeDisplay = (time: typeof times[0]): string => {
    // Primary: Show label if available
    if (time.label) {
      return time.label
    }

    // Fallback: Format timestamp/interval
    if (time.type === 'instant') {
      const instant = time as any
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
      const interval = time as any
      if (interval.startTime && interval.endTime) {
        const start = new Date(interval.startTime)
        const end = new Date(interval.endTime)
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          const formatDate = (d: Date) => d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })
          return `${formatDate(start)} – ${formatDate(end)}`
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
      const instant = time as any
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
    
    return parts.join(' • ')
  }
  
  // Get the currently visible list items based on tab
  const getCurrentItems = () => {
    switch(tabValue) {
      case 0: return filteredEntities
      case 1: return filteredEvents
      case 2: return filteredLocations
      case 3: return filteredTimes
      case 4: return filteredAllCollections
      default: return []
    }
  }
  
  // Setup keyboard shortcuts
  useWorkspaceKeyboardShortcuts('objectWorkspace', {
    'object.new': () => handleAddNew(),
    'tab.next': () => setTabValue((prev) => (prev + 1) % 5),
    'tab.previous': () => setTabValue((prev) => (prev - 1 + 5) % 5),
    'item.edit': () => {
      const items = getCurrentItems()
      if (selectedItemIndex >= 0 && selectedItemIndex < items.length) {
        const item = items[selectedItemIndex] as any
        switch(tabValue) {
          case 0: handleEditEntity(item); break
          case 1: handleEditEvent(item); break
          case 2: handleEditLocation(item); break
          case 3: handleEditTime(item); break
          case 4:
            setSelectedCollection(item)
            setSelectedCollectionType('entityIds' in item ? 'entity' : 'event')
            setCollectionEditorOpen(true)
            break
        }
      }
    },
    'item.delete': () => {
      const items = getCurrentItems()
      if (selectedItemIndex >= 0 && selectedItemIndex < items.length) {
        const item = items[selectedItemIndex] as any
        switch(tabValue) {
          case 0: dispatch(deleteEntity(item.id)); break
          case 1: dispatch(deleteEvent(item.id)); break
          case 2: dispatch(deleteEntity(item.id)); break // Locations are entities
          case 3: dispatch(deleteTime(item.id)); break
          case 4:
            if ('entityIds' in item) {
              dispatch(deleteEntityCollection(item.id))
            } else {
              dispatch(deleteEventCollection(item.id))
            }
            break
        }
      }
    },
    'object.duplicate': () => {
      // TODO: Implement duplication logic
      console.log('Duplicate object not yet implemented')
    },
    'search.focus': () => {
      searchInputRef.current?.focus()
    },
    'collection.open': () => {
      // TODO: Implement collection builder opening
      console.log('Collection builder not yet implemented')
    },
    'time.open': () => {
      setSelectedTime(null)
      setTimeEditorOpen(true)
    },
  })
  
  // Handle item selection with mouse
  const handleItemClick = (index: number) => {
    setSelectedItemIndex(index)
  }
  
  // Load personas and world state on mount
  useEffect(() => {
    dispatch(fetchPersonas() as any).then((action: any) => {
      // After personas are loaded, fetch ontologies for each persona
      if (action.payload && Array.isArray(action.payload)) {
        action.payload.forEach((persona: any) => {
          dispatch(fetchPersonaOntology(persona.id) as any)
        })
      }
    })
    dispatch(loadWorldState())
  }, [dispatch])

  // Auto-save world state on changes (debounced 1 second)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      dispatch(saveWorldState())
    }, 1000)
    return () => clearTimeout(timeoutId)
  }, [entities, events, times, entityCollections, eventCollections, timeCollections, relations, dispatch])

  // Reset selection when tab or search changes
  useEffect(() => {
    setSelectedItemIndex(-1)
  }, [tabValue, searchTerm])

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2 }}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Search objects (name, ID, or Wikidata ID)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          inputRef={searchInputRef}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <ToggleButtonGroup
                  value={wikidataFilter}
                  exclusive
                  onChange={(_, value) => value && setWikidataFilter(value)}
                  aria-label="wikidata filter"
                  size="small"
                  sx={{ height: 32 }}
                >
                  <ToggleButton value="all" aria-label="all objects" sx={{ px: 1.5, fontSize: '0.875rem' }}>
                    All
                  </ToggleButton>
                  <ToggleButton value="wikidata" aria-label="wikidata imports" sx={{ px: 1.5, fontSize: '0.875rem' }}>
                    <WikidataIcon sx={{ mr: 0.5 }} fontSize="small" />
                    Wikidata
                  </ToggleButton>
                  <ToggleButton value="manual" aria-label="manual entries" sx={{ px: 1.5, fontSize: '0.875rem' }}>
                    Manual
                  </ToggleButton>
                </ToggleButtonGroup>
              </InputAdornment>
            ),
          }}
          sx={{ mb: 2 }}
        />
      </Box>

      <Paper sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="object types">
          <Tab icon={<EntityIcon />} label={`Entities (${entities.length})`} />
          <Tab icon={<EventIcon />} label={`Events (${events.length})`} />
          <Tab icon={<LocationIcon />} label={`Locations (${locations.length})`} />
          <Tab icon={<TimeIcon />} label={`Times (${times.length})`} />
          <Tab icon={<CollectionIcon />} label={`Collections (${entityCollections.length + eventCollections.length})`} />
        </Tabs>
      </Paper>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <TabPanel value={tabValue} index={0}>
          <List>
            {filteredEntities.map((entity, index) => {
              const entityIsLocation = isLocation(entity)
              return (
                <ListItem
                  key={entity.id}
                  divider
                  selected={selectedItemIndex === index}
                  onClick={() => handleItemClick(index)}
                  sx={{ cursor: 'pointer' }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body1">{entity.name}</Typography>
                        {entityIsLocation && (
                          <Chip
                            icon={<LocationIcon />}
                            label="Location"
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                        )}
                        <WikidataChip
                          wikidataId={entity.wikidataId}
                          wikidataUrl={entity.wikidataUrl}
                          importedAt={entity.importedAt}
                          size="small"
                          showTimestamp={false}
                        />
                      </Box>
                    }
                    secondary={
                      <Box>
                        <Typography variant="caption" component="div">
                          {entityIsLocation ? (
                            <>Type: {entity.locationType === 'point' ? 'Point' : 'Extent'} Location</>
                          ) : (
                            <>Types: {getEntityTypeNames(entity) || 'None assigned'}</>
                          )}
                        </Typography>
                        {entity.metadata?.alternateNames && entity.metadata.alternateNames.length > 0 && (
                          <Typography variant="caption" color="text.secondary">
                            Also known as: {entity.metadata.alternateNames.join(', ')}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      onClick={() => entityIsLocation ? handleEditLocation(entity) : handleEditEntity(entity)}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton edge="end" onClick={() => dispatch(deleteEntity(entity.id))}>
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              )
            })}
          </List>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <List>
            {filteredEvents.map((event, index) => (
              <ListItem 
                key={event.id} 
                divider
                selected={selectedItemIndex === index}
                onClick={() => handleItemClick(index)}
                sx={{ cursor: 'pointer' }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body1">{event.name}</Typography>
                      <WikidataChip 
                        wikidataId={event.wikidataId}
                        wikidataUrl={event.wikidataUrl}
                        importedAt={event.importedAt}
                        size="small"
                        showTimestamp={false}
                      />
                    </Box>
                  }
                  secondary={
                    <Typography variant="caption">
                      Types: {getEventTypeNames(event) || 'None assigned'}
                    </Typography>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton edge="end" onClick={() => handleEditEvent(event)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton edge="end" onClick={() => dispatch(deleteEvent(event.id))}>
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <List>
            {filteredLocations.map((location, index) => (
              <ListItem 
                key={location.id} 
                divider
                selected={selectedItemIndex === index}
                onClick={() => handleItemClick(index)}
                sx={{ cursor: 'pointer' }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body1">{location.name}</Typography>
                      <WikidataChip 
                        wikidataId={location.wikidataId}
                        wikidataUrl={location.wikidataUrl}
                        importedAt={location.importedAt}
                        size="small"
                        showTimestamp={false}
                      />
                    </Box>
                  }
                  secondary={
                    <Typography variant="caption">
                      Type: {location.locationType === 'point' ? 'Point' : 'Extent'}
                    </Typography>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton edge="end" onClick={() => handleEditLocation(location)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton edge="end" onClick={() => dispatch(deleteEntity(location.id))}>
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </TabPanel>

        <TabPanel value={tabValue} index={3}>
          <List>
            {filteredTimes.map((time, index) => (
              <ListItem
                key={time.id}
                divider
                selected={selectedItemIndex === index}
                onClick={() => handleItemClick(index)}
                sx={{ cursor: 'pointer' }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body1">
                        {formatTimeDisplay(time)}
                      </Typography>
                      <WikidataChip
                        wikidataId={time.wikidataId}
                        wikidataUrl={time.wikidataUrl}
                        importedAt={time.importedAt}
                        size="small"
                        showTimestamp={false}
                      />
                    </Box>
                  }
                  secondary={
                    <Typography variant="caption">
                      {getTimeDescription(time)}
                    </Typography>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton edge="end" onClick={() => handleEditTime(time)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton edge="end" onClick={() => dispatch(deleteTime(time.id))}>
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </TabPanel>

        <TabPanel value={tabValue} index={4}>
          {/* Entity Collections */}
          {filteredEntityCollections.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <EntityIcon fontSize="small" />
                Entity Collections ({filteredEntityCollections.length})
              </Typography>
              <List>
                {filteredEntityCollections.map((collection) => (
                  <ListItem
                    key={collection.id}
                    divider
                    sx={{ cursor: 'pointer' }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body1">{collection.name}</Typography>
                          <Chip
                            label={collection.collectionType}
                            size="small"
                            variant="outlined"
                          />
                          <Chip
                            label={`${collection.entityIds.length} entities`}
                            size="small"
                            color="primary"
                          />
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        onClick={() => {
                          setSelectedCollection(collection)
                          setSelectedCollectionType('entity')
                          setCollectionEditorOpen(true)
                        }}
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
                ))}
              </List>
            </Box>
          )}

          {/* Event Collections */}
          {filteredEventCollections.length > 0 && (
            <Box>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <EventIcon fontSize="small" />
                Event Collections ({filteredEventCollections.length})
              </Typography>
              <List>
                {filteredEventCollections.map((collection) => (
                  <ListItem
                    key={collection.id}
                    divider
                    sx={{ cursor: 'pointer' }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body1">{collection.name}</Typography>
                          <Chip
                            label={collection.collectionType}
                            size="small"
                            variant="outlined"
                          />
                          <Chip
                            label={`${collection.eventIds.length} events`}
                            size="small"
                            color="primary"
                          />
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        onClick={() => {
                          setSelectedCollection(collection)
                          setSelectedCollectionType('event')
                          setCollectionEditorOpen(true)
                        }}
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
                ))}
              </List>
            </Box>
          )}

          {/* Empty state */}
          {filteredEntityCollections.length === 0 && filteredEventCollections.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CollectionIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="text.secondary">
                No collections yet
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Create a collection to group entities or events together
              </Typography>
            </Box>
          )}
        </TabPanel>
      </Box>

      <Tooltip title="Add New Object (Cmd/Ctrl+N)" placement="left">
        <Fab
          color="primary"
          aria-label="add"
          sx={{
            position: 'absolute',
            bottom: 16,
            right: 16,
          }}
          onClick={handleAddNew}
        >
          <AddIcon />
        </Fab>
      </Tooltip>

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
    </Box>
  )
}