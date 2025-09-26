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
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Inventory2 as ObjectIcon,
  Language as WikidataIcon,
} from '@mui/icons-material'
import { RootState, AppDispatch } from '../../store/store'
import { addEntity, updateEntity, addEntityTypeAssignment, removeEntityTypeAssignment } from '../../store/worldSlice'
import { Entity, EntityTypeAssignment, GlossItem, EntityType } from '../../models/types'
import GlossEditor from '../GlossEditor'
import { TypeObjectBadge } from '../shared/TypeObjectToggle'
import WikidataSearch from '../WikidataSearch'

interface EntityEditorProps {
  open: boolean
  onClose: () => void
  entity: Entity | null
}

export default function EntityEditor({ open, onClose, entity }: EntityEditorProps) {
  const dispatch = useDispatch<AppDispatch>()
  const { personas, personaOntologies, activePersonaId } = useSelector((state: RootState) => state.persona)
  
  const [name, setName] = useState('')
  const [description, setDescription] = useState<GlossItem[]>([{ type: 'text', content: '' }])
  const [alternateNames, setAlternateNames] = useState<string[]>([])
  const [typeAssignments, setTypeAssignments] = useState<EntityTypeAssignment[]>([])
  const [importMode, setImportMode] = useState<'manual' | 'wikidata'>('manual')
  const [wikidataId, setWikidataId] = useState<string>('')
  const [wikidataUrl, setWikidataUrl] = useState<string>('')
  
  // For adding new type assignment
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('')
  const [selectedEntityTypeId, setSelectedEntityTypeId] = useState<string>('')
  const [assignmentConfidence, setAssignmentConfidence] = useState<number>(1.0)
  const [assignmentJustification, setAssignmentJustification] = useState('')

  useEffect(() => {
    if (entity) {
      setName(entity.name)
      setDescription(entity.description)
      setAlternateNames(entity.metadata?.alternateNames || [])
      setTypeAssignments(entity.typeAssignments || [])
      setWikidataId(entity.wikidataId || '')
      setWikidataUrl(entity.wikidataUrl || '')
    } else {
      setName('')
      setDescription([{ type: 'text', content: '' }])
      setAlternateNames([])
      setTypeAssignments([])
      setWikidataId('')
      setWikidataUrl('')
    }
  }, [entity])

  const handleAddTypeAssignment = () => {
    if (selectedPersonaId && selectedEntityTypeId) {
      const newAssignment: EntityTypeAssignment = {
        personaId: selectedPersonaId,
        entityTypeId: selectedEntityTypeId,
        confidence: assignmentConfidence,
        justification: assignmentJustification || undefined,
      }
      
      // Remove any existing assignment for this persona
      const filtered = typeAssignments.filter(a => a.personaId !== selectedPersonaId)
      setTypeAssignments([...filtered, newAssignment])
      
      // Reset form
      setSelectedEntityTypeId('')
      setAssignmentConfidence(1.0)
      setAssignmentJustification('')
    }
  }

  const handleRemoveTypeAssignment = (personaId: string) => {
    setTypeAssignments(typeAssignments.filter(a => a.personaId !== personaId))
  }

  const handleSave = () => {
    const now = new Date().toISOString()
    const entityData: Omit<Entity, 'id' | 'createdAt' | 'updatedAt'> = {
      name,
      description,
      typeAssignments,
      wikidataId: wikidataId || undefined,
      wikidataUrl: wikidataUrl || undefined,
      importedFrom: wikidataId ? (entity?.importedFrom || 'wikidata') : undefined,
      importedAt: wikidataId ? (entity?.importedAt || now) : undefined,
      metadata: {
        alternateNames: alternateNames.filter(Boolean),
        externalIds: {},
        properties: {},
      },
    }

    if (entity) {
      dispatch(updateEntity({ ...entity, ...entityData }))
    } else {
      dispatch(addEntity(entityData))
    }

    onClose()
  }

  const getEntityTypeName = (personaId: string, entityTypeId: string): string => {
    const ontology = personaOntologies.find(o => o.personaId === personaId)
    const entityType = ontology?.entities.find(e => e.id === entityTypeId)
    return entityType?.name || 'Unknown Type'
  }

  const getPersonaName = (personaId: string): string => {
    const persona = personas.find(p => p.id === personaId)
    return persona?.name || 'Unknown Persona'
  }

  const availableEntityTypes = selectedPersonaId
    ? personaOntologies.find(o => o.personaId === selectedPersonaId)?.entities || []
    : []

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ObjectIcon color="secondary" />
          {entity ? 'Edit Entity' : 'Create Entity'}
          <TypeObjectBadge isType={false} />
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <Alert severity="info" icon={<ObjectIcon />}>
            An entity is an actual thing in the world (e.g., "John Smith", "The White House").
            This is different from entity types which are categories (e.g., "Person", "Building").
          </Alert>

          {!entity && (
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

          {importMode === 'wikidata' && !entity && (
            <WikidataSearch
              entityType="object"
              objectSubtype="entity"
              onImport={(data) => {
                setName(data.name)
                setDescription([{ type: 'text', content: data.description || `${data.name} from Wikidata.` }])
                setAlternateNames(data.aliases || [])
                setWikidataId(data.wikidataId)
                setWikidataUrl(data.wikidataUrl)
              }}
            />
          )}

          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            helperText="The specific name of this entity"
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

          <TextField
            label="Alternate Names"
            value={alternateNames.join(', ')}
            onChange={(e) => setAlternateNames(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            fullWidth
            helperText="Other names for this entity (comma-separated)"
          />

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

          <Divider />

          <Box>
            <Typography variant="h6" gutterBottom>
              Type Assignments by Persona
            </Typography>
            <Typography variant="caption" color="text.secondary" paragraph>
              Different personas can classify this entity with different types from their ontologies.
            </Typography>

            {/* List existing type assignments */}
            {typeAssignments.length > 0 && (
              <List dense>
                {typeAssignments.map((assignment) => (
                  <ListItem key={assignment.personaId}>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip 
                            label={getPersonaName(assignment.personaId)} 
                            size="small" 
                            color="primary"
                          />
                          <Typography variant="body2">
                            classifies as
                          </Typography>
                          <Chip 
                            label={getEntityTypeName(assignment.personaId, assignment.entityTypeId)}
                            size="small"
                            variant="outlined"
                            color="primary"
                            sx={{ fontStyle: 'italic' }}
                          />
                        </Box>
                      }
                      secondary={
                        <Box>
                          {assignment.confidence && assignment.confidence < 1 && (
                            <Typography variant="caption">
                              Confidence: {(assignment.confidence * 100).toFixed(0)}%
                            </Typography>
                          )}
                          {assignment.justification && (
                            <Typography variant="caption" display="block">
                              Justification: {assignment.justification}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton 
                        edge="end" 
                        size="small"
                        onClick={() => handleRemoveTypeAssignment(assignment.personaId)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            )}

            {/* Add new type assignment */}
            <Box sx={{ mt: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                Add Type Assignment
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Persona</InputLabel>
                  <Select
                    value={selectedPersonaId}
                    onChange={(e) => {
                      setSelectedPersonaId(e.target.value)
                      setSelectedEntityTypeId('')
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
                  <FormControl fullWidth size="small">
                    <InputLabel>Entity Type</InputLabel>
                    <Select
                      value={selectedEntityTypeId}
                      onChange={(e) => setSelectedEntityTypeId(e.target.value)}
                      label="Entity Type"
                    >
                      {availableEntityTypes.map(type => (
                        <MenuItem key={type.id} value={type.id}>
                          <em>{type.name}</em>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}

                {selectedPersonaId && selectedEntityTypeId && (
                  <>
                    <TextField
                      label="Confidence (0-1)"
                      type="number"
                      size="small"
                      value={assignmentConfidence}
                      onChange={(e) => setAssignmentConfidence(parseFloat(e.target.value))}
                      inputProps={{ min: 0, max: 1, step: 0.1 }}
                    />
                    <TextField
                      label="Justification (optional)"
                      size="small"
                      multiline
                      rows={2}
                      value={assignmentJustification}
                      onChange={(e) => setAssignmentJustification(e.target.value)}
                    />
                    <Button 
                      variant="outlined" 
                      startIcon={<AddIcon />}
                      onClick={handleAddTypeAssignment}
                      disabled={!selectedEntityTypeId}
                    >
                      Add Assignment
                    </Button>
                  </>
                )}
              </Box>
            </Box>
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
          {entity ? 'Update' : 'Create'} Entity
        </Button>
      </DialogActions>
    </Dialog>
  )
}