import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
} from '@mui/material'
import { useCreatePersona, useUpdatePersona, useDeletePersona } from '@store/queries'
import { Persona } from '@models/types'
import { useAutoSave, SaveStatusIndicator } from '../../hooks/data'

interface PersonaEditorProps {
  open: boolean
  onClose: () => void
  persona: Persona | null
}

export default function PersonaEditor({ open, onClose, persona }: PersonaEditorProps) {
  // TanStack Query mutations
  const { mutate: createPersonaMutation } = useCreatePersona()
  const { mutate: updatePersonaMutation } = useUpdatePersona()
  const { mutate: deletePersonaMutation } = useDeletePersona()

  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [informationNeed, setInformationNeed] = useState('')
  const [details, setDetails] = useState('')

  // Track auto-created persona for cleanup on cancel
  const [autoCreatedPersonaId, setAutoCreatedPersonaId] = useState<string | null>(null)
  const autoCreatedIdRef = useRef<string | null>(null)

  // Ref to track if we're in create mode (no existing persona)
  const isCreateMode = !persona

  // Check if form is valid (name only for initial save, to allow incremental editing)
  const isFormValid = name.trim().length > 0

  // Reset state when dialog opens/closes or persona changes
  useEffect(() => {
    if (open) {
      if (persona) {
        setName(persona.name)
        setRole(persona.role)
        setInformationNeed(persona.informationNeed)
        setDetails(persona.details || '')
        setAutoCreatedPersonaId(null)
        autoCreatedIdRef.current = null
      } else {
        setName('')
        setRole('')
        setInformationNeed('')
        setDetails('')
        setAutoCreatedPersonaId(null)
        autoCreatedIdRef.current = null
      }
    }
  }, [persona, open])

  // Build persona data object for saving
  const personaData = {
    name: name.trim(),
    role: role.trim(),
    informationNeed: informationNeed.trim(),
    details: details.trim(),
  }

  // Auto-save using useAutoSave hook
  const { saveStatus, lastSavedAt, errorMessage, retryCount, forceSave } = useAutoSave({
    data: personaData,
    isEnabled: open && isFormValid,
    onSave: async (data) => {
      if (autoCreatedIdRef.current) {
        // Update existing auto-created persona
        await new Promise<void>((resolve, reject) => {
          updatePersonaMutation({
            id: autoCreatedIdRef.current!,
            ...data,
            details: data.details || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, {
            onSuccess: () => resolve(),
            onError: (err) => reject(err),
          })
        })
      } else if (isCreateMode) {
        // Create new persona (first auto-save)
        await new Promise<void>((resolve, reject) => {
          createPersonaMutation({
            persona: data,
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
              autoCreatedIdRef.current = result.persona.id
              resolve()
            },
            onError: (err) => reject(err),
          })
        })
      } else if (persona) {
        // Update existing persona (edit mode)
        await new Promise<void>((resolve, reject) => {
          updatePersonaMutation({
            id: persona.id,
            ...data,
            details: data.details || '',
            createdAt: persona.createdAt,
            updatedAt: new Date().toISOString(),
          }, {
            onSuccess: () => resolve(),
            onError: (err) => reject(err),
          })
        })
      }
    },
    entityType: 'persona',
    entityId: persona?.id || autoCreatedPersonaId || 'new',
  })

  // Check if we have saved at least once (for create mode button state)
  const hasAutoSaved = !!autoCreatedPersonaId || (saveStatus === 'saved' && !!persona)

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
            helperText="The persona's professional role or title"
          />
          <TextField
            label="Information Need"
            value={informationNeed}
            onChange={(e) => setInformationNeed(e.target.value)}
            fullWidth
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 'auto', ml: 1 }}>
          <SaveStatusIndicator
            status={saveStatus}
            lastSavedAt={lastSavedAt}
            errorMessage={errorMessage}
            retryCount={retryCount}
            onRetry={forceSave}
          />
        </Box>
        <Button onClick={handleCancel}>Cancel</Button>
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