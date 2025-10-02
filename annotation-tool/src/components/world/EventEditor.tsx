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
  List,
  ListItem,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  ToggleButton,
  ToggleButtonGroup,
  FormControlLabel,
  Checkbox,
  Paper,
} from '@mui/material'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  FlashOn as EventIcon,
  ExpandMore as ExpandMoreIcon,
  Person as PersonIcon,
  AccessTime as TimeIcon,
  Place as LocationIcon,
  Language as WikidataIcon,
  Edit as EditIcon,
} from '@mui/icons-material'
import { RootState, AppDispatch } from '../../store/store'
import { addEvent, updateEvent, addTime, addEntity } from '../../store/worldSlice'
import { Event, EventInterpretation, GlossItem, Time, Location, TimeInstant, TimeInterval, LocationPoint, Entity } from '../../models/types'
import { generateId } from '../../utils/uuid'
import { getWikidataEntity, extractWikidataInfo } from '../../services/wikidataApi'
import GlossEditor from '../GlossEditor'
import { TypeObjectBadge } from '../shared/TypeObjectToggle'
import WikidataSearch from '../WikidataSearch'

interface EventEditorProps {
  open: boolean
  onClose: () => void
  event: Event | null
}

interface ParticipantFormData {
  entityId: string
  roleTypeId: string
}

