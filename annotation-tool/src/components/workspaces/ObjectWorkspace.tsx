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
  Divider,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
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
} from '@mui/icons-material'
import { RootState, AppDispatch } from '../../store/store'
import { deleteEntity, deleteEvent, deleteTime } from '../../store/worldSlice'
import EntityEditor from '../world/EntityEditor'
import EventEditor from '../world/EventEditor'
import LocationEditor from '../world/LocationEditor'
import TimeEditor from '../world/TimeEditor'
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

export default function ObjectWorkspace() {
  const dispatch = useDispatch<AppDispatch>()
  const { entities, events, times } = useSelector((state: RootState) => state.world)
  const { personaOntologies } = useSelector((state: RootState) => state.persona)
  const locations = entities.filter(e => (e as any).locationType) // Locations are specialized entities
  
  const [tabValue, setTabValue] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [wikidataFilter, setWikidataFilter] = useState<'all' | 'wikidata' | 'manual'>('all')
  
  // Editor states
  const [entityEditorOpen, setEntityEditorOpen] = useState(false)
  const [eventEditorOpen, setEventEditorOpen] = useState(false)
  const [locationEditorOpen, setLocationEditorOpen] = useState(false)
  const [timeEditorOpen, setTimeEditorOpen] = useState(false)
  
  const [selectedEntity, setSelectedEntity] = useState<typeof entities[0] | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<typeof events[0] | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<typeof locations[0] | null>(null)
  const [selectedTime, setSelectedTime] = useState<typeof times[0] | null>(null)
  
  // Refs for managing focus
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(-1)

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
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

  const handleEditLocation = (location: any) => {
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
    return (
      item.name?.toLowerCase().includes(lowerTerm) ||
      item.id?.toLowerCase().includes(lowerTerm) ||
      item.wikidataId?.toLowerCase().includes(lowerTerm)
    )
  }
  
  const filteredEntities = entities.filter(e => 
    searchMatches(e, searchTerm) && filterByWikidata(e)
  )
  const filteredEvents = events.filter(e => 
    searchMatches(e, searchTerm) && filterByWikidata(e)
  )
  const filteredLocations = locations.filter((l: any) => 
    searchMatches(l, searchTerm) && filterByWikidata(l)
  )
  const filteredTimes = times.filter(t => 
    searchMatches(t, searchTerm) && filterByWikidata(t)
  )

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
  
  // Get the currently visible list items based on tab
  const getCurrentItems = () => {
    switch(tabValue) {
      case 0: return filteredEntities
      case 1: return filteredEvents
      case 2: return filteredLocations
      case 3: return filteredTimes
      default: return []
    }
  }
  
  // Setup keyboard shortcuts
  useWorkspaceKeyboardShortcuts('objectWorkspace', {
    'object.new': () => handleAddNew(),
    'tab.next': () => setTabValue((prev) => (prev + 1) % 4),
    'tab.previous': () => setTabValue((prev) => (prev - 1 + 4) % 4),
    'item.edit': () => {
      const items = getCurrentItems()
      if (selectedItemIndex >= 0 && selectedItemIndex < items.length) {
        const item = items[selectedItemIndex] as any
        switch(tabValue) {
          case 0: handleEditEntity(item); break
          case 1: handleEditEvent(item); break
          case 2: handleEditLocation(item); break
          case 3: handleEditTime(item); break
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
          }}
          sx={{ mb: 2 }}
        />
        
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <ToggleButtonGroup
            value={wikidataFilter}
            exclusive
            onChange={(_, value) => value && setWikidataFilter(value)}
            aria-label="wikidata filter"
            size="small"
          >
            <ToggleButton value="all" aria-label="all objects">
              All
            </ToggleButton>
            <ToggleButton value="wikidata" aria-label="wikidata imports">
              <WikidataIcon sx={{ mr: 0.5 }} fontSize="small" />
              Wikidata Only
            </ToggleButton>
            <ToggleButton value="manual" aria-label="manual entries">
              Manual Only
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      <Paper sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="object types">
          <Tab icon={<EntityIcon />} label={`Entities (${entities.length})`} />
          <Tab icon={<EventIcon />} label={`Events (${events.length})`} />
          <Tab icon={<LocationIcon />} label={`Locations (${locations.length})`} />
          <Tab icon={<TimeIcon />} label={`Times (${times.length})`} />
        </Tabs>
      </Paper>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <TabPanel value={tabValue} index={0}>
          <List>
            {filteredEntities.map((entity, index) => (
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
                        Types: {getEntityTypeNames(entity) || 'None assigned'}
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
                  <IconButton edge="end" onClick={() => handleEditEntity(entity)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton edge="end" onClick={() => dispatch(deleteEntity(entity.id))}>
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
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
                        {time.type === 'instant' ? 'Instant' : 'Interval'}: {time.id}
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
                      {time.type === 'instant' 
                        ? (time as any).timestamp 
                        : `${(time as any).startTime || 'Unknown'} - ${(time as any).endTime || 'Unknown'}`}
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
    </Box>
  )
}