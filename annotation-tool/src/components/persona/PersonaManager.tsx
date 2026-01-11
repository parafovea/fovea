import React, { useState, useEffect, useCallback } from 'react'
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

  // Auto-save persona edits on changes (debounced 1 second, matching ontology auto-save)
  useEffect(() => {
    if (!editingPersona || !editDialogOpen) return

    // Don't auto-save if form data hasn't changed from current persona
    if (
      formData.name === editingPersona.name &&
      formData.role === editingPersona.role &&
      formData.informationNeed === editingPersona.informationNeed &&
      formData.details === editingPersona.details
    ) {
      return
    }

    const timeoutId = setTimeout(() => {
      const updatedPersona: Persona = {
        ...editingPersona,
        name: formData.name,
        role: formData.role,
        informationNeed: formData.informationNeed,
        details: formData.details,
        updatedAt: new Date().toISOString(),
      }
      updatePersonaMutation(updatedPersona)
      // Update editingPersona to reflect saved state
      setEditingPersona(updatedPersona)
    }, 1000)

    return () => clearTimeout(timeoutId)
  }, [formData, editingPersona, editDialogOpen, updatePersonaMutation])

  // Auto-save persona creation on changes (debounced 1 second)
  useEffect(() => {
    if (!createDialogOpen) return

    // Don't auto-save if required fields are incomplete
    if (!formData.name || !formData.role || !formData.informationNeed) return

    const timeoutId = setTimeout(() => {
      if (createdPersonaId) {
        // Already created - update existing persona
        const existingPersona = personas.find(p => p.id === createdPersonaId)
        if (existingPersona) {
          const updatedPersona: Persona = {
            ...existingPersona,
            name: formData.name,
            role: formData.role,
            informationNeed: formData.informationNeed,
            details: formData.details,
            updatedAt: new Date().toISOString(),
          }
          updatePersonaMutation(updatedPersona)
        }
      } else {
        // First save - create new persona using TanStack Query mutation
        createPersonaMutation(
          {
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
          },
          {
            onSuccess: (data) => {
              setCreatedPersonaId(data.persona.id)
            },
          }
        )
      }
    }, 1000)

    return () => clearTimeout(timeoutId)
  }, [formData, createDialogOpen, createdPersonaId, personas, createPersonaMutation, updatePersonaMutation])

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
    setCreateDialogOpen(true)
    handleMenuClose()
  }

  const handleCancelCreate = () => {
    // Delete auto-created persona if user cancels
    if (createdPersonaId) {
      deletePersonaMutation.mutate(createdPersonaId)
    }
    setCreatedPersonaId(null)
    setCreateDialogOpen(false)
  }

  const handleCloseCreate = () => {
    // When closing via Done button, just close (persona already saved)
    setCreatedPersonaId(null)
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

  const handleSaveEdit = () => {
    if (editingPersona) {
      const updatedPersona: Persona = {
        ...editingPersona,
        name: formData.name,
        role: formData.role,
        informationNeed: formData.informationNeed,
        details: formData.details,
        updatedAt: new Date().toISOString(),
      }
      updatePersonaMutation(updatedPersona)
      setEditDialogOpen(false)
      setEditingPersona(null)
    }
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
              required
              helperText="e.g., 'Tactically-Oriented Analyst', 'Strategic Planner', 'Field Operator'"
            />
            <TextField
              label="Information Need"
              value={formData.informationNeed}
              onChange={(e) => setFormData({ ...formData, informationNeed: e.target.value })}
              fullWidth
              multiline
              rows={3}
              required
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
          <Button onClick={handleCancelCreate}>Cancel</Button>
          <Button
            onClick={createdPersonaId ? handleCloseCreate : handleSaveNew}
            variant="contained"
            disabled={!formData.name || !formData.role || !formData.informationNeed}
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
              required
            />
            <TextField
              label="Information Need"
              value={formData.informationNeed}
              onChange={(e) => setFormData({ ...formData, informationNeed: e.target.value })}
              fullWidth
              multiline
              rows={3}
              required
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
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSaveEdit}
            variant="contained"
            disabled={!formData.name || !formData.role || !formData.informationNeed}
          >
            Save Changes
          </Button>
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