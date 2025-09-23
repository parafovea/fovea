import { useState, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
} from '@mui/material'
import { AppDispatch } from '../store/store'
import { setPersona, setOntology } from '../store/ontologySlice'
import { Persona } from '../models/types'

interface PersonaEditorProps {
  open: boolean
  onClose: () => void
  persona: Persona | null
}

export default function PersonaEditor({ open, onClose, persona }: PersonaEditorProps) {
  const dispatch = useDispatch<AppDispatch>()
  const [formData, setFormData] = useState({
    role: '',
    informationNeed: '',
    details: '',
  })

  useEffect(() => {
    if (persona) {
      setFormData({
        role: persona.role,
        informationNeed: persona.informationNeed,
        details: persona.details,
      })
    } else {
      setFormData({
        role: 'Tactically-Oriented Analyst',
        informationNeed: 'Imports and exports of goods via ship, truck, or rail',
        details: 'The information need includes the arrival or departure of ships, trucks, trains; container counts, types, and company logos.',
      })
    }
  }, [persona])

  const handleSave = () => {
    const now = new Date().toISOString()
    const updatedPersona: Persona = {
      id: persona?.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...formData,
      createdAt: persona?.createdAt || now,
      updatedAt: now,
    }

    if (persona) {
      dispatch(setPersona(updatedPersona))
    } else {
      dispatch(setOntology({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        version: '0.1.0',
        persona: updatedPersona,
        entities: [],
        roles: [],
        events: [],
        createdAt: now,
        updatedAt: now,
        description: 'New ontology',
      }))
    }

    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{persona ? 'Edit Persona' : 'Create New Ontology'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
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
            required
            multiline
            rows={2}
          />
          <TextField
            label="Details"
            value={formData.details}
            onChange={(e) => setFormData({ ...formData, details: e.target.value })}
            fullWidth
            multiline
            rows={4}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          {persona ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}