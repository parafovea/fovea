import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  CircularProgress,
} from '@mui/material'
import { useCreatePersona, useUpdatePersona } from '@store/queries'
import { Persona } from '@models/types'

interface PersonaEditorProps {
  open: boolean
  onClose: () => void
  persona: Persona | null
}

export default function PersonaEditor({ open, onClose, persona }: PersonaEditorProps) {
  const { mutateAsync: createPersonaMutation, isPending: isCreating } = useCreatePersona()
  const { mutateAsync: updatePersonaMutation, isPending: isUpdating } = useUpdatePersona()

  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [informationNeed, setInformationNeed] = useState('')
  const [details, setDetails] = useState('')

  const isCreateMode = !persona
  const isSaving = isCreating || isUpdating

  // All required fields must be filled
  const isFormValid =
    name.trim().length > 0 &&
    role.trim().length > 0 &&
    informationNeed.trim().length > 0

  // Reset state when dialog opens/closes or persona changes
  useEffect(() => {
    if (open) {
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
    }
  }, [persona, open])

  const handleCancel = () => {
    onClose()
  }

  const handleDone = async () => {
    if (!isFormValid) return

    const personaData = {
      name: name.trim(),
      role: role.trim(),
      informationNeed: informationNeed.trim(),
      details: details.trim(),
    }

    try {
      if (isCreateMode) {
        await createPersonaMutation({
          persona: personaData,
          ontology: {
            entities: [],
            roles: [],
            events: [],
            relationTypes: [],
            relations: [],
          },
        })
      } else if (persona) {
        await updatePersonaMutation({
          id: persona.id,
          ...personaData,
          details: personaData.details || '',
          createdAt: persona.createdAt,
          updatedAt: new Date().toISOString(),
        })
      }
      onClose()
    } catch (error) {
      console.error('Failed to save persona:', error)
    }
  }

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{persona ? 'Edit Persona' : 'Create New Persona'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Persona Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            error={name.length > 0 && name.trim().length === 0}
            helperText="A descriptive name for this persona"
          />
          <TextField
            label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            fullWidth
            required
            error={role.length > 0 && role.trim().length === 0}
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
            error={informationNeed.length > 0 && informationNeed.trim().length === 0}
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
        <Button onClick={handleCancel} disabled={isSaving}>Cancel</Button>
        <Button
          onClick={handleDone}
          variant="contained"
          disabled={!isFormValid || isSaving}
          startIcon={isSaving ? <CircularProgress size={16} /> : null}
        >
          {isSaving ? 'Saving...' : 'Done'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
