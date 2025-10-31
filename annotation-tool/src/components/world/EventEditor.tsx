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
import { addEvent, updateEvent } from '../../store/worldSlice'
import { Event, EventInterpretation, GlossItem, Location } from '../../models/types'
import GlossEditor from '../GlossEditor'
import { TypeObjectBadge } from '../shared/TypeObjectToggle'
import WikidataImportFlow from '../shared/WikidataImportFlow'

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
    } else {
      setName('')
      setDescription([{ type: 'text', content: '' }])
      setSelectedTimeId('')
      setSelectedLocationId('')
      setCertainty(1.0)
      setInterpretations([])
      setWikidataId('')
      setWikidataUrl('')
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

    const timeToUse = times.find(t => t.id === selectedTimeId)
    const locationToUse = entities.find(e => e.id === selectedLocationId && 'locationType' in e) as Location | undefined

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
            <WikidataImportFlow
              type="event"
              entityType="object"
              objectSubtype="event"
              onSuccess={() => onClose()}
              onCancel={onClose}
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
                    {time.label || (time.type === 'instant'
                      ? `Instant: ${(time as any).timestamp}`
                      : `Interval: ${(time as any).startTime || '?'} - ${(time as any).endTime || '?'}`)}
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