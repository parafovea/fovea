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
  FormControlLabel,
  Checkbox,
  FormGroup,
  Typography,
} from '@mui/material'
import { AppDispatch } from '../store/store'
import { generateId } from '../utils/uuid'
import { addRoleToPersona, updateRoleInPersona } from '../store/personaSlice'
import { RoleType, GlossItem } from '../models/types'
import GlossEditor from './GlossEditor'

interface RoleEditorProps {
  open: boolean
  onClose: () => void
  role: RoleType | null
  personaId: string | null
}

export default function RoleEditor({ open, onClose, role, personaId }: RoleEditorProps) {
  const dispatch = useDispatch<AppDispatch>()
  const [name, setName] = useState('')
  const [gloss, setGloss] = useState<GlossItem[]>([{ type: 'text', content: '' }])
  const [allowedFillerTypes, setAllowedFillerTypes] = useState<('entity' | 'event')[]>(['entity'])
  const [examples, setExamples] = useState<string[]>([])

  useEffect(() => {
    if (role) {
      setName(role.name)
      setGloss(role.gloss)
      setAllowedFillerTypes(role.allowedFillerTypes)
      setExamples(role.examples || [])
    } else {
      setName('')
      setGloss([{ type: 'text', content: '' }])
      setAllowedFillerTypes(['entity'])
      setExamples([])
    }
  }, [role])

  const handleSave = () => {
    if (!personaId) return
    
    const now = new Date().toISOString()
    const roleData: RoleType = {
      id: role?.id || `generateId()`,
      name,
      gloss,
      allowedFillerTypes,
      examples,
      createdAt: role?.createdAt || now,
      updatedAt: now,
    }

    if (role) {
      dispatch(updateRoleInPersona({ personaId, role: roleData }))
    } else {
      dispatch(addRoleToPersona({ personaId, role: roleData }))
    }

    onClose()
  }

  const handleFillerTypeChange = (type: 'entity' | 'event', checked: boolean) => {
    if (checked) {
      setAllowedFillerTypes([...allowedFillerTypes, type])
    } else {
      setAllowedFillerTypes(allowedFillerTypes.filter(t => t !== type))
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{role ? 'Edit Role' : 'Add Role'}</DialogTitle>
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

          <Box>
            <Typography variant="subtitle1" gutterBottom>
              Allowed Filler Types
            </Typography>
            <FormGroup row>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={allowedFillerTypes.includes('entity')}
                    onChange={(e) => handleFillerTypeChange('entity', e.target.checked)}
                  />
                }
                label="Entity"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={allowedFillerTypes.includes('event')}
                    onChange={(e) => handleFillerTypeChange('event', e.target.checked)}
                  />
                }
                label="Event"
              />
            </FormGroup>
          </Box>

          <TextField
            label="Examples (comma-separated)"
            value={examples.join(', ')}
            onChange={(e) => setExamples(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            fullWidth
            multiline
            rows={2}
            helperText="Optional: Provide example uses of this role type"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          disabled={!name || gloss.length === 0 || allowedFillerTypes.length === 0}
        >
          {role ? 'Update' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}