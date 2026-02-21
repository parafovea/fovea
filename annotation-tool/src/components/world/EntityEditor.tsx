import { useState, useEffect, useRef } from 'react'
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
import { useAddEntity, useUpdateEntity, useDeleteEntity, usePersonas, useAllPersonaOntologies } from '@store/queries'
import { useAnnotationUiStore } from '@store/zustand/annotationUiStore'
import { Entity, EntityTypeAssignment, GlossItem } from '@models/types'
import GlossEditor from '@components/ontology/GlossEditor'
import { TypeObjectBadge } from '../shared/TypeObjectToggle'
import WikidataImportFlow from '../shared/WikidataImportFlow'
import { useAutoSave, SaveStatusIndicator } from '../../hooks/data'

interface EntityEditorProps {
  open: boolean
  onClose: () => void
  entity: Entity | null
}

export default function EntityEditor({ open, onClose, entity }: EntityEditorProps) {
  // TanStack Query hooks for personas
  const { data: personas = [] } = usePersonas()
  const personaIds = personas.map((p) => p.id)
  const { data: personaOntologies = [] } = useAllPersonaOntologies(personaIds)
  const { mutateAsync: addEntity } = useAddEntity()
  const { mutateAsync: updateEntity } = useUpdateEntity()
  const { mutate: deleteEntity } = useDeleteEntity()

  // Active persona from Zustand store
  const activePersonaId = useAnnotationUiStore((state) => state.selectedPersonaId)

  const [name, setName] = useState('')
  const [description, setDescription] = useState<GlossItem[]>([{ type: 'text', content: '' }])
  const [alternateNamesInput, setAlternateNamesInput] = useState('')
  const [typeAssignments, setTypeAssignments] = useState<EntityTypeAssignment[]>([])
  const [importMode, setImportMode] = useState<'manual' | 'wikidata'>('manual')
  const [wikidataId, setWikidataId] = useState<string>('')
  const [wikidataUrl, setWikidataUrl] = useState<string>('')

  // Track auto-created entity ID for cancel cleanup
  const [autoCreatedEntityId, setAutoCreatedEntityId] = useState<string | null>(null)
  const autoCreatedIdRef = useRef<string | null>(null)

  // For adding new type assignment
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('')
  const [selectedEntityTypeId, setSelectedEntityTypeId] = useState<string>('')
  const [assignmentConfidence, setAssignmentConfidence] = useState<number>(1.0)
  const [assignmentJustification, setAssignmentJustification] = useState('')

  // Keep ref in sync with state for callbacks
  useEffect(() => {
    autoCreatedIdRef.current = autoCreatedEntityId
  }, [autoCreatedEntityId])

  // Auto-save hook for new entities
  const { saveStatus, lastSavedAt, errorMessage, retryCount, forceSave } = useAutoSave({
    data: { name, description, typeAssignments, wikidataId, wikidataUrl, alternateNames },
    isEnabled: open && !!name && !entity, // Only for new entities, require name
    onSave: async (entityData) => {
      const now = new Date().toISOString()
      const fullEntityData: Omit<Entity, 'id' | 'createdAt' | 'updatedAt'> = {
        name: entityData.name,
        description: entityData.description,
        typeAssignments: entityData.typeAssignments,
        wikidataId: entityData.wikidataId || undefined,
        wikidataUrl: entityData.wikidataUrl || undefined,
        importedFrom: entityData.wikidataId ? 'wikidata' : undefined,
        importedAt: entityData.wikidataId ? now : undefined,
        metadata: {
          alternateNames: entityData.alternateNames.filter(Boolean),
          externalIds: {},
          properties: {},
        },
      }

      if (autoCreatedIdRef.current) {
        // Update the auto-created entity
        await updateEntity({
          id: autoCreatedIdRef.current,
          createdAt: now,
          updatedAt: now,
          ...fullEntityData,
        })
      } else {
        // Create new entity and track ID
        const result = await addEntity(fullEntityData)
        // Get the newly created entity ID from the result
        const newEntity = result.entities[result.entities.length - 1]
        if (newEntity) {
          setAutoCreatedEntityId(newEntity.id)
        }
      }
    },
    entityType: 'world-object',
    entityId: entity?.id || autoCreatedIdRef.current || undefined,
  })

  useEffect(() => {
    if (entity) {
      setName(entity.name)
      setDescription(entity.description)
      setAlternateNamesInput(entity.metadata?.alternateNames?.join(', ') || '')
      setTypeAssignments(entity.typeAssignments || [])
      setWikidataId(entity.wikidataId || '')
      setWikidataUrl(entity.wikidataUrl || '')
    } else {
      setName('')
      setDescription([{ type: 'text', content: '' }])
      setAlternateNamesInput('')
      setTypeAssignments([])
      setWikidataId('')
      setWikidataUrl('')
    }
    // Reset auto-created ID when dialog opens/closes or entity changes
    setAutoCreatedEntityId(null)
  }, [entity, open])

  const handleAddTypeAssignment = () => {
    if (selectedPersonaId && selectedEntityTypeId) {
      // Get the selected type to check for sharedTypeId or wikidataId
      const selectedOntology = personaOntologies.find(o => o.personaId === selectedPersonaId)
      const selectedType = selectedOntology?.entities.find(e => e.id === selectedEntityTypeId)

      const assignments: EntityTypeAssignment[] = []

      // Check for sharedTypeId or wikidataId to find linked types across personas
      const sharedId = selectedType?.sharedTypeId || selectedType?.wikidataId

      if (sharedId) {
        // Find all types with matching sharedTypeId or wikidataId across all personas
        for (const ontology of personaOntologies) {
          const matchingType = ontology.entities.find(e =>
            e.sharedTypeId === sharedId ||
            (selectedType?.wikidataId && e.wikidataId === selectedType.wikidataId)
          )
          if (matchingType) {
            assignments.push({
              personaId: ontology.personaId,
              entityTypeId: matchingType.id,
              confidence: assignmentConfidence,
              justification: assignmentJustification || undefined,
            })
          }
        }
      } else {
        // No sharedTypeId, just add single assignment
        assignments.push({
          personaId: selectedPersonaId,
          entityTypeId: selectedEntityTypeId,
          confidence: assignmentConfidence,
          justification: assignmentJustification || undefined,
        })
      }

      // Remove existing assignments for all personas being updated
      const personaIdsToReplace = new Set(assignments.map(a => a.personaId))
      const filtered = typeAssignments.filter(a => !personaIdsToReplace.has(a.personaId))
      setTypeAssignments([...filtered, ...assignments])

      // Reset form
      setSelectedEntityTypeId('')
      setAssignmentConfidence(1.0)
      setAssignmentJustification('')
    }
  }

  const handleRemoveTypeAssignment = (personaId: string) => {
    setTypeAssignments(typeAssignments.filter(a => a.personaId !== personaId))
  }

  const handleSave = async () => {
    const now = new Date().toISOString()
    // Parse alternate names from comma-separated input
    const alternateNames = alternateNamesInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    const entityData: Omit<Entity, 'id' | 'createdAt' | 'updatedAt'> = {
      name,
      description,
      typeAssignments,
      wikidataId: wikidataId || undefined,
      wikidataUrl: wikidataUrl || undefined,
      importedFrom: wikidataId ? (entity?.importedFrom || 'wikidata') : undefined,
      importedAt: wikidataId ? (entity?.importedAt || now) : undefined,
      metadata: {
        alternateNames,
        externalIds: {},
        properties: {},
      },
    }

    if (entity) {
      await updateEntity({ ...entity, ...entityData })
    } else {
      await addEntity(entityData)
    }

    onClose()
  }

  // Cancel handler deletes auto-created entity
  const handleCancel = () => {
    if (autoCreatedIdRef.current) {
      deleteEntity(autoCreatedIdRef.current)
    }
    setAutoCreatedEntityId(null)
    onClose()
  }

  // Done handler keeps the entity (already saved via autosave)
  const handleDone = async () => {
    // Force save any pending changes before closing
    if (!entity && autoCreatedIdRef.current) {
      await forceSave()
    }
    setAutoCreatedEntityId(null)
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
    <Dialog open={open} onClose={handleCancel} maxWidth="md" fullWidth>
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
            <WikidataImportFlow
              type="entity"
              entityType="object"
              objectSubtype="entity"
              onSuccess={() => onClose()}
              onCancel={onClose}
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
            value={alternateNamesInput}
            onChange={(e) => setAlternateNamesInput(e.target.value)}
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
      <DialogActions sx={{ justifyContent: 'space-between', px: 3 }}>
        <Box>
          {!entity && (
            <SaveStatusIndicator
              status={saveStatus}
              lastSavedAt={lastSavedAt}
              errorMessage={errorMessage}
              retryCount={retryCount}
              onRetry={forceSave}
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={handleCancel}>Cancel</Button>
          {entity ? (
            <Button
              onClick={handleSave}
              variant="contained"
              color="secondary"
              disabled={!name || description.length === 0}
            >
              Update Entity
            </Button>
          ) : (
            <Button
              onClick={handleDone}
              variant="contained"
              color="secondary"
              disabled={!name || description.length === 0 || !autoCreatedEntityId}
            >
              Done
            </Button>
          )}
        </Box>
      </DialogActions>
    </Dialog>
  )
}
