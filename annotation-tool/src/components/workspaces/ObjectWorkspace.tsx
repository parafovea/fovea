import { useState } from 'react'
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
  Chip,
  TextField,
  InputAdornment,
  Paper,
  Divider,
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
  
  // Editor states
  const [entityEditorOpen, setEntityEditorOpen] = useState(false)
  const [eventEditorOpen, setEventEditorOpen] = useState(false)
  const [locationEditorOpen, setLocationEditorOpen] = useState(false)
  const [timeEditorOpen, setTimeEditorOpen] = useState(false)
  
  const [selectedEntity, setSelectedEntity] = useState<typeof entities[0] | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<typeof events[0] | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<typeof locations[0] | null>(null)
  const [selectedTime, setSelectedTime] = useState<typeof times[0] | null>(null)

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

  const filteredEntities = entities.filter(e => 
    e.name.toLowerCase().includes(searchTerm.toLowerCase())
  )
  const filteredEvents = events.filter(e => 
    e.name.toLowerCase().includes(searchTerm.toLowerCase())
  )
  const filteredLocations = locations.filter((l: any) => 
    l.name.toLowerCase().includes(searchTerm.toLowerCase())
  )
  const filteredTimes = times.filter(t => 
    (t.id || '').toLowerCase().includes(searchTerm.toLowerCase())
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

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2 }}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Search objects..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
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
            {filteredEntities.map((entity) => (
              <ListItem key={entity.id} divider>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body1">{entity.name}</Typography>
                      {entity.wikidataId && (
                        <Chip
                          icon={<WikidataIcon />}
                          label={entity.wikidataId}
                          size="small"
                          variant="outlined"
                          color="primary"
                          component="a"
                          href={entity.wikidataUrl}
                          target="_blank"
                          clickable
                        />
                      )}
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
            {filteredEvents.map((event) => (
              <ListItem key={event.id} divider>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body1">{event.name}</Typography>
                      {event.wikidataId && (
                        <Chip
                          icon={<WikidataIcon />}
                          label={event.wikidataId}
                          size="small"
                          variant="outlined"
                          color="primary"
                          component="a"
                          href={event.wikidataUrl}
                          target="_blank"
                          clickable
                        />
                      )}
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
            {filteredLocations.map((location) => (
              <ListItem key={location.id} divider>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body1">{location.name}</Typography>
                      {location.wikidataId && (
                        <Chip
                          icon={<WikidataIcon />}
                          label={location.wikidataId}
                          size="small"
                          variant="outlined"
                          color="primary"
                          component="a"
                          href={location.wikidataUrl}
                          target="_blank"
                          clickable
                        />
                      )}
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
            {filteredTimes.map((time) => (
              <ListItem key={time.id} divider>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body1">
                        {time.type === 'instant' ? 'Instant' : 'Interval'}: {time.id}
                      </Typography>
                      {time.wikidataId && (
                        <Chip
                          icon={<WikidataIcon />}
                          label={time.wikidataId}
                          size="small"
                          variant="outlined"
                          color="primary"
                          component="a"
                          href={time.wikidataUrl}
                          target="_blank"
                          clickable
                        />
                      )}
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