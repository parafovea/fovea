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
import { addEntityToPersona, updateEntityInPersona } from '../store/personaSlice'
import { EntityType, GlossItem } from '../models/types'
import GlossEditor from './GlossEditor'

interface EntityEditorProps {
  open: boolean
  onClose: () => void
  entity: EntityType | null
  personaId: string | null
}

export default function EntityEditor({ open, onClose, entity, personaId }: EntityEditorProps) {
  const dispatch = useDispatch<AppDispatch>()
  const [name, setName] = useState('')
  const [gloss, setGloss] = useState<GlossItem[]>([{ type: 'text', content: '' }])
  const [examples, setExamples] = useState<string[]>([])

  useEffect(() => {
    if (entity) {
      setName(entity.name)
      setGloss(entity.gloss)
      setExamples(entity.examples || [])
    } else {
      setName('')
      setGloss([{ type: 'text', content: '' }])
      setExamples([])
    }
  }, [entity])

  const handleSave = () => {
    if (!personaId) return
    
    const now = new Date().toISOString()
    const entityData: EntityType = {
      id: entity?.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      gloss,
      examples,
      createdAt: entity?.createdAt || now,
      updatedAt: now,
    }

    if (entity) {
      dispatch(updateEntityInPersona({ personaId, entity: entityData }))
    } else {
      dispatch(addEntityToPersona({ personaId, entity: entityData }))
    }

    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{entity ? 'Edit Entity' : 'Add Entity'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
          />
          <GlossEditor
            gloss={gloss}
            onChange={setGloss}
            personaId={personaId}
          />
          <TextField
            label="Examples (comma-separated)"
            value={examples.join(', ')}
            onChange={(e) => setExamples(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            fullWidth
            multiline
            rows={2}
            helperText="Optional: Provide example instances of this entity type"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!name || gloss.length === 0}>
          {entity ? 'Update' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}