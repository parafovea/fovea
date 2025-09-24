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
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Fab,
  Alert,
  Chip,
  Tooltip,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Person as PersonaIcon,
  AccountTree as RelationIcon,
  ImportExport as ImportIcon,
  Link as LinkIcon,
  VideoLibrary as VideoIcon,
} from '@mui/icons-material'
import { RootState, AppDispatch } from '../store/store'
import EntityEditor from './EntityEditor'
import RoleEditor from './RoleEditor'
import EventEditor from './EventEditor'
import PersonaManager from './PersonaManager'
import RelationTypeEditor from './RelationTypeEditor'
import ImportDialog from './ImportDialog'
import RelationManager from './RelationManager'
import {
  addEntityToPersona,
  updateEntityInPersona,
  deleteEntityFromPersona,
  addRoleToPersona,
  updateRoleInPersona,
  deleteRoleFromPersona,
  addEventToPersona,
  updateEventInPersona,
  deleteEventFromPersona,
  deleteRelationType,
} from '../store/personaSlice'

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
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  )
}

export default function OntologyBuilder() {
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const { activePersonaId, personaOntologies, personas } = useSelector((state: RootState) => state.persona)
  const lastAnnotation = useSelector((state: RootState) => state.videos.lastAnnotation)
  const activeOntology = personaOntologies.find(o => o.personaId === activePersonaId)
  const activePersona = personas.find(p => p.id === activePersonaId)
  
  const [tabValue, setTabValue] = useState(0)
  const [entityEditorOpen, setEntityEditorOpen] = useState(false)
  const [roleEditorOpen, setRoleEditorOpen] = useState(false)
  const [eventEditorOpen, setEventEditorOpen] = useState(false)
  const [relationTypeEditorOpen, setRelationTypeEditorOpen] = useState(false)
  const [relationManagerOpen, setRelationManagerOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState(null)
  const [selectedRole, setSelectedRole] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [selectedRelationType, setSelectedRelationType] = useState(null)

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue)
  }

  const handleAddEntity = () => {
    setSelectedEntity(null)
    setEntityEditorOpen(true)
  }

  const handleEditEntity = (entity: any) => {
    setSelectedEntity(entity)
    setEntityEditorOpen(true)
  }

  const handleDeleteEntity = (entityId: string) => {
    if (activePersonaId && window.confirm('Delete this entity?')) {
      dispatch(deleteEntityFromPersona({ personaId: activePersonaId, entityId }))
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

  const handleAddEvent = () => {
    setSelectedEvent(null)
    setEventEditorOpen(true)
  }

  const handleEditEvent = (event: any) => {
    setSelectedEvent(event)
    setEventEditorOpen(true)
  }

  const handleDeleteEvent = (eventId: string) => {
    if (activePersonaId && window.confirm('Delete this event?')) {
      dispatch(deleteEventFromPersona({ personaId: activePersonaId, eventId }))
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

  const relationsForCurrentTab = () => {
    if (!activeOntology) return []
    const type = tabValue === 0 ? 'entity' : tabValue === 1 ? 'role' : tabValue === 2 ? 'event' : null
    if (!type) return []
    
    return activeOntology.relations.filter(r => 
      r.sourceType === type || r.targetType === type
    )
  }

  return (
    <Box sx={{ width: '100%' }}>
      <PersonaManager />

      <Box sx={{ mb: 2, display: 'flex', gap: 2 }}>
        <Button
          variant="outlined"
          startIcon={<ImportIcon />}
          onClick={() => setImportDialogOpen(true)}
          disabled={personas.length < 2}
        >
          Import from Other Persona
        </Button>
        <Button
          variant="outlined"
          startIcon={<LinkIcon />}
          onClick={() => setRelationManagerOpen(true)}
        >
          Manage Relations
        </Button>
      </Box>

      <Paper sx={{ width: '100%' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="ontology tabs">
            <Tab label={`Entities (${activeOntology.entities.length})`} />
            <Tab label={`Roles (${activeOntology.roles.length})`} />
            <Tab label={`Events (${activeOntology.events.length})`} />
            <Tab label={`Relation Types (${activeOntology.relationTypes.length})`} />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          <List>
            {activeOntology.entities.map((entity) => {
              const entityRelations = activeOntology.relations.filter(r => 
                (r.sourceType === 'entity' && r.sourceId === entity.id) ||
                (r.targetType === 'entity' && r.targetId === entity.id)
              )
              
              return (
                <React.Fragment key={entity.id}>
                  <ListItem>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {entity.name}
                          {entityRelations.length > 0 && (
                            <Chip 
                              label={`${entityRelations.length} relations`} 
                              size="small" 
                              color="secondary" 
                            />
                          )}
                        </Box>
                      }
                      secondary={entity.gloss.map(g => g.content).join(' ')}
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
            color="primary"
            aria-label="add entity"
            sx={{ position: 'fixed', bottom: 24, right: 24 }}
            onClick={handleAddEntity}
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
            {activeOntology.events.map((event) => {
              const eventRelations = activeOntology.relations.filter(r => 
                (r.sourceType === 'event' && r.sourceId === event.id) ||
                (r.targetType === 'event' && r.targetId === event.id)
              )
              
              return (
                <React.Fragment key={event.id}>
                  <ListItem>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {event.name}
                          {eventRelations.length > 0 && (
                            <Chip 
                              label={`${eventRelations.length} relations`} 
                              size="small" 
                              color="secondary" 
                            />
                          )}
                        </Box>
                      }
                      secondary={`${event.roles.length} roles`}
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
            color="primary"
            aria-label="add event"
            sx={{ position: 'fixed', bottom: 24, right: 24 }}
            onClick={handleAddEvent}
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
      </Paper>

      {entityEditorOpen && (
        <EntityEditor
          open={entityEditorOpen}
          onClose={() => setEntityEditorOpen(false)}
          entity={selectedEntity}
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

      {eventEditorOpen && (
        <EventEditor
          open={eventEditorOpen}
          onClose={() => setEventEditorOpen(false)}
          event={selectedEvent}
          personaId={activePersonaId}
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

      {importDialogOpen && (
        <ImportDialog
          open={importDialogOpen}
          onClose={() => setImportDialogOpen(false)}
          targetPersonaId={activePersonaId}
        />
      )}

      {relationManagerOpen && (
        <RelationManager
          open={relationManagerOpen}
          onClose={() => setRelationManagerOpen(false)}
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