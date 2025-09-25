import { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import React from 'react'
import {
  Box,
  Tabs,
  Tab,
  Paper,
  Typography,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Fab,
  Alert,
  Chip,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Person as PersonaIcon,
  VideoLibrary as VideoIcon,
  Category as TypeIcon,
  Inventory2 as ObjectIcon,
  FlashOn as EventIcon,
  Place as LocationIcon,
  AccessTime as TimeIcon,
  Pattern as PatternIcon,
} from '@mui/icons-material'
import { RootState, AppDispatch } from '../store/store'
import EntityTypeEditor from './EntityTypeEditor'
import RoleEditor from './RoleEditor'
import EventTypeEditor from './EventTypeEditor'
import PersonaManager from './PersonaManager'
import RelationTypeEditor from './RelationTypeEditor'
import { GlossRenderer } from './GlossRenderer'
import { TypeObjectBadge } from './shared/TypeObjectToggle'
// Import world object editors
import EntityEditor from './world/EntityEditor'
import EventEditor from './world/EventEditor'
import TimeEditor from './world/TimeEditor'
import LocationEditor from './world/LocationEditor'
import TimeBuilder from './world/TimeBuilder'
import TimeCollectionBuilder from './world/TimeCollectionBuilder'
import {
  deleteEntityFromPersona,
  deleteRoleFromPersona,
  deleteEventFromPersona,
  deleteRelationType,
} from '../store/personaSlice'
import { deleteEntity, deleteEvent, deleteTime } from '../store/worldSlice'

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
      id={`ontology-tabpanel-${index}`}
      aria-labelledby={`ontology-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>{children}</Box>
      )}
    </div>
  )
}

export default function OntologyBuilder() {
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const { activePersonaId, personaOntologies, personas } = useSelector((state: RootState) => state.persona)
  const { entities, events, times } = useSelector((state: RootState) => state.world)
  const lastAnnotation = useSelector((state: RootState) => state.videos.lastAnnotation)
  const activeOntology = personaOntologies.find(o => o.personaId === activePersonaId)
  const activePersona = personas.find(p => p.id === activePersonaId)
  
  const [mainView, setMainView] = useState<'types' | 'objects'>('types')
  const [tabValue, setTabValue] = useState(0)
  
  // Type editors
  const [entityTypeEditorOpen, setEntityTypeEditorOpen] = useState(false)
  const [roleEditorOpen, setRoleEditorOpen] = useState(false)
  const [eventTypeEditorOpen, setEventTypeEditorOpen] = useState(false)
  const [relationTypeEditorOpen, setRelationTypeEditorOpen] = useState(false)
  const [selectedEntityType, setSelectedEntityType] = useState(null)
  const [selectedRole, setSelectedRole] = useState(null)
  const [selectedEventType, setSelectedEventType] = useState(null)
  const [selectedRelationType, setSelectedRelationType] = useState(null)
  
  // Object editors
  const [entityEditorOpen, setEntityEditorOpen] = useState(false)
  const [eventEditorOpen, setEventEditorOpen] = useState(false)
  const [timeEditorOpen, setTimeEditorOpen] = useState(false)
  const [locationEditorOpen, setLocationEditorOpen] = useState(false)
  const [timeBuilderOpen, setTimeBuilderOpen] = useState(false)
  const [timeCollectionBuilderOpen, setTimeCollectionBuilderOpen] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [selectedTime, setSelectedTime] = useState(null)
  const [selectedLocation, setSelectedLocation] = useState(null)

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue)
  }

  // Type handlers
  const handleAddEntityType = () => {
    setSelectedEntityType(null)
    setEntityTypeEditorOpen(true)
  }

  const handleEditEntityType = (entityType: any) => {
    setSelectedEntityType(entityType)
    setEntityTypeEditorOpen(true)
  }

  const handleDeleteEntityType = (entityTypeId: string) => {
    if (activePersonaId && window.confirm('Delete this entity type?')) {
      dispatch(deleteEntityFromPersona({ personaId: activePersonaId, entityId: entityTypeId }))
    }
  }
  
  const handleAddEventType = () => {
    setSelectedEventType(null)
    setEventTypeEditorOpen(true)
  }

  const handleEditEventType = (eventType: any) => {
    setSelectedEventType(eventType)
    setEventTypeEditorOpen(true)
  }

  const handleDeleteEventType = (eventTypeId: string) => {
    if (activePersonaId && window.confirm('Delete this event type?')) {
      dispatch(deleteEventFromPersona({ personaId: activePersonaId, eventId: eventTypeId }))
    }
  }

  const handleAddRole = () => {
    setSelectedRole(null)
    setRoleEditorOpen(true)
  }

  const handleEditRole = (role: any) => {
    setSelectedRole(role)
    setRoleEditorOpen(true)
  }

  const handleDeleteRole = (roleId: string) => {
    if (activePersonaId && window.confirm('Delete this role?')) {
      dispatch(deleteRoleFromPersona({ personaId: activePersonaId, roleId }))
    }
  }

  // Object handlers
  const handleAddEntity = () => {
    setSelectedEntity(null)
    setEntityEditorOpen(true)
  }

  const handleEditEntity = (entity: any) => {
    setSelectedEntity(entity)
    setEntityEditorOpen(true)
  }

  const handleDeleteEntity = (entityId: string) => {
    if (window.confirm('Delete this entity object?')) {
      dispatch(deleteEntity(entityId))
    }
  }
  
  const handleAddEvent = () => {
    setSelectedEvent(null)
    setEventEditorOpen(true)
  }

  const handleEditEvent = (event: any) => {
    setSelectedEvent(event)
    setEventEditorOpen(true)
  }

  const handleDeleteEvent = (eventId: string) => {
    if (window.confirm('Delete this event object?')) {
      dispatch(deleteEvent(eventId))
    }
  }
  
  const handleAddTime = () => {
    setSelectedTime(null)
    setTimeEditorOpen(true)
  }

  const handleEditTime = (time: any) => {
    setSelectedTime(time)
    setTimeEditorOpen(true)
  }

  const handleDeleteTime = (timeId: string) => {
    if (window.confirm('Delete this time object?')) {
      dispatch(deleteTime(timeId))
    }
  }
  
  const handleAddLocation = () => {
    setSelectedLocation(null)
    setLocationEditorOpen(true)
  }

  const handleEditLocation = (location: any) => {
    setSelectedLocation(location)
    setLocationEditorOpen(true)
  }

  const handleDeleteLocation = (locationId: string) => {
    if (window.confirm('Delete this location?')) {
      dispatch(deleteEntity(locationId)) // Locations are special entities
    }
  }

  const handleAddRelationType = () => {
    setSelectedRelationType(null)
    setRelationTypeEditorOpen(true)
  }

  const handleEditRelationType = (relationType: any) => {
    setSelectedRelationType(relationType)
    setRelationTypeEditorOpen(true)
  }

  const handleDeleteRelationType = (relationTypeId: string) => {
    if (activePersonaId && window.confirm('Delete this relation type and all its relations?')) {
      dispatch(deleteRelationType({ personaId: activePersonaId, relationTypeId }))
    }
  }

  if (personas.length === 0) {
    return (
      <Box sx={{ width: '100%' }}>
        <PersonaManager />
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom>
            No personas created yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create a persona above to start building your ontology
          </Typography>
        </Paper>
      </Box>
    )
  }

  if (!activeOntology) {
    return (
      <Box sx={{ width: '100%' }}>
        <PersonaManager />
        <Alert severity="warning">
          Select a persona to view its ontology
        </Alert>
      </Box>
    )
  }

  // Count location entities
  const locationEntities = entities.filter(e => 'locationType' in e)
  const nonLocationEntities = entities.filter(e => !('locationType' in e))

  return (
    <Box sx={{ width: '100%' }}>
      <PersonaManager />

        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <ToggleButtonGroup
              value={mainView}
              exclusive
              onChange={(_, value) => {
                if (value) {
                  setMainView(value)
                  setTabValue(0) // Reset tab to first when switching views
                }
              }}
              size="large"
            >
              <Tooltip title="Types are categories in your ontology (e.g., 'Person', 'Building', 'Meeting'). Types are defined per-persona and represent conceptual classifications.">
                <ToggleButton value="types" sx={{ 
                  '&.Mui-selected': { 
                    borderStyle: 'dashed',
                    fontStyle: 'italic' 
                  }
                }}>
                  <TypeIcon sx={{ mr: 1 }} />
                  Types
                </ToggleButton>
              </Tooltip>
              <Tooltip title="Objects are actual things in the world (e.g., 'John Smith', 'The White House', 'The 2024 Olympics'). Objects exist independently of personas and can be assigned different types by different personas.">
                <ToggleButton value="objects" sx={{ 
                  '&.Mui-selected': { 
                    borderStyle: 'solid',
                    backgroundColor: 'secondary.main',
                    color: 'secondary.contrastText',
                    '&:hover': {
                      backgroundColor: 'secondary.dark',
                    }
                  }
                }}>
                  <ObjectIcon sx={{ mr: 1 }} />
                  Objects
                </ToggleButton>
              </Tooltip>
            </ToggleButtonGroup>
          </Box>
          
        </Box>

        <Paper sx={{ width: '1300px', mx: 'auto' }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', width: '100%' }}>
            {mainView === 'types' ? (
              <Tabs 
                value={tabValue} 
                onChange={handleTabChange}
                aria-label="ontology types tabs" 
                variant="fullWidth"
              >
                <Tab label={`Entity Types (${activeOntology.entities.length})`} />
                <Tab label={`Role Types (${activeOntology.roles.length})`} />
                <Tab label={`Event Types (${activeOntology.events.length})`} />
                <Tab label={`Relation Types (${activeOntology.relationTypes.length})`} />
              </Tabs>
            ) : (
              <Tabs 
                value={tabValue} 
                onChange={handleTabChange}
                aria-label="ontology objects tabs" 
                variant="fullWidth"
              >
                <Tab label={`Entities (${nonLocationEntities.length})`} />
                <Tab label={`Events (${events.length})`} />
                <Tab label={`Locations (${locationEntities.length})`} />
                <Tab label={`Times (${times.length})`} />
              </Tabs>
            )}
          </Box>

        {/* TYPES VIEW */}
        {mainView === 'types' && (
          <>
            <TabPanel value={tabValue} index={0}>
              <List>
                {activeOntology.entities.map((entityType) => {
                  const entityRelations = activeOntology.relations.filter(r => 
                    (r.sourceType === 'entity' && r.sourceId === entityType.id) ||
                    (r.targetType === 'entity' && r.targetId === entityType.id)
                  )
                  
                  return (
                    <React.Fragment key={entityType.id}>
                      <ListItem>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography sx={{ fontStyle: 'italic' }}>{entityType.name}</Typography>
                              {entityRelations.length > 0 && (
                                <Chip 
                                  label={`${entityRelations.length} relations`} 
                                  size="small" 
                                  color="secondary" 
                                />
                              )}
                            </Box>
                          }
                          secondary={<GlossRenderer gloss={entityType.gloss} personaId={activePersonaId} inline />}
                        />
                        <ListItemSecondaryAction>
                          <IconButton edge="end" aria-label="edit" onClick={() => handleEditEntityType(entityType)}>
                            <EditIcon />
                          </IconButton>
                          <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteEntityType(entityType.id)}>
                            <DeleteIcon />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  )
                })}
              </List>
              <Fab
                color="primary"
                aria-label="add entity type"
                sx={{ position: 'fixed', bottom: 24, right: 24 }}
                onClick={handleAddEntityType}
              >
                <AddIcon />
              </Fab>
            </TabPanel>

            <TabPanel value={tabValue} index={1}>
              <List>
                {activeOntology.roles.map((role) => {
                  const roleRelations = activeOntology.relations.filter(r => 
                    (r.sourceType === 'role' && r.sourceId === role.id) ||
                    (r.targetType === 'role' && r.targetId === role.id)
                  )
                  
                  return (
                    <React.Fragment key={role.id}>
                      <ListItem>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {role.name}
                              {roleRelations.length > 0 && (
                                <Chip 
                                  label={`${roleRelations.length} relations`} 
                                  size="small" 
                                  color="secondary" 
                                />
                              )}
                            </Box>
                          }
                          secondary={`Allows: ${role.allowedFillerTypes.join(', ')}`}
                        />
                        <ListItemSecondaryAction>
                          <IconButton edge="end" aria-label="edit" onClick={() => handleEditRole(role)}>
                            <EditIcon />
                          </IconButton>
                          <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteRole(role.id)}>
                            <DeleteIcon />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  )
                })}
              </List>
              <Fab
                color="primary"
                aria-label="add role"
                sx={{ position: 'fixed', bottom: 24, right: 24 }}
                onClick={handleAddRole}
              >
                <AddIcon />
              </Fab>
            </TabPanel>

            <TabPanel value={tabValue} index={2}>
              <List>
                {activeOntology.events.map((eventType) => {
                  const eventRelations = activeOntology.relations.filter(r => 
                    (r.sourceType === 'event' && r.sourceId === eventType.id) ||
                    (r.targetType === 'event' && r.targetId === eventType.id)
                  )
                  
                  return (
                    <React.Fragment key={eventType.id}>
                      <ListItem>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography sx={{ fontStyle: 'italic' }}>{eventType.name}</Typography>
                              {eventRelations.length > 0 && (
                                <Chip 
                                  label={`${eventRelations.length} relations`} 
                                  size="small" 
                                  color="secondary" 
                                />
                              )}
                            </Box>
                          }
                          secondary={`${eventType.roles.length} roles`}
                        />
                        <ListItemSecondaryAction>
                          <IconButton edge="end" aria-label="edit" onClick={() => handleEditEventType(eventType)}>
                            <EditIcon />
                          </IconButton>
                          <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteEventType(eventType.id)}>
                            <DeleteIcon />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  )
                })}
              </List>
              <Fab
                color="primary"
                aria-label="add event type"
                sx={{ position: 'fixed', bottom: 24, right: 24 }}
                onClick={handleAddEventType}
              >
                <AddIcon />
              </Fab>
            </TabPanel>

            <TabPanel value={tabValue} index={3}>
              <List>
                {activeOntology.relationTypes.map((relationType) => {
                  const relationsOfType = activeOntology.relations.filter(r => r.relationTypeId === relationType.id)
                  
                  return (
                    <React.Fragment key={relationType.id}>
                      <ListItem>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {relationType.name}
                              {relationsOfType.length > 0 && (
                                <Chip 
                                  label={`${relationsOfType.length} instances`} 
                                  size="small" 
                                  color="primary" 
                                />
                              )}
                              {relationType.symmetric && <Chip label="symmetric" size="small" />}
                              {relationType.transitive && <Chip label="transitive" size="small" />}
                            </Box>
                          }
                          secondary={`${relationType.sourceTypes.join('/')} → ${relationType.targetTypes.join('/')}`}
                        />
                        <ListItemSecondaryAction>
                          <IconButton edge="end" aria-label="edit" onClick={() => handleEditRelationType(relationType)}>
                            <EditIcon />
                          </IconButton>
                          <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteRelationType(relationType.id)}>
                            <DeleteIcon />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  )
                })}
              </List>
              <Fab
                color="primary"
                aria-label="add relation type"
                sx={{ position: 'fixed', bottom: 24, right: 24 }}
                onClick={handleAddRelationType}
              >
                <AddIcon />
              </Fab>
            </TabPanel>
          </>
        )}
        
        {/* OBJECTS VIEW */}
        {mainView === 'objects' && (
          <>
            <TabPanel value={tabValue} index={0}>
              {/* Entities (non-location) */}
              <List>
                {nonLocationEntities.map((entity) => {
                  const typeAssignmentCount = entity.typeAssignments?.length || 0
                  
                  return (
                    <React.Fragment key={entity.id}>
                      <ListItem>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <ObjectIcon fontSize="small" color="action" />
                              <Typography>{entity.name}</Typography>
                              {typeAssignmentCount > 0 && (
                                <Chip 
                                  label={`${typeAssignmentCount} type${typeAssignmentCount > 1 ? 's' : ''}`} 
                                  size="small" 
                                  color="secondary" 
                                />
                              )}
                            </Box>
                          }
                          secondary={
                            entity.metadata?.alternateNames?.length > 0
                              ? `Also known as: ${entity.metadata.alternateNames.join(', ')}`
                              : undefined
                          }
                        />
                        <ListItemSecondaryAction>
                          <IconButton edge="end" aria-label="edit" onClick={() => handleEditEntity(entity)}>
                            <EditIcon />
                          </IconButton>
                          <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteEntity(entity.id)}>
                            <DeleteIcon />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  )
                })}
              </List>
              <Fab
                color="secondary"
                aria-label="add entity"
                sx={{ position: 'fixed', bottom: 24, right: 24 }}
                onClick={handleAddEntity}
              >
                <AddIcon />
              </Fab>
            </TabPanel>
            
            <TabPanel value={tabValue} index={1}>
              {/* Events */}
              <List>
                {events.map((event) => {
                  const interpretationCount = event.personaInterpretations?.length || 0
                  
                  return (
                    <React.Fragment key={event.id}>
                      <ListItem>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <EventIcon fontSize="small" color="action" />
                              <Typography>{event.name}</Typography>
                              {interpretationCount > 0 && (
                                <Chip 
                                  label={`${interpretationCount} interpretation${interpretationCount > 1 ? 's' : ''}`} 
                                  size="small" 
                                  color="secondary" 
                                />
                              )}
                              {event.time && (
                                <Chip
                                  label="has time"
                                  size="small"
                                  variant="outlined"
                                  icon={<TimeIcon />}
                                />
                              )}
                              {event.location && (
                                <Chip
                                  label="has location"
                                  size="small"
                                  variant="outlined"
                                  icon={<LocationIcon />}
                                />
                              )}
                            </Box>
                          }
                          secondary={
                            event.metadata?.certainty !== undefined && event.metadata.certainty < 1
                              ? `Certainty: ${(event.metadata.certainty * 100).toFixed(0)}%`
                              : undefined
                          }
                        />
                        <ListItemSecondaryAction>
                          <IconButton edge="end" aria-label="edit" onClick={() => handleEditEvent(event)}>
                            <EditIcon />
                          </IconButton>
                          <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteEvent(event.id)}>
                            <DeleteIcon />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  )
                })}
              </List>
              <Fab
                color="secondary"
                aria-label="add event"
                sx={{ position: 'fixed', bottom: 24, right: 24 }}
                onClick={handleAddEvent}
              >
                <AddIcon />
              </Fab>
            </TabPanel>
            
            <TabPanel value={tabValue} index={2}>
              {/* Locations */}
              <List>
                {locationEntities.map((location: any) => {
                  const typeAssignmentCount = location.typeAssignments?.length || 0
                  
                  return (
                    <React.Fragment key={location.id}>
                      <ListItem>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <LocationIcon fontSize="small" color="action" />
                              <Typography>{location.name}</Typography>
                              <Chip
                                label={location.locationType === 'point' ? 'Point' : 'Extent'}
                                size="small"
                                variant="outlined"
                              />
                              {typeAssignmentCount > 0 && (
                                <Chip 
                                  label={`${typeAssignmentCount} type${typeAssignmentCount > 1 ? 's' : ''}`} 
                                  size="small" 
                                  color="secondary" 
                                />
                              )}
                            </Box>
                          }
                          secondary={`${location.coordinateSystem || 'GPS'} coordinates`}
                        />
                        <ListItemSecondaryAction>
                          <IconButton edge="end" aria-label="edit" onClick={() => handleEditLocation(location)}>
                            <EditIcon />
                          </IconButton>
                          <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteLocation(location.id)}>
                            <DeleteIcon />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  )
                })}
              </List>
              <Fab
                color="secondary"
                aria-label="add location"
                sx={{ position: 'fixed', bottom: 24, right: 24 }}
                onClick={handleAddLocation}
              >
                <AddIcon />
              </Fab>
            </TabPanel>
            
            <TabPanel value={tabValue} index={3}>
              {/* Times */}
              <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setTimeBuilderOpen(true)}
                  startIcon={<TimeIcon />}
                >
                  Advanced Time Builder
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setTimeCollectionBuilderOpen(true)}
                  startIcon={<PatternIcon />}
                >
                  Pattern Designer
                </Button>
              </Box>
              <List>
                {times.map((time) => {
                  const hasVagueness = time.vagueness !== undefined
                  const hasDeictic = time.deictic !== undefined
                  const hasVideoRefs = time.videoReferences && time.videoReferences.length > 0
                  
                  return (
                    <React.Fragment key={time.id}>
                      <ListItem>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <TimeIcon fontSize="small" color="action" />
                              <Typography>
                                {time.type === 'instant' 
                                  ? `Instant: ${(time as any).timestamp || 'unspecified'}`
                                  : `Interval: ${(time as any).startTime || '?'} to ${(time as any).endTime || '?'}`
                                }
                              </Typography>
                              {hasVagueness && (
                                <Chip label="vague" size="small" variant="outlined" />
                              )}
                              {hasDeictic && (
                                <Chip label="deictic" size="small" variant="outlined" />
                              )}
                              {hasVideoRefs && (
                                <Chip 
                                  label={`${time.videoReferences!.length} video${time.videoReferences!.length > 1 ? 's' : ''}`} 
                                  size="small" 
                                  icon={<VideoIcon />}
                                  variant="outlined"
                                />
                              )}
                            </Box>
                          }
                          secondary={
                            time.certainty !== undefined && time.certainty < 1
                              ? `Certainty: ${(time.certainty * 100).toFixed(0)}%`
                              : undefined
                          }
                        />
                        <ListItemSecondaryAction>
                          <IconButton edge="end" aria-label="edit" onClick={() => handleEditTime(time)}>
                            <EditIcon />
                          </IconButton>
                          <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteTime(time.id)}>
                            <DeleteIcon />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  )
                })}
              </List>
              <Fab
                color="secondary"
                aria-label="add time"
                sx={{ position: 'fixed', bottom: 24, right: 24 }}
                onClick={handleAddTime}
              >
                <AddIcon />
              </Fab>
            </TabPanel>
          </>
        )}
        </Paper>

      {/* Type Editors */}
      {entityTypeEditorOpen && (
        <EntityTypeEditor
          open={entityTypeEditorOpen}
          onClose={() => setEntityTypeEditorOpen(false)}
          entity={selectedEntityType}
          personaId={activePersonaId}
        />
      )}

      {roleEditorOpen && (
        <RoleEditor
          open={roleEditorOpen}
          onClose={() => setRoleEditorOpen(false)}
          role={selectedRole}
          personaId={activePersonaId}
        />
      )}

      {eventTypeEditorOpen && (
        <EventTypeEditor
          open={eventTypeEditorOpen}
          onClose={() => setEventTypeEditorOpen(false)}
          event={selectedEventType}
          personaId={activePersonaId}
        />
      )}
      
      {/* Object Editors */}
      {entityEditorOpen && (
        <EntityEditor
          open={entityEditorOpen}
          onClose={() => setEntityEditorOpen(false)}
          entity={selectedEntity}
        />
      )}
      
      {eventEditorOpen && (
        <EventEditor
          open={eventEditorOpen}
          onClose={() => setEventEditorOpen(false)}
          event={selectedEvent}
        />
      )}
      
      {timeEditorOpen && (
        <TimeEditor
          open={timeEditorOpen}
          onClose={() => setTimeEditorOpen(false)}
          time={selectedTime}
        />
      )}
      
      {locationEditorOpen && (
        <LocationEditor
          open={locationEditorOpen}
          onClose={() => setLocationEditorOpen(false)}
          location={selectedLocation}
        />
      )}
      
      {timeBuilderOpen && (
        <TimeBuilder
          open={timeBuilderOpen}
          onClose={() => setTimeBuilderOpen(false)}
        />
      )}
      
      {timeCollectionBuilderOpen && (
        <TimeCollectionBuilder
          open={timeCollectionBuilderOpen}
          onClose={() => setTimeCollectionBuilderOpen(false)}
        />
      )}

      {relationTypeEditorOpen && (
        <RelationTypeEditor
          open={relationTypeEditorOpen}
          onClose={() => setRelationTypeEditorOpen(false)}
          relationType={selectedRelationType}
          personaId={activePersonaId}
        />
      )}

      
      {/* Floating Action Button to return to last annotation */}
      {lastAnnotation.videoId && (
        <Tooltip title="Return to Annotation (Cmd/Ctrl + O)" placement="left">
          <Fab
            color="secondary"
            aria-label="return to annotation"
            onClick={() => navigate(`/annotate/${lastAnnotation.videoId}`)}
            sx={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              zIndex: 1000,
            }}
          >
            <VideoIcon />
          </Fab>
        </Tooltip>
      )}
    </Box>
  )
}