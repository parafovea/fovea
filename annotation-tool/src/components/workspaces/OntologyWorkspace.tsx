import { useState, useRef, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  Tabs,
  Tab,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Fab,
  Divider,
  AppBar,
  Tooltip,
  Toolbar,
  Button,
  TextField,
  InputAdornment,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
  Category as EntityTypeIcon,
  GroupWork as RoleIcon,
  Event as EventTypeIcon,
  Share as RelationIcon,
  ArrowBack as BackIcon,
  Search as SearchIcon,
} from '@mui/icons-material'
import { RootState, AppDispatch } from '../../store/store'
import PersonaBrowser from '../browsers/PersonaBrowser'
import PersonaEditor from '../PersonaEditor'
import EntityTypeEditor from '../EntityTypeEditor'
import RoleEditor from '../RoleEditor'
import EventTypeEditor from '../EventTypeEditor'
import RelationTypeEditor from '../RelationTypeEditor'
import { GlossRenderer, glossToText } from '../GlossRenderer'
import { WikidataChip } from '../shared/WikidataChip'
import {
  deleteEntityFromPersona,
  deleteRoleFromPersona,
  deleteEventFromPersona,
  deleteRelationType,
} from '../../store/personaSlice'
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
      id={`ontology-tabpanel-${index}`}
      aria-labelledby={`ontology-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  )
}

export default function OntologyWorkspace() {
  const dispatch = useDispatch<AppDispatch>()
  const { personas, personaOntologies } = useSelector((state: RootState) => state.persona)
  const { entities, events, times } = useSelector((state: RootState) => state.world)
  
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null)
  const [personaEditorOpen, setPersonaEditorOpen] = useState(false)
  const [editingPersona, setEditingPersona] = useState<typeof personas[0] | null>(null)
  const [tabValue, setTabValue] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  
  // Type editor states
  const [entityTypeEditorOpen, setEntityTypeEditorOpen] = useState(false)
  const [roleEditorOpen, setRoleEditorOpen] = useState(false)
  const [eventTypeEditorOpen, setEventTypeEditorOpen] = useState(false)
  const [relationTypeEditorOpen, setRelationTypeEditorOpen] = useState(false)
  
  const [selectedEntityType, setSelectedEntityType] = useState<any>(null)
  const [selectedRole, setSelectedRole] = useState<any>(null)
  const [selectedEventType, setSelectedEventType] = useState<any>(null)
  const [selectedRelationType, setSelectedRelationType] = useState<any>(null)
  
  // Refs for managing focus
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(-1)

  const selectedPersona = personas.find(p => p.id === selectedPersonaId)
  const selectedOntology = personaOntologies.find(o => o.personaId === selectedPersonaId)

  // Filter functions for each type
  const filterBySearchTerm = (item: any) => {
    if (!searchTerm) return true
    const searchLower = searchTerm.toLowerCase()
    
    // Check name
    if (item.name?.toLowerCase().includes(searchLower)) return true
    
    // Check gloss - handle both array (correct format) and string (legacy)
    if (Array.isArray(item.gloss)) {
      // Convert gloss array to searchable text using the helper
      const glossText = glossToText(item.gloss, selectedOntology, { entities, events, times })
      if (glossText.toLowerCase().includes(searchLower)) return true
    } else if (typeof item.gloss === 'string' && item.gloss.toLowerCase().includes(searchLower)) {
      // Handle legacy string glosses if they exist
      return true
    }
    
    // Check wikidataId
    if (item.wikidataId?.toLowerCase().includes(searchLower)) return true
    
    return false
  }

  const filteredEntities = selectedOntology?.entities.filter(filterBySearchTerm) || []
  const filteredRoles = selectedOntology?.roles.filter(filterBySearchTerm) || []
  const filteredEvents = selectedOntology?.events.filter(filterBySearchTerm) || []
  const filteredRelations = selectedOntology?.relationTypes.filter(filterBySearchTerm) || []

  const handleSelectPersona = (personaId: string) => {
    setSelectedPersonaId(personaId)
  }

  const handleEditPersona = (persona: typeof personas[0]) => {
    setEditingPersona(persona)
    setPersonaEditorOpen(true)
  }

  const handleAddPersona = () => {
    setEditingPersona(null)
    setPersonaEditorOpen(true)
  }

  const handleBackToBrowser = () => {
    setSelectedPersonaId(null)
    setTabValue(0)
  }

  const handleAddType = () => {
    switch (tabValue) {
      case 0:
        setSelectedEntityType(null)
        setEntityTypeEditorOpen(true)
        break
      case 1:
        setSelectedRole(null)
        setRoleEditorOpen(true)
        break
      case 2:
        setSelectedEventType(null)
        setEventTypeEditorOpen(true)
        break
      case 3:
        setSelectedRelationType(null)
        setRelationTypeEditorOpen(true)
        break
    }
  }

  const handleEditEntityType = (type: any) => {
    setSelectedEntityType(type)
    setEntityTypeEditorOpen(true)
  }

  const handleEditRole = (role: any) => {
    setSelectedRole(role)
    setRoleEditorOpen(true)
  }

  const handleEditEventType = (event: any) => {
    setSelectedEventType(event)
    setEventTypeEditorOpen(true)
  }

  const handleEditRelationType = (relation: any) => {
    setSelectedRelationType(relation)
    setRelationTypeEditorOpen(true)
  }
  
  // Get the currently visible list items based on tab
  const getCurrentItems = () => {
    switch(tabValue) {
      case 0: return filteredEntities
      case 1: return filteredRoles
      case 2: return filteredEvents
      case 3: return filteredRelations
      default: return []
    }
  }
  
  // Setup keyboard shortcuts
  useWorkspaceKeyboardShortcuts('ontologyWorkspace', {
    'type.new': () => handleAddType(),
    'tab.next': () => setTabValue((prev) => (prev + 1) % 4),
    'tab.previous': () => setTabValue((prev) => (prev - 1 + 4) % 4),
    'item.edit': () => {
      const items = getCurrentItems()
      if (selectedItemIndex >= 0 && selectedItemIndex < items.length) {
        const item = items[selectedItemIndex]
        switch(tabValue) {
          case 0: handleEditEntityType(item); break
          case 1: handleEditRole(item); break
          case 2: handleEditEventType(item); break
          case 3: handleEditRelationType(item); break
        }
      }
    },
    'item.delete': () => {
      const items = getCurrentItems()
      if (selectedItemIndex >= 0 && selectedItemIndex < items.length && selectedPersonaId) {
        const item = items[selectedItemIndex]
        switch(tabValue) {
          case 0: dispatch(deleteEntityFromPersona({ personaId: selectedPersonaId, entityId: item.id })); break
          case 1: dispatch(deleteRoleFromPersona({ personaId: selectedPersonaId, roleId: item.id })); break
          case 2: dispatch(deleteEventFromPersona({ personaId: selectedPersonaId, eventId: item.id })); break
          case 3: dispatch(deleteRelationType({ personaId: selectedPersonaId, relationTypeId: item.id })); break
        }
      }
    },
    'type.duplicate': () => {
      // TODO: Implement duplication logic
      console.log('Duplicate type not yet implemented')
    },
    'search.focus': () => {
      searchInputRef.current?.focus()
    },
    'navigate.personaBrowser': () => {
      handleBackToBrowser()
    },
  }, selectedPersonaId !== null)
  
  // Handle item selection with mouse
  const handleItemClick = (index: number) => {
    setSelectedItemIndex(index)
  }
  
  // Reset selection when tab or search changes
  useEffect(() => {
    setSelectedItemIndex(-1)
  }, [tabValue, searchTerm])

  if (!selectedPersonaId) {
    return (
      <Box>
        <PersonaBrowser
          onSelectPersona={handleSelectPersona}
          onEditPersona={handleEditPersona}
          onAddPersona={handleAddPersona}
        />
        
        <PersonaEditor
          open={personaEditorOpen}
          onClose={() => {
            setPersonaEditorOpen(false)
            setEditingPersona(null)
          }}
          persona={editingPersona}
        />
      </Box>
    )
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2 }}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Search types by name or description..."
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
        />
      </Box>

      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <IconButton edge="start" onClick={handleBackToBrowser} sx={{ mr: 2 }}>
            <BackIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">
              {selectedPersona?.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {selectedPersona?.role} - {selectedPersona?.informationNeed}
            </Typography>
          </Box>
          <Button
            startIcon={<EditIcon />}
            onClick={() => handleEditPersona(selectedPersona!)}
          >
            Edit Persona
          </Button>
        </Toolbar>
      </AppBar>

      <Paper sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
          <Tab 
            icon={<EntityTypeIcon />} 
            label={`Entity Types (${filteredEntities.length}/${selectedOntology?.entities.length || 0})`} 
          />
          <Tab 
            icon={<RoleIcon />} 
            label={`Role Types (${filteredRoles.length}/${selectedOntology?.roles.length || 0})`} 
          />
          <Tab 
            icon={<EventTypeIcon />} 
            label={`Event Types (${filteredEvents.length}/${selectedOntology?.events.length || 0})`} 
          />
          <Tab 
            icon={<RelationIcon />} 
            label={`Relation Types (${filteredRelations.length}/${selectedOntology?.relationTypes.length || 0})`} 
          />
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
                      <Typography>{entity.name}</Typography>
                      <WikidataChip 
                        wikidataId={entity.wikidataId}
                        wikidataUrl={entity.wikidataUrl}
                        importedAt={entity.importedAt}
                        size="small"
                        showTimestamp={false}
                      />
                    </Box>
                  }
                  secondary={<GlossRenderer gloss={entity.gloss} personaId={selectedPersonaId} />}
                />
                <ListItemSecondaryAction>
                  <IconButton edge="end" onClick={() => handleEditEntityType(entity)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton 
                    edge="end" 
                    onClick={() => dispatch(deleteEntityFromPersona({ 
                      personaId: selectedPersonaId, 
                      entityId: entity.id 
                    }))}
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <List>
            {filteredRoles.map((role, index) => (
              <ListItem 
                key={role.id} 
                divider
                selected={selectedItemIndex === index}
                onClick={() => handleItemClick(index)}
                sx={{ cursor: 'pointer' }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography>{role.name}</Typography>
                      <WikidataChip 
                        wikidataId={role.wikidataId}
                        wikidataUrl={role.wikidataUrl}
                        importedAt={role.importedAt}
                        size="small"
                        showTimestamp={false}
                      />
                    </Box>
                  }
                  secondary={
                    <Box>
                      <GlossRenderer gloss={role.gloss} personaId={selectedPersonaId} />
                      <Typography variant="caption" component="div">
                        Allowed fillers: {role.allowedFillerTypes.join(', ')}
                      </Typography>
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton edge="end" onClick={() => handleEditRole(role)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton 
                    edge="end" 
                    onClick={() => dispatch(deleteRoleFromPersona({ 
                      personaId: selectedPersonaId, 
                      roleId: role.id 
                    }))}
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
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
                      <Typography>{event.name}</Typography>
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
                    <Box>
                      <GlossRenderer gloss={event.gloss} personaId={selectedPersonaId} />
                      {event.roles.length > 0 && (
                        <Typography variant="caption" component="div">
                          Roles: {event.roles.length}
                        </Typography>
                      )}
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton edge="end" onClick={() => handleEditEventType(event)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton 
                    edge="end" 
                    onClick={() => dispatch(deleteEventFromPersona({ 
                      personaId: selectedPersonaId, 
                      eventId: event.id 
                    }))}
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </TabPanel>

        <TabPanel value={tabValue} index={3}>
          <List>
            {filteredRelations.map((relation, index) => (
              <ListItem 
                key={relation.id} 
                divider
                selected={selectedItemIndex === index}
                onClick={() => handleItemClick(index)}
                sx={{ cursor: 'pointer' }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography>{relation.name}</Typography>
                      <WikidataChip 
                        wikidataId={relation.wikidataId}
                        wikidataUrl={relation.wikidataUrl}
                        importedAt={relation.importedAt}
                        size="small"
                        showTimestamp={false}
                      />
                    </Box>
                  }
                  secondary={
                    <Box>
                      <GlossRenderer gloss={relation.gloss} personaId={selectedPersonaId} />
                      <Typography variant="caption" component="div">
                        {relation.sourceTypes.join(', ')} → {relation.targetTypes.join(', ')}
                      </Typography>
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton edge="end" onClick={() => handleEditRelationType(relation)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton 
                    edge="end" 
                    onClick={() => dispatch(deleteRelationType({ 
                      personaId: selectedPersonaId, 
                      relationTypeId: relation.id 
                    }))}
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </TabPanel>
      </Box>

      <Tooltip title="Add New Type (Cmd/Ctrl+N)" placement="left">
        <Fab
          color="primary"
          aria-label="add type"
          sx={{
            position: 'absolute',
            bottom: 16,
            right: 16,
          }}
          onClick={handleAddType}
        >
          <AddIcon />
        </Fab>
      </Tooltip>

      {/* Type Editors */}
      <EntityTypeEditor
        open={entityTypeEditorOpen}
        onClose={() => {
          setEntityTypeEditorOpen(false)
          setSelectedEntityType(null)
        }}
        entity={selectedEntityType}
        personaId={selectedPersonaId}
      />
      
      <RoleEditor
        open={roleEditorOpen}
        onClose={() => {
          setRoleEditorOpen(false)
          setSelectedRole(null)
        }}
        role={selectedRole}
        personaId={selectedPersonaId}
      />
      
      <EventTypeEditor
        open={eventTypeEditorOpen}
        onClose={() => {
          setEventTypeEditorOpen(false)
          setSelectedEventType(null)
        }}
        event={selectedEventType}
        personaId={selectedPersonaId}
      />
      
      <RelationTypeEditor
        open={relationTypeEditorOpen}
        onClose={() => {
          setRelationTypeEditorOpen(false)
          setSelectedRelationType(null)
        }}
        relation={selectedRelationType}
        personaId={selectedPersonaId}
      />
      
      <PersonaEditor
        open={personaEditorOpen}
        onClose={() => {
          setPersonaEditorOpen(false)
          setEditingPersona(null)
        }}
        persona={editingPersona}
      />
    </Box>
  )
}