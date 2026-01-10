import { useState, useEffect, useRef, useCallback } from 'react'
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
import { useCreatePersona, useUpdatePersona, useDeletePersona } from '../store/queries'
import { Persona } from '../models/types'

interface PersonaEditorProps {
  open: boolean
  onClose: () => void
  persona: Persona | null
}

export default function PersonaEditor({ open, onClose, persona }: PersonaEditorProps) {
  // TanStack Query mutations
  const { mutate: createPersonaMutation, isPending: isCreating } = useCreatePersona()
  const { mutate: updatePersonaMutation, isPending: isUpdating } = useUpdatePersona()
  const { mutate: deletePersonaMutation } = useDeletePersona()

  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [informationNeed, setInformationNeed] = useState('')
  const [details, setDetails] = useState('')

  // Track auto-created persona for cleanup on cancel
  const [autoCreatedPersonaId, setAutoCreatedPersonaId] = useState<string | null>(null)
  const [hasAutoSaved, setHasAutoSaved] = useState(false)

  // Ref to track if we're in create mode (no existing persona)
  const isCreateMode = !persona

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Check if form is valid
  const isFormValid = name.trim() && role.trim() && informationNeed.trim()

  // Reset state when dialog opens/closes or persona changes
  useEffect(() => {
    if (open) {
      if (persona) {
        setName(persona.name)
        setRole(persona.role)
        setInformationNeed(persona.informationNeed)
        setDetails(persona.details || '')
        setAutoCreatedPersonaId(null)
        setHasAutoSaved(false)
      } else {
        setName('')
        setRole('')
        setInformationNeed('')
        setDetails('')
        setAutoCreatedPersonaId(null)
        setHasAutoSaved(false)
      }
    }
  }, [persona, open])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  // Auto-save function
  const performAutoSave = useCallback(() => {
    if (!isFormValid) return

    const personaData = {
      name: name.trim(),
      role: role.trim(),
      informationNeed: informationNeed.trim(),
      details: details.trim(),
    }

    if (autoCreatedPersonaId) {
      // Update existing auto-created persona
      updatePersonaMutation({
        id: autoCreatedPersonaId,
        ...personaData,
        details: personaData.details || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    } else if (isCreateMode) {
      // Create new persona (first auto-save)
      createPersonaMutation({
        persona: personaData,
        ontology: {
          entities: [],
          roles: [],
          events: [],
          relationTypes: [],
          relations: [],
        },
      }, {
        onSuccess: (result) => {
          setAutoCreatedPersonaId(result.persona.id)
          setHasAutoSaved(true)
        }
      })
    } else if (persona) {
      // Update existing persona (edit mode)
      updatePersonaMutation({
        id: persona.id,
        ...personaData,
        details: personaData.details || '',
        createdAt: persona.createdAt,
        updatedAt: new Date().toISOString(),
      })
      setHasAutoSaved(true)
    }
  }, [name, role, informationNeed, details, isFormValid, autoCreatedPersonaId, isCreateMode, persona, createPersonaMutation, updatePersonaMutation])

  // Auto-save with debounce when form fields change
  useEffect(() => {
    if (!open || !isFormValid) return

    // Clear existing debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    // Set new debounce (1 second)
    debounceRef.current = setTimeout(() => {
      performAutoSave()
    }, 1000)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [open, name, role, informationNeed, details, isFormValid, performAutoSave])

  const handleCancel = () => {
    // If we auto-created a persona, delete it on cancel
    if (autoCreatedPersonaId) {
      deletePersonaMutation(autoCreatedPersonaId)
    }
    onClose()
  }

  const handleDone = () => {
    // Persona already saved via auto-save, just close
    onClose()
  }

  const isSaving = isCreating || isUpdating

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
        <Button onClick={handleCancel}>Cancel</Button>
        {isSaving && <CircularProgress size={20} sx={{ mx: 1 }} />}
        <Button
          onClick={handleDone}
          variant="contained"
          disabled={!isFormValid || (!hasAutoSaved && isCreateMode)}
        >
          {hasAutoSaved || persona ? 'Done' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}