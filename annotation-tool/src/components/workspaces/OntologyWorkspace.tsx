import { useState, useRef, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { usePreferences } from '../../hooks/usePreferences'
import { useCommands, useCommandContext } from '../../hooks/useCommands.js'
import {
  Box,
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
  Category as EntityTypeIcon,
  GroupWork as RoleIcon,
  Event as EventTypeIcon,
  Share as RelationIcon,
  ArrowBack as BackIcon,
  Search as SearchIcon,
  AutoAwesome as AutoAwesomeIcon,
} from '@mui/icons-material'
import { RootState, AppDispatch } from '../../store/store'
import PersonaBrowser from '../browsers/PersonaBrowser'
import PersonaEditor from '../PersonaEditor'
import EntityTypeEditor from '../EntityTypeEditor'
import RoleEditor from '../RoleEditor'
import EventTypeEditor from '../EventTypeEditor'
import RelationTypeEditor from '../RelationTypeEditor'
import { GlossRenderer } from '../GlossRenderer'
import { glossToText } from '../../utils/glossUtils'
import { WikidataChip } from '../shared/WikidataChip'
import {
  deleteEntityFromPersona,
  deleteRoleFromPersona,
  deleteEventFromPersona,
  deleteRelationType,
  savePersonaOntology,
} from '../../store/personaSlice'
import { OntologyAugmenter, OntologyCategory } from '../OntologyAugmenter'
import { useModelConfig } from '../../hooks/useModelConfig'

/**
 * Props for the TabPanel component.
 *
 * @property children - Content to render within the tab panel
 * @property index - Zero-based index of this panel
 * @property value - Currently active tab index
 */
interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

/**
 * Tab panel component that conditionally renders content based on active tab.
 * Provides accessible tabpanel structure with ARIA attributes.
 *
 * @param props - Component props
 * @returns Hidden div when inactive, visible content when tab is selected
 *
 * @example
 * ```tsx
 * <TabPanel value={activeTab} index={0}>
 *   <EntityTypeList />
 * </TabPanel>
 * ```
 */
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

/**
 * Ontology workspace for managing persona-specific type definitions.
 * Provides tabbed interface for entity, role, event, and relation types with search,
 * CRUD operations, and AI-powered type suggestions.
 *
 * @returns React component rendering persona browser or ontology editor with tabs
 *
 * @example
 * ```tsx
 * <Route path="/ontology" element={<OntologyWorkspace />} />
 * ```
 */
export default function OntologyWorkspace() {
  const dispatch = useDispatch<AppDispatch>()
  const { personas = [], personaOntologies = [] } = useSelector((state: RootState) => state.persona)
  const { entities = [], events = [], times = [] } = useSelector((state: RootState) => state.world)
  const { data: modelConfig, error: modelConfigError } = useModelConfig()
  // Treat model service as CPU-only if unavailable (e.g., in E2E tests)
  const isCpuOnly = !!modelConfigError || !modelConfig?.cudaAvailable

  // Use preferences for smart defaults
  const {
    lastPersonaId,
    setLastPersonaId,
    getFilterState,
    setFilterState,
  } = usePreferences()
  
  // Initialize with last used persona or first available
  const [selectedPersonaId, setSelectedPersonaIdState] = useState<string | null>(
    lastPersonaId && personas.some(p => p.id === lastPersonaId) 
      ? lastPersonaId 
      : personas[0]?.id || null
  )
  
  // Wrapper to also save to preferences
  const setSelectedPersonaId = (id: string | null) => {
    setSelectedPersonaIdState(id)
    if (id) setLastPersonaId(id)
  }
  
  const [personaEditorOpen, setPersonaEditorOpen] = useState(false)
  const [editingPersona, setEditingPersona] = useState<typeof personas[0] | null>(null)
  const [tabValue, setTabValue] = useState(0)
  
  // Initialize search from saved filter state
  const initialFilterState = getFilterState('ontology')
  const [searchTerm, setSearchTermState] = useState(initialFilterState.searchQuery || '')
  
  // Wrapper to also save search term
  const setSearchTerm = (term: string) => {
    setSearchTermState(term)
    setFilterState('ontology', { ...getFilterState('ontology'), searchQuery: term })
  }
  
  // Type editor states
  const [entityTypeEditorOpen, setEntityTypeEditorOpen] = useState(false)
  const [roleEditorOpen, setRoleEditorOpen] = useState(false)
  const [eventTypeEditorOpen, setEventTypeEditorOpen] = useState(false)
  const [relationTypeEditorOpen, setRelationTypeEditorOpen] = useState(false)
  
  const [selectedEntityType, setSelectedEntityType] = useState<any>(null)
  const [selectedRole, setSelectedRole] = useState<any>(null)
  const [selectedEventType, setSelectedEventType] = useState<any>(null)
  const [selectedRelationType, setSelectedRelationType] = useState<any>(null)

  // Ontology Augmenter state
  const [augmenterOpen, setAugmenterOpen] = useState(false)
  const [augmenterCategory, setAugmenterCategory] = useState<OntologyCategory>('entity')

  // Refs for managing focus
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(-1)

  const selectedPersona = personas.find(p => p.id === selectedPersonaId)
  const selectedOntology = personaOntologies.find(o => o.personaId === selectedPersonaId)

  // Auto-save persona ontology on changes (debounced 1 second)
  useEffect(() => {
    if (!selectedPersonaId || !selectedOntology) return

    const timeoutId = setTimeout(() => {
      dispatch(savePersonaOntology({
        personaId: selectedPersonaId,
        ontology: selectedOntology
      }))
    }, 1000)

    return () => clearTimeout(timeoutId)
  }, [selectedPersonaId, selectedOntology, dispatch])

  /**
   * Filters ontology type items by search term.
   * Searches across name, gloss text, and Wikidata ID fields.
   *
   * @param item - Ontology type item (entity, role, event, or relation type)
   * @returns True if item matches search term, false otherwise
   */
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

  /**
   * Returns to persona browser view, clearing selected persona.
   */
  const handleBackToBrowser = () => {
    setSelectedPersonaId(null)
    setTabValue(0)
  }

  /**
   * Opens the appropriate type editor dialog based on active tab.
   * Creates a new entity, role, event, or relation type.
   */
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

  /**
   * Opens the ontology augmenter dialog for AI-powered type suggestions.
   *
   * @param category - Ontology category to generate suggestions for
   */
  const handleOpenAugmenter = (category: OntologyCategory) => {
    setAugmenterCategory(category)
    setAugmenterOpen(true)
  }

  /**
   * Gets the currently visible list items based on active tab.
   *
   * @returns Filtered list of items for the current tab (entities, roles, events, or relations)
   */
  const getCurrentItems = () => {
    switch(tabValue) {
      case 0: return filteredEntities
      case 1: return filteredRoles
      case 2: return filteredEvents
      case 3: return filteredRelations
      default: return []
    }
  }
  
  // Set command context for when clauses
  useCommandContext({
    ontologyWorkspaceActive: selectedPersonaId !== null,
    annotationWorkspaceActive: false,
    objectWorkspaceActive: false,
    videoBrowserActive: false,
    dialogOpen: personaEditorOpen || entityTypeEditorOpen || roleEditorOpen || eventTypeEditorOpen || relationTypeEditorOpen || augmenterOpen,
    inputFocused: false, // Updated dynamically by focus events in App.tsx
    typeSelected: selectedItemIndex >= 0,
  })

  // Register command handlers
  useCommands({
    'ontology.newType': () => handleAddType(),
    'ontology.nextTab': () => setTabValue((prev) => (prev + 1) % 4),
    'ontology.previousTab': () => setTabValue((prev) => (prev - 1 + 4) % 4),
    'ontology.suggestTypes': () => {
      const categoryMap: Record<number, OntologyCategory> = {
        0: 'entity',
        1: 'role',
        2: 'event',
        3: 'relation',
      }
      const category = categoryMap[tabValue] || 'entity'
      handleOpenAugmenter(category)
    },
    'ontology.editType': () => {
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
    'ontology.deleteType': () => {
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
    'ontology.duplicateType': () => {
      // TODO: Implement duplication logic
      alert('Duplicate type not yet implemented')
    },
    'ontology.search': () => {
      searchInputRef.current?.focus()
    },
  }, {
    context: 'ontologyWorkspace'
  })
  
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
          <IconButton edge="start" onClick={handleBackToBrowser} sx={{ mr: 2 }} aria-label="Back to persona browser">
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
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Tooltip title={isCpuOnly ? 'GPU required for AI-powered suggestions (CPU-only mode detected)' : ''}>
              <span>
                <Button
                  variant="outlined"
                  startIcon={<AutoAwesomeIcon />}
                  onClick={() => handleOpenAugmenter('entity')}
                  size="small"
                  disabled={isCpuOnly}
                >
                  Suggest Types
                </Button>
              </span>
            </Tooltip>
          </Box>
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
                  <IconButton edge="end" onClick={() => handleEditEntityType(entity)} aria-label={`Edit ${entity.name}`}>
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    edge="end"
                    onClick={() => dispatch(deleteEntityFromPersona({
                      personaId: selectedPersonaId,
                      entityId: entity.id
                    }))}
                    aria-label={`Delete ${entity.name}`}
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Tooltip title={isCpuOnly ? 'GPU required for AI-powered suggestions (CPU-only mode detected)' : ''}>
              <span>
                <Button
                  variant="outlined"
                  startIcon={<AutoAwesomeIcon />}
                  onClick={() => handleOpenAugmenter('role')}
                  size="small"
                  disabled={isCpuOnly}
                >
                  Suggest Types
                </Button>
              </span>
            </Tooltip>
          </Box>
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
                        Allowed fillers: {(role.allowedFillerTypes || []).join(', ')}
                      </Typography>
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton edge="end" onClick={() => handleEditRole(role)} aria-label={`Edit ${role.name}`}>
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    edge="end"
                    onClick={() => dispatch(deleteRoleFromPersona({
                      personaId: selectedPersonaId,
                      roleId: role.id
                    }))}
                    aria-label={`Delete ${role.name}`}
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Tooltip title={isCpuOnly ? 'GPU required for AI-powered suggestions (CPU-only mode detected)' : ''}>
              <span>
                <Button
                  variant="outlined"
                  startIcon={<AutoAwesomeIcon />}
                  onClick={() => handleOpenAugmenter('event')}
                  size="small"
                  disabled={isCpuOnly}
                >
                  Suggest Types
                </Button>
              </span>
            </Tooltip>
          </Box>
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
                  <IconButton edge="end" onClick={() => handleEditEventType(event)} aria-label={`Edit ${event.name}`}>
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    edge="end"
                    onClick={() => dispatch(deleteEventFromPersona({
                      personaId: selectedPersonaId,
                      eventId: event.id
                    }))}
                    aria-label={`Delete ${event.name}`}
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </TabPanel>

        <TabPanel value={tabValue} index={3}>
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Tooltip title={isCpuOnly ? 'GPU required for AI-powered suggestions (CPU-only mode detected)' : ''}>
              <span>
                <Button
                  variant="outlined"
                  startIcon={<AutoAwesomeIcon />}
                  onClick={() => handleOpenAugmenter('relation')}
                  size="small"
                  disabled={isCpuOnly}
                >
                  Suggest Types
                </Button>
              </span>
            </Tooltip>
          </Box>
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
                  <IconButton edge="end" onClick={() => handleEditRelationType(relation)} aria-label={`Edit ${relation.name}`}>
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    edge="end"
                    onClick={() => dispatch(deleteRelationType({
                      personaId: selectedPersonaId,
                      relationTypeId: relation.id
                    }))}
                    aria-label={`Delete ${relation.name}`}
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
        relationType={selectedRelationType}
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

      {/* Ontology Augmenter Dialog */}
      {augmenterOpen && selectedPersonaId && (
        <Box
          sx={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1300,
            maxWidth: '800px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto',
          }}
        >
          <OntologyAugmenter
            personaId={selectedPersonaId}
            personaName={selectedPersona?.name}
            initialCategory={augmenterCategory}
            onClose={() => setAugmenterOpen(false)}
          />
        </Box>
      )}
    </Box>
  )
}