import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Box,
  Paper,
  Typography,
  Button,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Tooltip,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  IconButton,
} from '@mui/material'
import {
  PersonAdd as AddPersonaIcon,
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material'
import {
  usePersonas,
  usePersonaOntology,
  useCreatePersona,
  useUpdatePersona,
  useDeletePersona,
  useCopyPersona,
  usePersonaDeletionPreview,
} from '@store/queries'
import { useAnnotationUiStore } from '@store/zustand'
import { Persona } from '@models/types'
import ConfirmDialog from '@components/shared/ConfirmDialog'
import { useAutoSave, SaveStatusIndicator } from '../../hooks/data'

export default function PersonaManager() {
  // TanStack Query hooks
  const { data: personas = [] } = usePersonas()
  const { mutate: createPersonaMutation } = useCreatePersona()
  const { mutate: updatePersonaMutation } = useUpdatePersona()
  const deletePersonaMutation = useDeletePersona()
  const { mutate: copyPersonaMutation } = useCopyPersona()

  // Zustand UI state
  const selectedPersonaId = useAnnotationUiStore((state) => state.selectedPersonaId)
  const setSelectedPersonaId = useAnnotationUiStore((state) => state.setSelectedPersonaId)

  // Use selectedPersonaId as activePersonaId for backwards compatibility
  const activePersonaId = selectedPersonaId
  const activePersona = personas.find(p => p.id === activePersonaId)

  // Fetch ontology for active persona
  const { data: activeOntology } = usePersonaOntology(activePersonaId)

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null)
  const [createdPersonaId, setCreatedPersonaId] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [personaToDelete, setPersonaToDelete] = useState<Persona | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    informationNeed: '',
    details: '',
  })

  // Fetch deletion preview when delete dialog is open
  const { data: deletionPreview, isFetching: isLoadingPreview } = usePersonaDeletionPreview(
    personaToDelete?.id,
    deleteDialogOpen
  )

  // Track auto-created persona for ref access in callbacks
  const createdPersonaIdRef = useRef<string | null>(null)

  // Sync ref with state
  useEffect(() => {
    createdPersonaIdRef.current = createdPersonaId
  }, [createdPersonaId])

  // Auto-save for edit dialog using useAutoSave hook
  const {
    saveStatus: editSaveStatus,
    lastSavedAt: editLastSavedAt,
    errorMessage: editErrorMessage,
    retryCount: editRetryCount,
    forceSave: editForceSave,
  } = useAutoSave({
    data: formData,
    isEnabled: editDialogOpen && !!editingPersona && formData.name.trim().length > 0,
    onSave: async (data) => {
      if (!editingPersona) return
      const updatedPersona: Persona = {
        ...editingPersona,
        name: data.name,
        role: data.role,
        informationNeed: data.informationNeed,
        details: data.details,
        updatedAt: new Date().toISOString(),
      }
      await new Promise<void>((resolve, reject) => {
        updatePersonaMutation(updatedPersona, {
          onSuccess: () => {
            setEditingPersona(updatedPersona)
            resolve()
          },
          onError: (err) => reject(err),
        })
      })
    },
    entityType: 'persona',
    entityId: editingPersona?.id || 'edit',
  })

  // Auto-save for create dialog using useAutoSave hook
  const {
    saveStatus: createSaveStatus,
    lastSavedAt: createLastSavedAt,
    errorMessage: createErrorMessage,
    retryCount: createRetryCount,
    forceSave: createForceSave,
  } = useAutoSave({
    data: formData,
    isEnabled: createDialogOpen && formData.name.trim().length > 0,
    onSave: async (data) => {
      if (createdPersonaIdRef.current) {
        // Already created - update existing persona
        const existingPersona = personas.find(p => p.id === createdPersonaIdRef.current)
        if (existingPersona) {
          const updatedPersona: Persona = {
            ...existingPersona,
            name: data.name,
            role: data.role,
            informationNeed: data.informationNeed,
            details: data.details,
            updatedAt: new Date().toISOString(),
          }
          await new Promise<void>((resolve, reject) => {
            updatePersonaMutation(updatedPersona, {
              onSuccess: () => resolve(),
              onError: (err) => reject(err),
            })
          })
        }
      } else {
        // First save - create new persona
        await new Promise<void>((resolve, reject) => {
          createPersonaMutation(
            {
              persona: {
                name: data.name,
                role: data.role,
                informationNeed: data.informationNeed,
                details: data.details,
              },
              ontology: {
                entities: [],
                roles: [],
                events: [],
                relationTypes: [],
                relations: [],
              },
            },
            {
              onSuccess: (result) => {
                setCreatedPersonaId(result.persona.id)
                createdPersonaIdRef.current = result.persona.id
                resolve()
              },
              onError: (err) => reject(err),
            }
          )
        })
      }
    },
    entityType: 'persona',
    entityId: createdPersonaId || 'new',
  })

  const handleMenuClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleMenuClose = () => {
    setAnchorEl(null)
  }

  const handleCreateNew = () => {
    setFormData({
      name: '',
      role: '',
      informationNeed: '',
      details: '',
    })
    setCreatedPersonaId(null) // Reset for fresh creation
    createdPersonaIdRef.current = null
    setCreateDialogOpen(true)
    handleMenuClose()
  }

  const handleCancelCreate = () => {
    // Delete auto-created persona if user cancels
    if (createdPersonaId) {
      deletePersonaMutation.mutate(createdPersonaId)
    }
    setCreatedPersonaId(null)
    createdPersonaIdRef.current = null
    setCreateDialogOpen(false)
  }

  const handleCloseCreate = () => {
    // When closing via Done button, just close (persona already saved)
    setCreatedPersonaId(null)
    createdPersonaIdRef.current = null
    setCreateDialogOpen(false)
  }

  const handleEditPersona = (persona: Persona) => {
    setEditingPersona(persona)
    setFormData({
      name: persona.name,
      role: persona.role,
      informationNeed: persona.informationNeed,
      details: persona.details,
    })
    setEditDialogOpen(true)
  }

  const handleCopyPersona = (sourcePersonaId: string) => {
    const sourcePersona = personas.find(p => p.id === sourcePersonaId)
    if (sourcePersona) {
      copyPersonaMutation({
        sourcePersonaId,
        newPersonaData: {
          name: `${sourcePersona.name} (Copy)`,
          role: sourcePersona.role,
          informationNeed: sourcePersona.informationNeed,
          details: sourcePersona.details,
        },
      })
    }
    handleMenuClose()
  }

  const handleSaveNew = () => {
    createPersonaMutation({
      persona: {
        name: formData.name,
        role: formData.role,
        informationNeed: formData.informationNeed,
        details: formData.details,
      },
      ontology: {
        entities: [],
        roles: [],
        events: [],
        relationTypes: [],
        relations: [],
      },
    })

    setCreateDialogOpen(false)
  }

  const handleDeleteClick = useCallback((persona: Persona) => {
    setPersonaToDelete(persona)
    setDeleteDialogOpen(true)
    handleMenuClose()
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (personaToDelete) {
      await deletePersonaMutation.mutateAsync(personaToDelete.id)
      setDeleteDialogOpen(false)
      setPersonaToDelete(null)
    }
  }, [personaToDelete, deletePersonaMutation])

  const handleDeleteCancel = useCallback(() => {
    setDeleteDialogOpen(false)
    setPersonaToDelete(null)
  }, [])

  // Build confirmation message with affected items count
  const getDeleteMessage = () => {
    if (!personaToDelete) return ''

    const parts = [`Are you sure you want to delete the persona "${personaToDelete.name}"?`]

    if (deletionPreview) {
      const affectedItems: string[] = []
      if (deletionPreview.typeCount > 0) {
        affectedItems.push(`${deletionPreview.typeCount} ontology type${deletionPreview.typeCount !== 1 ? 's' : ''}`)
      }
      if (deletionPreview.annotationCount > 0) {
        affectedItems.push(`${deletionPreview.annotationCount} annotation${deletionPreview.annotationCount !== 1 ? 's' : ''}`)
      }
      if (deletionPreview.summaryCount > 0) {
        affectedItems.push(`${deletionPreview.summaryCount} video summar${deletionPreview.summaryCount !== 1 ? 'ies' : 'y'}`)
      }
      if (deletionPreview.worldAssignmentCount > 0) {
        affectedItems.push(`${deletionPreview.worldAssignmentCount} world object assignment${deletionPreview.worldAssignmentCount !== 1 ? 's' : ''}`)
      }

      if (affectedItems.length > 0) {
        parts.push(`\n\nThis will also delete: ${affectedItems.join(', ')}.`)
      }
    }

    parts.push('\n\nThis action cannot be undone.')
    return parts.join('')
  }

  // Get ontology stats for active persona from activeOntology
  const getOntologyStats = (personaId: string) => {
    // For active persona, use the loaded ontology
    if (personaId === activePersonaId && activeOntology) {
      return {
        entities: activeOntology.entities.length,
        roles: activeOntology.roles.length,
        events: activeOntology.events.length,
        relations: activeOntology.relations.length,
      }
    }
    // For other personas, return zeros (will be loaded on demand)
    return { entities: 0, roles: 0, events: 0, relations: 0 }
  }

  return (
    <Box sx={{ mb: 3 }}>
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">Active Persona</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              endIcon={<ExpandMoreIcon />}
              onClick={handleMenuClick}
              disabled={personas.length === 0}
            >
              {activePersona?.name || 'Select Persona'}
            </Button>
            <IconButton color="primary" onClick={handleCreateNew}>
              <AddPersonaIcon />
            </IconButton>
          </Box>
        </Box>

        {activePersona && (
          <Box>
            <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
              <Typography variant="subtitle2" color="text.secondary">
                Role:
              </Typography>
              <Typography variant="body2">{activePersona.role}</Typography>
              <IconButton size="small" onClick={() => handleEditPersona(activePersona)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Box>
            <Box sx={{ mb: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Information Need:
              </Typography>
              <Typography variant="body2">{activePersona.informationNeed}</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
              {(() => {
                const stats = getOntologyStats(activePersona.id)
                return (
                  <>
                    <Chip label={`${stats.entities} Entities`} size="small" color="success" />
                    <Chip label={`${stats.roles} Roles`} size="small" color="primary" />
                    <Chip label={`${stats.events} Events`} size="small" color="warning" />
                    <Chip label={`${stats.relations} Relations`} size="small" color="secondary" />
                  </>
                )
              })()}
            </Box>
          </Box>
        )}

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
        >
          {personas.map((persona) => (
            <MenuItem
              key={persona.id}
              selected={persona.id === activePersonaId}
              onClick={() => {
                setSelectedPersonaId(persona.id)
                handleMenuClose()
              }}
            >
              <ListItemText
                primary={persona.name}
                secondary={`${persona.role} • ${getOntologyStats(persona.id).entities} entities, ${getOntologyStats(persona.id).events} events`}
              />
              <ListItemSecondaryAction>
                <Tooltip title="Copy persona">
                  <IconButton
                    size="small"
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation()
                      handleCopyPersona(persona.id)
                    }}
                  >
                    <CopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete persona">
                  <IconButton
                    size="small"
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation()
                      handleDeleteClick(persona)
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </ListItemSecondaryAction>
            </MenuItem>
          ))}
          <Divider />
          <MenuItem onClick={handleCreateNew}>
            <AddPersonaIcon sx={{ mr: 1 }} />
            Create New Persona
          </MenuItem>
        </Menu>
      </Paper>

      <Dialog open={createDialogOpen} onClose={handleCancelCreate} maxWidth="md" fullWidth>
        <DialogTitle>{createdPersonaId ? 'Edit New Persona' : 'Create New Persona'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              label="Persona Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Role"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              fullWidth
              helperText="e.g., 'Tactically-Oriented Analyst', 'Strategic Planner', 'Field Operator'"
            />
            <TextField
              label="Information Need"
              value={formData.informationNeed}
              onChange={(e) => setFormData({ ...formData, informationNeed: e.target.value })}
              fullWidth
              multiline
              rows={3}
              helperText="What specific information does this persona need to extract?"
            />
            <TextField
              label="Additional Details"
              value={formData.details}
              onChange={(e) => setFormData({ ...formData, details: e.target.value })}
              fullWidth
              multiline
              rows={3}
              helperText="Background, constraints, or other relevant information"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 'auto', ml: 1 }}>
            <SaveStatusIndicator
              status={createSaveStatus}
              lastSavedAt={createLastSavedAt}
              errorMessage={createErrorMessage}
              retryCount={createRetryCount}
              onRetry={createForceSave}
            />
          </Box>
          <Button onClick={handleCancelCreate}>Cancel</Button>
          <Button
            onClick={createdPersonaId ? handleCloseCreate : handleSaveNew}
            variant="contained"
            disabled={!formData.name}
          >
            {createdPersonaId ? 'Done' : 'Create Persona'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Edit Persona</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              label="Persona Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Role"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              fullWidth
            />
            <TextField
              label="Information Need"
              value={formData.informationNeed}
              onChange={(e) => setFormData({ ...formData, informationNeed: e.target.value })}
              fullWidth
              multiline
              rows={3}
            />
            <TextField
              label="Additional Details"
              value={formData.details}
              onChange={(e) => setFormData({ ...formData, details: e.target.value })}
              fullWidth
              multiline
              rows={3}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 'auto', ml: 1 }}>
            <SaveStatusIndicator
              status={editSaveStatus}
              lastSavedAt={editLastSavedAt}
              errorMessage={editErrorMessage}
              retryCount={editRetryCount}
              onRetry={editForceSave}
            />
          </Box>
          <Button onClick={() => setEditDialogOpen(false)}>Done</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Persona"
        message={getDeleteMessage()}
        confirmText="Delete"
        confirmColor="error"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        loading={deletePersonaMutation.isPending || isLoadingPreview}
      />
    </Box>
  )
}