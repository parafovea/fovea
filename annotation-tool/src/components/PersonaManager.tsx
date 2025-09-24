import React, { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import {
  Box,
  Paper,
  Typography,
  IconButton,
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
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
} from '@mui/material'
import { generateId } from '../utils/uuid'
import {
  PersonAdd as AddPersonaIcon,
  ContentCopy as CopyIcon,
  ImportExport as ImportIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material'
import { RootState, AppDispatch } from '../store/store'
import {
  setActivePersona,
  addPersona,
  updatePersona,
  deletePersona,
  copyPersona,
} from '../store/personaSlice'
import { Persona, PersonaOntology } from '../models/types'

export default function PersonaManager() {
  const dispatch = useDispatch<AppDispatch>()
  const { personas, activePersonaId, personaOntologies } = useSelector((state: RootState) => state.persona)
  const activePersona = personas.find(p => p.id === activePersonaId)
  
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    informationNeed: '',
    details: '',
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
    setCreateDialogOpen(true)
    handleMenuClose()
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
      const newPersona: Persona = {
        id: `generateId()`,
        name: `${sourcePersona.name} (Copy)`,
        role: sourcePersona.role,
        informationNeed: sourcePersona.informationNeed,
        details: sourcePersona.details,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      dispatch(copyPersona({ sourcePersonaId, newPersona }))
      dispatch(setActivePersona(newPersona.id))
    }
    handleMenuClose()
  }

  const handleSaveNew = () => {
    const newPersona: Persona = {
      id: `generateId()`,
      name: formData.name,
      role: formData.role,
      informationNeed: formData.informationNeed,
      details: formData.details,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const newOntology: PersonaOntology = {
      id: `generateId()`,
      personaId: newPersona.id,
      entities: [],
      roles: [],
      events: [],
      relationTypes: [],
      relations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    dispatch(addPersona({ persona: newPersona, ontology: newOntology }))
    dispatch(setActivePersona(newPersona.id))
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
      dispatch(updatePersona(updatedPersona))
      setEditDialogOpen(false)
      setEditingPersona(null)
    }
  }

  const handleDeletePersona = (personaId: string) => {
    if (personas.length > 1 && window.confirm('Are you sure you want to delete this persona and all its ontology data?')) {
      dispatch(deletePersona(personaId))
    }
  }

  const getOntologyStats = (personaId: string) => {
    const ontology = personaOntologies.find(o => o.personaId === personaId)
    if (!ontology) return { entities: 0, roles: 0, events: 0, relations: 0 }
    return {
      entities: ontology.entities.length,
      roles: ontology.roles.length,
      events: ontology.events.length,
      relations: ontology.relations.length,
    }
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
                dispatch(setActivePersona(persona.id))
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
                    onClick={(e) => {
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
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeletePersona(persona.id)
                    }}
                    disabled={personas.length <= 1}
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

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Create New Persona</DialogTitle>
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
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSaveNew}
            variant="contained"
            disabled={!formData.name || !formData.role || !formData.informationNeed}
          >
            Create Persona
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
    </Box>
  )
}