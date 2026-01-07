import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
} from '@mui/material'
import { useCreatePersona, useUpdatePersona } from '../store/queries'
import { Persona } from '../models/types'
import { generateId } from '../utils/uuid'

interface PersonaEditorProps {
  open: boolean
  onClose: () => void
  persona: Persona | null
}

export default function PersonaEditor({ open, onClose, persona }: PersonaEditorProps) {
  // TanStack Query mutations
  const { mutate: createPersonaMutation } = useCreatePersona()
  const { mutate: updatePersonaMutation } = useUpdatePersona()
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [informationNeed, setInformationNeed] = useState('')
  const [details, setDetails] = useState('')

  useEffect(() => {
    if (persona) {
      setName(persona.name)
      setRole(persona.role)
      setInformationNeed(persona.informationNeed)
      setDetails(persona.details || '')
    } else {
      setName('')
      setRole('')
      setInformationNeed('')
      setDetails('')
    }
  }, [persona])

  const handleSave = () => {
    const now = new Date().toISOString()
    const personaData: Persona = {
      id: persona?.id || generateId(),
      name,
      role,
      informationNeed,
      details,
      createdAt: persona?.createdAt || now,
      updatedAt: now,
    }

    if (persona) {
      updatePersonaMutation(personaData)
    } else {
      createPersonaMutation({
        persona: {
          name: personaData.name,
          role: personaData.role,
          informationNeed: personaData.informationNeed,
          details: personaData.details,
        },
        ontology: {
          entities: [],
          roles: [],
          events: [],
          relationTypes: [],
          relations: [],
        },
      })
    }
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{persona ? 'Edit Persona' : 'Create New Persona'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Persona Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            helperText="A descriptive name for this persona"
          />
          <TextField
            label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            fullWidth
            required
            helperText="The persona's professional role or title"
          />
          <TextField
            label="Information Need"
            value={informationNeed}
            onChange={(e) => setInformationNeed(e.target.value)}
            fullWidth
            required
            multiline
            rows={3}
            helperText="What information is this persona looking for?"
          />
          <TextField
            label="Additional Details"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            fullWidth
            multiline
            rows={2}
            helperText="Optional: Any additional context or details"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSave} 
          variant="contained"
          disabled={!name || !role || !informationNeed}
        >
          {persona ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}