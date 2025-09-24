import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Chip,
} from '@mui/material'
import { generateId } from '../utils/uuid'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material'
import { RootState, AppDispatch } from '../store/store'
import { addEventToPersona, updateEventInPersona } from '../store/personaSlice'
import { EventType, EventRole, GlossItem } from '../models/types'
import GlossEditor from './GlossEditor'

interface EventEditorProps {
  open: boolean
  onClose: () => void
  event: EventType | null
  personaId: string | null
}

export default function EventEditor({ open, onClose, event, personaId }: EventEditorProps) {
  const dispatch = useDispatch<AppDispatch>()
  const ontology = useSelector((state: RootState) => 
    state.persona.personaOntologies.find(o => o.personaId === personaId)
  )
  const [name, setName] = useState('')
  const [gloss, setGloss] = useState<GlossItem[]>([{ type: 'text', content: '' }])
  const [roles, setRoles] = useState<EventRole[]>([])
  const [examples, setExamples] = useState<string[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState('')

  useEffect(() => {
    if (event) {
      setName(event.name)
      setGloss(event.gloss)
      setRoles(event.roles)
      setExamples(event.examples || [])
    } else {
      setName('')
      setGloss([{ type: 'text', content: '' }])
      setRoles([])
      setExamples([])
    }
  }, [event])

  const handleSave = () => {
    if (!personaId) return
    
    const now = new Date().toISOString()
    const eventData: EventType = {
      id: event?.id || `generateId()`,
      name,
      gloss,
      roles,
      examples,
      createdAt: event?.createdAt || now,
      updatedAt: now,
    }

    if (event) {
      dispatch(updateEventInPersona({ personaId, event: eventData }))
    } else {
      dispatch(addEventToPersona({ personaId, event: eventData }))
    }

    onClose()
  }

  const handleAddRole = () => {
    if (selectedRoleId && !roles.some(r => r.roleTypeId === selectedRoleId)) {
      setRoles([...roles, {
        roleTypeId: selectedRoleId,
        optional: false,
      }])
      setSelectedRoleId('')
    }
  }

  const handleRemoveRole = (index: number) => {
    setRoles(roles.filter((_, i) => i !== index))
  }

  const handleRoleOptionalChange = (index: number, optional: boolean) => {
    const updated = [...roles]
    updated[index] = { ...updated[index], optional }
    setRoles(updated)
  }

  const getRoleName = (roleTypeId: string) => {
    const role = ontology?.roles.find(r => r.id === roleTypeId)
    return role?.name || roleTypeId
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{event ? 'Edit Event' : 'Add Event'}</DialogTitle>
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
              Event Roles
            </Typography>
            <List dense>
              {roles.map((role, index) => (
                <ListItem key={index}>
                  <ListItemText
                    primary={getRoleName(role.roleTypeId)}
                    secondary={
                      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                        {role.optional && <Chip label="Optional" size="small" />}
                        {role.minOccurrences && <Chip label={`Min: ${role.minOccurrences}`} size="small" />}
                        {role.maxOccurrences && <Chip label={`Max: ${role.maxOccurrences}`} size="small" />}
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={role.optional}
                          onChange={(e) => handleRoleOptionalChange(index, e.target.checked)}
                        />
                      }
                      label="Optional"
                    />
                    <IconButton edge="end" onClick={() => handleRemoveRole(index)}>
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Select
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                displayEmpty
                size="small"
                sx={{ flex: 1 }}
              >
                <MenuItem value="" disabled>
                  Select a role to add
                </MenuItem>
                {ontology?.roles
                  .filter(r => !roles.some(er => er.roleTypeId === r.id))
                  .map(role => (
                    <MenuItem key={role.id} value={role.id}>
                      {role.name}
                    </MenuItem>
                  ))
                }
              </Select>
              <IconButton onClick={handleAddRole} color="primary" disabled={!selectedRoleId}>
                <AddIcon />
              </IconButton>
            </Box>
          </Box>

          <TextField
            label="Examples (comma-separated)"
            value={examples.join(', ')}
            onChange={(e) => setExamples(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            fullWidth
            multiline
            rows={2}
            helperText="Optional: Provide example instances of this event type"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          disabled={!name || gloss.length === 0}
        >
          {event ? 'Update' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}