export default function EventEditor({ open, onClose, event }: EventEditorProps) {
  const dispatch = useDispatch<AppDispatch>()
  const { personas, personaOntologies, activePersonaId } = useSelector((state: RootState) => state.persona)
  const { entities, times } = useSelector((state: RootState) => state.world)
  
  const [name, setName] = useState('')
  const [description, setDescription] = useState<GlossItem[]>([{ type: 'text', content: '' }])
  const [selectedTimeId, setSelectedTimeId] = useState<string>('')
  const [selectedLocationId, setSelectedLocationId] = useState<string>('')
  const [certainty, setCertainty] = useState<number>(1.0)
  
  // Wikidata import
  const [importMode, setImportMode] = useState<'manual' | 'wikidata'>('manual')
  const [wikidataId, setWikidataId] = useState<string>('')
  const [wikidataUrl, setWikidataUrl] = useState<string>('')
  const [wikidataTemporalData, setWikidataTemporalData] = useState<any>(null)
  const [wikidataLocationData, setWikidataLocationData] = useState<any[]>([])
  const [wikidataParticipantData, setWikidataParticipantData] = useState<any[]>([])
  const [shouldImportTime, setShouldImportTime] = useState(false)
  const [shouldImportLocation, setShouldImportLocation] = useState(false)
  const [shouldImportParticipants, setShouldImportParticipants] = useState(false)
  const [hasImportedTime, setHasImportedTime] = useState(false)
  const [hasImportedLocation, setHasImportedLocation] = useState(false)
  const [hasImportedParticipants, setHasImportedParticipants] = useState(false)
  const [locationDetails, setLocationDetails] = useState<Record<string, any>>({})
  const [participantDetails, setParticipantDetails] = useState<Record<string, any>>({})
  
  // For persona interpretations
  const [interpretations, setInterpretations] = useState<EventInterpretation[]>([])
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('')
  const [selectedEventTypeId, setSelectedEventTypeId] = useState<string>('')
  const [participants, setParticipants] = useState<ParticipantFormData[]>([])
  const [interpretationConfidence, setInterpretationConfidence] = useState<number>(1.0)
  const [interpretationJustification, setInterpretationJustification] = useState('')

  useEffect(() => {
    if (event) {
      setName(event.name)
      setDescription(event.description)
      setSelectedTimeId(event.time?.id || '')
      setSelectedLocationId(event.location?.id || '')
      setCertainty(event.metadata?.certainty || 1.0)
      setInterpretations(event.personaInterpretations || [])
      setWikidataId(event.wikidataId || '')
      setWikidataUrl(event.wikidataUrl || '')
      
      // Check if time/location were imported from Wikidata
      if (event.time?.importedFrom === 'wikidata' && event.wikidataId) {
        setHasImportedTime(true)
      }
      if (event.location?.importedFrom === 'wikidata' && event.wikidataId) {
        setHasImportedLocation(true)
      }
      // Check if any entities were imported as participants
      // We'll check if there are entities with wikidataId that match the event's wikidataId import timestamp
      if (event.wikidataId && entities.some(e => e.wikidataId && e.importedAt === event.importedAt)) {
        setHasImportedParticipants(true)
      }
    } else {
      setName('')
      setDescription([{ type: 'text', content: '' }])
      setSelectedTimeId('')
      setSelectedLocationId('')
      setCertainty(1.0)
      setInterpretations([])
      setWikidataId('')
      setWikidataUrl('')
      setHasImportedTime(false)
      setHasImportedLocation(false)
      setHasImportedParticipants(false)
    }
  }, [event, entities])

  const handleAddParticipant = () => {
    setParticipants([...participants, { entityId: '', roleTypeId: '' }])
  }

  const handleUpdateParticipant = (index: number, field: keyof ParticipantFormData, value: string) => {
    const updated = [...participants]
    updated[index] = { ...updated[index], [field]: value }
    setParticipants(updated)
  }

  const handleRemoveParticipant = (index: number) => {
    setParticipants(participants.filter((_, i) => i !== index))
  }

  const handleAddInterpretation = () => {
    if (selectedPersonaId && selectedEventTypeId) {
      const newInterpretation: EventInterpretation = {
        personaId: selectedPersonaId,
        eventTypeId: selectedEventTypeId,
        participants: participants.filter(p => p.entityId && p.roleTypeId).map(p => ({
          entityId: p.entityId,
          roleTypeId: p.roleTypeId,
        })),
        confidence: interpretationConfidence,
        justification: interpretationJustification || undefined,
      }
      
      // Remove any existing interpretation for this persona
      const filtered = interpretations.filter(i => i.personaId !== selectedPersonaId)
      setInterpretations([...filtered, newInterpretation])
      
      // Reset form
      setSelectedEventTypeId('')
      setParticipants([])
      setInterpretationConfidence(1.0)
      setInterpretationJustification('')
    }
  }

  const handleRemoveInterpretation = (personaId: string) => {
    setInterpretations(interpretations.filter(i => i.personaId !== personaId))
  }

  const handleSave = async () => {
    const now = new Date().toISOString()
    
    // Create time if importing from Wikidata
    let timeToUse = times.find(t => t.id === selectedTimeId)
    if (shouldImportTime && wikidataTemporalData && !hasImportedTime) {
      const td = wikidataTemporalData
      let newTime: Omit<Time, 'id'> | null = null
      
      if (td.startTime && td.endTime) {
        // Create interval
        newTime = {
          type: 'interval',
          startTime: td.startTime.timestamp,
          endTime: td.endTime.timestamp,
          importedFrom: 'wikidata',
          importedAt: now,
        } as Omit<TimeInterval, 'id'>
      } else {
        // Create instant from various time properties
        const timeData = td.pointInTime || td.inception || td.publicationDate || td.dissolved
        if (timeData) {
          newTime = {
            type: 'instant',
            timestamp: timeData.timestamp,
            importedFrom: 'wikidata',
            importedAt: now,
            vagueness: timeData.granularity !== 'day' ? {
              type: 'approximate',
              granularity: timeData.granularity,
            } : undefined,
          } as Omit<TimeInstant, 'id'>
        } else {
          // No valid time data
          newTime = null
        }
      }
      
      if (newTime) {
        const timeWithId = { ...newTime, id: generateId() } as Time
        dispatch(addTime(timeWithId))
        timeToUse = timeWithId
        // Mark as imported so we don't import again
        setHasImportedTime(true)
        setShouldImportTime(false)
      }
    }
    
    // Create location if importing from Wikidata
    let locationToUse = entities.find(e => e.id === selectedLocationId && 'locationType' in e) as Location | undefined
    if (shouldImportLocation && wikidataLocationData.length > 0 && !hasImportedLocation) {
      // For now, fetch and create the first location
      // In a more complete implementation, we'd let the user choose which location(s) to import
      const firstLocation = wikidataLocationData[0]
      
      try {
        const locationEntity = await getWikidataEntity(firstLocation.wikidataId)
        if (locationEntity) {
          const locationInfo = extractWikidataInfo(locationEntity)
          
          // Create a location entity
          const newLocation: Omit<LocationPoint, 'id' | 'createdAt' | 'updatedAt'> = {
            name: locationInfo.label,
            description: [{ type: 'text', content: locationInfo.description || `${locationInfo.label} from Wikidata.` }],
            wikidataId: locationInfo.id,
            wikidataUrl: locationInfo.wikidataUrl,
            importedFrom: 'wikidata',
            importedAt: now,
            typeAssignments: [],
            metadata: {
              alternateNames: locationInfo.aliases || [],
              externalIds: {},
              properties: {},
            },
            locationType: 'point',
            coordinateSystem: 'GPS',
            coordinates: locationInfo.coordinates || {},
          }
          
          const locationWithId = { ...newLocation, id: generateId(), createdAt: now, updatedAt: now } as Location
          dispatch(addEntity(locationWithId))
          locationToUse = locationWithId
          // Mark as imported so we don't import again
          setHasImportedLocation(true)
          setShouldImportLocation(false)
        }
      } catch (error) {
        console.error('Failed to fetch location from Wikidata:', error)
      }
    }
    
    // Create participants if importing from Wikidata
    const createdParticipantIds: string[] = []
    if (shouldImportParticipants && wikidataParticipantData.length > 0 && !hasImportedParticipants) {
      for (const participant of wikidataParticipantData) {
        try {
          const participantEntity = await getWikidataEntity(participant.wikidataId)
          if (participantEntity) {
            const participantInfo = extractWikidataInfo(participantEntity)
            
            // Create an entity for the participant
            const newParticipant: Omit<Entity, 'id' | 'createdAt' | 'updatedAt'> = {
              name: participantInfo.label,
              description: [{ type: 'text', content: participantInfo.description || `${participantInfo.label} from Wikidata.` }],
              wikidataId: participantInfo.id,
              wikidataUrl: participantInfo.wikidataUrl,
              importedFrom: 'wikidata',
              importedAt: now,
              typeAssignments: [],
              metadata: {
                alternateNames: participantInfo.aliases || [],
                externalIds: {},
                properties: {
                  role: participant.property, // Store the role type from Wikidata
                },
              },
            }
            
            const participantWithId = { ...newParticipant, id: generateId(), createdAt: now, updatedAt: now }
            dispatch(addEntity(participantWithId))
            createdParticipantIds.push(participantWithId.id)
          }
        } catch (error) {
          console.error('Failed to fetch participant from Wikidata:', error)
        }
      }
      // Mark as imported so we don't import again
      if (createdParticipantIds.length > 0) {
        setHasImportedParticipants(true)
        setShouldImportParticipants(false)
      }
    }
    
    const eventData: Omit<Event, 'id' | 'createdAt' | 'updatedAt'> = {
      name,
      description,
      personaInterpretations: interpretations,
      time: timeToUse,
      location: locationToUse,
      wikidataId: wikidataId || undefined,
      wikidataUrl: wikidataUrl || undefined,
      importedFrom: wikidataId ? (event?.importedFrom || 'wikidata') : undefined,
      importedAt: wikidataId ? (event?.importedAt || now) : undefined,
      metadata: {
        certainty,
        properties: {},
      },
    }

    if (event) {
      dispatch(updateEvent({ ...event, ...eventData }))
    } else {
      dispatch(addEvent(eventData))
    }

    onClose()
  }

  const getEventTypeName = (personaId: string, eventTypeId: string): string => {
    const ontology = personaOntologies.find(o => o.personaId === personaId)
    const eventType = ontology?.events.find(e => e.id === eventTypeId)
    return eventType?.name || 'Unknown Type'
  }

  const getRoleTypeName = (personaId: string, roleTypeId: string): string => {
    const ontology = personaOntologies.find(o => o.personaId === personaId)
    const roleType = ontology?.roles.find(r => r.id === roleTypeId)
    return roleType?.name || 'Unknown Role'
  }

  const getEntityName = (entityId: string): string => {
    const entity = entities.find(e => e.id === entityId)
    return entity?.name || 'Unknown Entity'
  }

  const getPersonaName = (personaId: string): string => {
    const persona = personas.find(p => p.id === personaId)
    return persona?.name || 'Unknown Persona'
  }
  
  const formatTimePreview = (temporalData: any): string => {
    if (!temporalData) return 'No time data'
    
    const formatDate = (timestamp: string, granularity?: string) => {
      const date = new Date(timestamp)
      if (isNaN(date.getTime())) return timestamp
      
      if (granularity === 'year') {
        return date.getFullYear().toString()
      } else if (granularity === 'month') {
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
      } else {
        return date.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      }
    }
    
    if (temporalData.startTime && temporalData.endTime) {
      return `${formatDate(temporalData.startTime.timestamp, temporalData.startTime.granularity)} to ${formatDate(temporalData.endTime.timestamp, temporalData.endTime.granularity)}`
    } else if (temporalData.pointInTime) {
      return formatDate(temporalData.pointInTime.timestamp, temporalData.pointInTime.granularity)
    } else if (temporalData.inception) {
      return `Inception: ${formatDate(temporalData.inception.timestamp, temporalData.inception.granularity)}`
    } else if (temporalData.dissolved) {
      return `Dissolved: ${formatDate(temporalData.dissolved.timestamp, temporalData.dissolved.granularity)}`
    }
    
    return 'Time data available'
  }

  const availableEventTypes = selectedPersonaId
    ? personaOntologies.find(o => o.personaId === selectedPersonaId)?.events || []
    : []

  const availableRoleTypes = selectedPersonaId
    ? personaOntologies.find(o => o.personaId === selectedPersonaId)?.roles || []
    : []

  const locationEntities = entities.filter(e => 'locationType' in e)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <EventIcon color="secondary" />
          {event ? 'Edit Event' : 'Create Event'}
          <TypeObjectBadge isType={false} />
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <Alert severity="info" icon={<EventIcon />}>
            An event is something that actually happened (e.g., "The 2024 Olympics", "John's birthday party").
            This is different from event types which are categories (e.g., "Olympics", "Birthday Party").
          </Alert>

          {/* Import mode selector */}
          {!event && (
            <ToggleButtonGroup
              value={importMode}
              exclusive
              onChange={(_, newMode) => newMode && setImportMode(newMode)}
              fullWidth
              size="small"
            >
              <ToggleButton value="manual">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <EditIcon fontSize="small" />
                  <Typography variant="body2">Manual Entry</Typography>
                </Box>
              </ToggleButton>
              <ToggleButton value="wikidata">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <WikidataIcon fontSize="small" />
                  <Typography variant="body2">Import from Wikidata</Typography>
                </Box>
              </ToggleButton>
            </ToggleButtonGroup>
          )}

          {/* Wikidata import */}
          {importMode === 'wikidata' && !event && (
            <WikidataSearch
              entityType="object"
              objectSubtype="event"
              onImport={async (data) => {
                setName(data.name)
                setDescription([{ type: 'text', content: data.description || `${data.name} from Wikidata.` }])
                setWikidataId(data.wikidataId)
                setWikidataUrl(data.wikidataUrl)
                
                // Store temporal and location data
                if (data.temporalData) {
                  setWikidataTemporalData(data.temporalData)
                  setShouldImportTime(true)
                }
                
                // Fetch location details
                if (data.locationData && data.locationData.length > 0) {
                  setWikidataLocationData(data.locationData)
                  setShouldImportLocation(true)
                  
                  // Fetch names for each location
                  const details: Record<string, any> = {}
                  for (const loc of data.locationData) {
                    try {
                      const entity = await getWikidataEntity(loc.wikidataId)
                      if (entity) {
                        const info = extractWikidataInfo(entity)
                        details[loc.wikidataId] = {
                          name: info.label,
                          description: info.description
                        }
                      }
                    } catch (error) {
                      console.error(`Failed to fetch location ${loc.wikidataId}:`, error)
                    }
                  }
                  setLocationDetails(details)
                }
                
                // Fetch participant details
                if (data.participantData && data.participantData.length > 0) {
                  setWikidataParticipantData(data.participantData)
                  setShouldImportParticipants(true)
                  
                  // Fetch names for each participant
                  const details: Record<string, any> = {}
                  for (const participant of data.participantData) {
                    try {
                      const entity = await getWikidataEntity(participant.wikidataId)
                      if (entity) {
                        const info = extractWikidataInfo(entity)
                        details[participant.wikidataId] = {
                          name: info.label,
                          description: info.description
                        }
                      }
                    } catch (error) {
                      console.error(`Failed to fetch participant ${participant.wikidataId}:`, error)
                    }
                  }
                  setParticipantDetails(details)
                }
              }}
            />
          )}

          {/* Show Wikidata chip if imported */}
          {wikidataId && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip 
                label={`Wikidata: ${wikidataId}`}
                size="small"
                color="secondary"
                variant="outlined"
                component="a"
                href={wikidataUrl}
                target="_blank"
                clickable
              />
              <Typography variant="caption" color="text.secondary">
                Imported from Wikidata
              </Typography>
            </Box>
          )}

          {/* Show available time data from Wikidata */}
          {wikidataTemporalData && (
            <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={shouldImportTime}
                    onChange={(e) => setShouldImportTime(e.target.checked)}
                    disabled={hasImportedTime}
                  />
                }
                label={
                  <Box>
                    <Typography variant="subtitle2">
                      Import Time from Wikidata
                      {hasImportedTime && (
                        <Chip 
                          label="Already imported" 
                          size="small" 
                          color="success" 
                          sx={{ ml: 1 }}
                        />
                      )}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatTimePreview(wikidataTemporalData)}
                    </Typography>
                  </Box>
                }
              />
            </Paper>
          )}

          {/* Show available location data from Wikidata */}
          {wikidataLocationData && wikidataLocationData.length > 0 && (
            <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={shouldImportLocation}
                    onChange={(e) => setShouldImportLocation(e.target.checked)}
                    disabled={hasImportedLocation}
                  />
                }
                label={
                  <Box>
                    <Typography variant="subtitle2">
                      Import Locations from Wikidata
                      {hasImportedLocation && (
                        <Chip 
                          label="Already imported" 
                          size="small" 
                          color="success" 
                          sx={{ ml: 1 }}
                        />
                      )}
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                      {wikidataLocationData.map((loc) => {
                        const detail = locationDetails[loc.wikidataId]
                        return (
                          <Chip
                            key={loc.wikidataId}
                            label={detail?.name || loc.wikidataId}
                            size="small"
                            variant="outlined"
                            color="primary"
                            title={`${loc.property}: ${detail?.description || ''}`}
                          />
                        )
                      })}
                    </Box>
                  </Box>
                }
              />
            </Paper>
          )}

          {/* Show available participant data from Wikidata */}
          {wikidataParticipantData && wikidataParticipantData.length > 0 && (
            <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={shouldImportParticipants}
                    onChange={(e) => setShouldImportParticipants(e.target.checked)}
                    disabled={hasImportedParticipants}
                  />
                }
                label={
                  <Box>
                    <Typography variant="subtitle2">
                      Import Participants from Wikidata
                      {hasImportedParticipants && (
                        <Chip 
                          label="Already imported" 
                          size="small" 
                          color="success" 
                          sx={{ ml: 1 }}
                        />
                      )}
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                      {wikidataParticipantData.map((participant) => {
                        const detail = participantDetails[participant.wikidataId]
                        const roleLabel = participant.property.replace(/_/g, ' ')
                        return (
                          <Chip
                            key={participant.wikidataId}
                            label={`${detail?.name || participant.wikidataId} (${roleLabel})`}
                            size="small"
                            variant="outlined"
                            color="secondary"
                            title={detail?.description || ''}
                          />
                        )
                      })}
                    </Box>
                  </Box>
                }
              />
            </Paper>
          )}

          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            helperText="The specific name of this event"
          />

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Description
            </Typography>
            <GlossEditor
              gloss={description}
              onChange={setDescription}
              personaId={activePersonaId} // Use active persona for type references
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Time</InputLabel>
              <Select
                value={selectedTimeId}
                onChange={(e) => setSelectedTimeId(e.target.value)}
                label="Time"
                startAdornment={<TimeIcon sx={{ mr: 1, color: 'action.active' }} />}
              >
                <MenuItem value="">None</MenuItem>
                {times.map(time => (
                  <MenuItem key={time.id} value={time.id}>
                    {time.type === 'instant' 
                      ? `Instant: ${(time as any).timestamp}`
                      : `Interval: ${(time as any).startTime || '?'} - ${(time as any).endTime || '?'}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Location</InputLabel>
              <Select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                label="Location"
                startAdornment={<LocationIcon sx={{ mr: 1, color: 'action.active' }} />}
              >
                <MenuItem value="">None</MenuItem>
                {locationEntities.map(location => (
                  <MenuItem key={location.id} value={location.id}>
                    {location.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Certainty"
              type="number"
              value={certainty}
              onChange={(e) => setCertainty(parseFloat(e.target.value))}
              inputProps={{ min: 0, max: 1, step: 0.1 }}
              sx={{ width: 150 }}
            />
          </Box>

          <Divider />

          <Box>
            <Typography variant="h6" gutterBottom>
              Persona Interpretations
            </Typography>
            <Typography variant="caption" color="text.secondary" paragraph>
              Different personas can interpret this event with different event types and participant roles.
            </Typography>

            {/* List existing interpretations */}
            {interpretations.length > 0 && (
              <List>
                {interpretations.map((interpretation) => (
                  <ListItem key={interpretation.personaId} sx={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip 
                          label={getPersonaName(interpretation.personaId)} 
                          size="small" 
                          color="primary"
                          icon={<PersonIcon />}
                        />
                        <Typography variant="body2">interprets as</Typography>
                        <Chip 
                          label={getEventTypeName(interpretation.personaId, interpretation.eventTypeId)}
                          size="small"
                          variant="outlined"
                          color="primary"
                          sx={{ fontStyle: 'italic' }}
                        />
                      </Box>
                      <IconButton 
                        size="small"
                        onClick={() => handleRemoveInterpretation(interpretation.personaId)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                    
                    {interpretation.participants.length > 0 && (
                      <Box sx={{ ml: 4, mt: 1 }}>
                        <Typography variant="caption" color="text.secondary">Participants:</Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                          {interpretation.participants.map((p, idx) => (
                            <Chip
                              key={idx}
                              size="small"
                              label={`${getEntityName(p.entityId)} as ${getRoleTypeName(interpretation.personaId, p.roleTypeId)}`}
                              variant="outlined"
                            />
                          ))}
                        </Box>
                      </Box>
                    )}
                  </ListItem>
                ))}
              </List>
            )}

            {/* Add new interpretation */}
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle2">Add Interpretation</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
                  <FormControl fullWidth>
                    <InputLabel>Persona</InputLabel>
                    <Select
                      value={selectedPersonaId}
                      onChange={(e) => {
                        setSelectedPersonaId(e.target.value)
                        setSelectedEventTypeId('')
                        setParticipants([])
                      }}
                      label="Persona"
                    >
                      {personas.map(persona => (
                        <MenuItem key={persona.id} value={persona.id}>
                          {persona.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {selectedPersonaId && (
                    <>
                      <FormControl fullWidth>
                        <InputLabel>Event Type</InputLabel>
                        <Select
                          value={selectedEventTypeId}
                          onChange={(e) => setSelectedEventTypeId(e.target.value)}
                          label="Event Type"
                        >
                          {availableEventTypes.map(type => (
                            <MenuItem key={type.id} value={type.id}>
                              <em>{type.name}</em>
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <Box>
                        <Typography variant="subtitle2" gutterBottom>
                          Participants
                        </Typography>
                        {participants.map((participant, index) => (
                          <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                            <FormControl sx={{ flex: 1 }}>
                              <InputLabel size="small">Entity</InputLabel>
                              <Select
                                size="small"
                                value={participant.entityId}
                                onChange={(e) => handleUpdateParticipant(index, 'entityId', e.target.value)}
                                label="Entity"
                              >
                                {entities.map(entity => (
                                  <MenuItem key={entity.id} value={entity.id}>
                                    {entity.name}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                            <FormControl sx={{ flex: 1 }}>
                              <InputLabel size="small">Role</InputLabel>
                              <Select
                                size="small"
                                value={participant.roleTypeId}
                                onChange={(e) => handleUpdateParticipant(index, 'roleTypeId', e.target.value)}
                                label="Role"
                              >
                                {availableRoleTypes.map(role => (
                                  <MenuItem key={role.id} value={role.id}>
                                    <em>{role.name}</em>
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                            <IconButton 
                              size="small"
                              onClick={() => handleRemoveParticipant(index)}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Box>
                        ))}
                        <Button 
                          size="small"
                          startIcon={<AddIcon />}
                          onClick={handleAddParticipant}
                        >
                          Add Participant
                        </Button>
                      </Box>

                      <TextField
                        label="Confidence"
                        type="number"
                        size="small"
                        value={interpretationConfidence}
                        onChange={(e) => setInterpretationConfidence(parseFloat(e.target.value))}
                        inputProps={{ min: 0, max: 1, step: 0.1 }}
                      />

                      <TextField
                        label="Justification (optional)"
                        size="small"
                        multiline
                        rows={2}
                        value={interpretationJustification}
                        onChange={(e) => setInterpretationJustification(e.target.value)}
                      />

                      <Button 
                        variant="outlined" 
                        startIcon={<AddIcon />}
                        onClick={handleAddInterpretation}
                        disabled={!selectedEventTypeId}
                      >
                        Add Interpretation
                      </Button>
                    </>
                  )}
                </Box>
              </AccordionDetails>
            </Accordion>
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
          {event ? 'Update' : 'Create'} Event
        </Button>
      </DialogActions>
    </Dialog>
  )
}