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
  FormControl,
  InputLabel,
  FormGroup,
  Divider,
  Checkbox,
} from '@mui/material'
import { generateId } from '../utils/uuid'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Event as EventTypeIcon,
} from '@mui/icons-material'
import { RootState, AppDispatch } from '../store/store'
import { addEventToPersona, updateEventInPersona } from '../store/personaSlice'
import { EventType, EventRole, GlossItem } from '../models/types'
import GlossEditor from './GlossEditor'
import ModeSelector from './shared/ModeSelector'
import { WikidataChip } from './shared/WikidataChip'
import { TypeObjectBadge } from './shared/TypeObjectToggle'
import WikidataSearch from './WikidataSearch'

interface EventTypeEditorProps {
  open: boolean
  onClose: () => void
  event: EventType | null
  personaId: string | null
}

export default function EventTypeEditor({ open, onClose, event, personaId }: EventTypeEditorProps) {
  const dispatch = useDispatch<AppDispatch>()
  const { personas, personaOntologies } = useSelector((state: RootState) => state.persona)
  const ontology = personaOntologies.find(o => o.personaId === personaId)
  const [name, setName] = useState('')
  const [gloss, setGloss] = useState<GlossItem[]>([{ type: 'text', content: '' }])
  const [roles, setRoles] = useState<EventRole[]>([])
  const [examples, setExamples] = useState<string[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [mode, setMode] = useState<'manual' | 'copy' | 'wikidata'>('manual')
  const [sourcePersonaId, setSourcePersonaId] = useState('')
  const [sourceEventId, setSourceEventId] = useState('')
  const [targetPersonaIds, setTargetPersonaIds] = useState<string[]>([personaId || ''])
  const [wikidataId, setWikidataId] = useState<string>('')
  const [wikidataUrl, setWikidataUrl] = useState<string>('')
  const [importedAt, setImportedAt] = useState<string>('')

  useEffect(() => {
    if (event) {
      setName(event.name)
      setGloss(event.gloss)
      setRoles(event.roles)
      setExamples(event.examples || [])
      setWikidataId(event.wikidataId || '')
      setWikidataUrl(event.wikidataUrl || '')
      setImportedAt(event.importedAt || '')
    } else {
      setName('')
      setGloss([{ type: 'text', content: '' }])
      setRoles([])
      setExamples([])
      setMode('manual')
      setSourcePersonaId('')
      setSourceEventId('')
      setWikidataId('')
      setWikidataUrl('')
      setImportedAt('')
    }
  }, [event])

  const handleSave = () => {
    if (!personaId) return
    
    const now = new Date().toISOString()
    const eventData: EventType = {
      id: event?.id || generateId(),
      name,
      gloss,
      roles,
      examples,
      wikidataId: wikidataId || undefined,
      wikidataUrl: wikidataUrl || undefined,
      importedFrom: wikidataId ? 'wikidata' : undefined,
      importedAt: importedAt || undefined,
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
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <EventTypeIcon color="primary" />
          {event ? 'Edit Event Type' : 'Add Event Type'}
          <TypeObjectBadge isType={true} />
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          {wikidataId && (
            <WikidataChip 
              wikidataId={wikidataId}
              wikidataUrl={wikidataUrl}
              importedAt={importedAt}
              showTimestamp={true}
            />
          )}
          
          {!event && (
            <>
              <ModeSelector 
                mode={mode} 
                onChange={(newMode) => setMode(newMode)}
                showCopy={true}
              />
              
              {mode === 'copy' && (
                <>
                  <FormControl fullWidth>
                    <InputLabel>Source Persona</InputLabel>
                    <Select
                      value={sourcePersonaId}
                      onChange={(e) => {
                        setSourcePersonaId(e.target.value)
                        setSourceEventId('')
                      }}
                      label="Source Persona"
                    >
                      {personas.map(p => (
                        <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  
                  {sourcePersonaId && (
                    <FormControl fullWidth>
                      <InputLabel>Event Type to Copy</InputLabel>
                      <Select
                        value={sourceEventId}
                        onChange={(e) => {
                          const selectedId = e.target.value
                          setSourceEventId(selectedId)
                          const sourceOntology = personaOntologies.find(o => o.personaId === sourcePersonaId)
                          const sourceEvent = sourceOntology?.events.find(ev => ev.id === selectedId)
                          if (sourceEvent) {
                            setName(sourceEvent.name)
                            setGloss(sourceEvent.gloss)
                            setRoles(sourceEvent.roles || [])
                            setExamples(sourceEvent.examples || [])
                          }
                        }}
                        label="Event Type to Copy"
                      >
                        {personaOntologies
                          .find(o => o.personaId === sourcePersonaId)
                          ?.events.map(e => (
                            <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>
                          ))}
                      </Select>
                    </FormControl>
                  )}
                </>
              )}
              
              {mode === 'wikidata' && (
                <WikidataSearch
                  entityType="type"
                  onImport={(data) => {
                    setName(data.name)
                    setGloss([{ type: 'text', content: data.description || `An event type from Wikidata.` }])
                    setWikidataId(data.wikidataId)
                    setWikidataUrl(data.wikidataUrl)
                    setImportedAt(new Date().toISOString())
                    if (data.aliases) {
                      setExamples(data.aliases)
                    }
                  }}
                />
              )}
            </>
          )}
          
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            disabled={!event && ((mode === 'copy' && !sourceEventId) || (mode === 'wikidata' && !name))}
          />
          
          <GlossEditor
            gloss={gloss}
            onChange={setGloss}
            personaId={personaId}
            disabled={!event && ((mode === 'copy' && !sourceEventId) || (mode === 'wikidata' && !name))}
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