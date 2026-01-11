import { useState, useEffect } from 'react'
import {
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
  Checkbox,
  TextField,
  Chip,
} from '@mui/material'
import { generateId } from '@utils/uuid'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Event as EventTypeIcon,
} from '@mui/icons-material'
import {
  usePersonas,
  usePersonaOntology,
  useAddEventToPersona,
  useUpdateEventInPersona,
  useDeleteEventFromPersona,
} from '@store/queries'
import { EventType, EventRole, GlossItem } from '@models/types'
import BaseTypeEditor from '@components/shared/BaseTypeEditor'

interface EventTypeEditorProps {
  open: boolean
  onClose: () => void
  event: EventType | null
  personaId: string | null
}

export default function EventTypeEditor({ open, onClose, event, personaId }: EventTypeEditorProps) {
  // TanStack Query hooks
  const { data: personas = [] } = usePersonas()
  const { data: ontology } = usePersonaOntology(personaId)
  const { mutateAsync: addEvent } = useAddEventToPersona()
  const { mutateAsync: updateEvent } = useUpdateEventInPersona()
  const { mutate: deleteEvent } = useDeleteEventFromPersona()

  // Form state
  const [name, setName] = useState('')
  const [gloss, setGloss] = useState<GlossItem[]>([{ type: 'text', content: '' }])
  const [roles, setRoles] = useState<EventRole[]>([])
  const [examples, setExamples] = useState<string[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [mode, setMode] = useState<'manual' | 'copy' | 'wikidata'>('manual')
  const [sourcePersonaIdState, setSourcePersonaIdState] = useState('')

  // Fetch source persona's ontology when copying
  const { data: sourceOntology } = usePersonaOntology(sourcePersonaIdState || null)

  const setSourcePersonaId = (id: string) => {
    setSourcePersonaIdState(id)
  }
  const sourcePersonaId = sourcePersonaIdState
  const [sourceEventId, setSourceEventId] = useState('')
  const [targetPersonaIds, setTargetPersonaIds] = useState<string[]>([personaId || ''])
  const [wikidataId, setWikidataId] = useState<string>('')
  const [wikidataUrl, setWikidataUrl] = useState<string>('')
  const [importedAt, setImportedAt] = useState<string>('')
  const [exampleInput, setExampleInput] = useState('')

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

  useEffect(() => {
    // When copying from another persona, populate the fields
    if (mode === 'copy' && sourcePersonaId && sourceEventId && sourceOntology) {
      const sourceEvent = sourceOntology.events.find(e => e.id === sourceEventId)
      if (sourceEvent) {
        setName(sourceEvent.name)
        setGloss(sourceEvent.gloss)
        setRoles(sourceEvent.roles)
        setExamples(sourceEvent.examples || [])
        setWikidataId(sourceEvent.wikidataId || '')
        setWikidataUrl(sourceEvent.wikidataUrl || '')
        setImportedAt(sourceEvent.importedAt || '')
      }
    }
  }, [mode, sourcePersonaId, sourceEventId, sourceOntology])

  const handleSave = async () => {
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
      importedFrom: mode === 'wikidata' ? 'wikidata' : mode === 'copy' ? 'persona' : undefined,
      importedAt: wikidataId ? (importedAt || now) : undefined,
      createdAt: event?.createdAt || now,
      updatedAt: now,
    }

    if (event) {
      await updateEvent({ personaId, event: eventData })
    } else {
      await Promise.all(targetPersonaIds.map(async (targetId) => {
        const newEventData = { ...eventData, id: generateId() }
        await addEvent({ personaId: targetId, event: newEventData })
      }))
    }

    onClose()
  }

  const handleDelete = () => {
    if (event && personaId) {
      deleteEvent({ personaId, eventId: event.id })
      onClose()
    }
  }

  const handleAddRole = () => {
    if (selectedRoleId && !roles.find(r => r.roleTypeId === selectedRoleId)) {
      setRoles([...roles, {
        roleTypeId: selectedRoleId,
        optional: false,
      }])
      setSelectedRoleId('')
    }
  }

  const handleRemoveRole = (roleTypeId: string) => {
    setRoles(roles.filter(r => r.roleTypeId !== roleTypeId))
  }

  const handleToggleOptional = (roleTypeId: string) => {
    setRoles(roles.map(r =>
      r.roleTypeId === roleTypeId
        ? { ...r, optional: !r.optional }
        : r
    ))
  }

  const handleAddExample = () => {
    if (exampleInput.trim()) {
      setExamples([...examples, exampleInput.trim()])
      setExampleInput('')
    }
  }

  const handleRemoveExample = (index: number) => {
    setExamples(examples.filter((_, i) => i !== index))
  }

  // Additional fields for event types (roles management)
  const additionalFields = (
    <Box>
      {/* Roles Management */}
      <Typography variant="subtitle2" component="div" gutterBottom>Roles</Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <FormControl fullWidth size="small">
          <InputLabel>Add Role</InputLabel>
          <Select
            value={selectedRoleId}
            onChange={(e) => setSelectedRoleId(e.target.value)}
            label="Add Role"
          >
            {ontology?.roles
              .filter(r => !roles.find(er => er.roleTypeId === r.id))
              .map(role => (
                <MenuItem key={role.id} value={role.id}>
                  {role.name}
                </MenuItem>
              ))}
          </Select>
        </FormControl>
        <IconButton onClick={handleAddRole} disabled={!selectedRoleId} aria-label="Add role">
          <AddIcon />
        </IconButton>
      </Box>
      
      <List dense>
        {roles.map((eventRole) => {
          const role = ontology?.roles.find(r => r.id === eventRole.roleTypeId)
          if (!role) return null
          
          return (
            <ListItem key={eventRole.roleTypeId}>
              <ListItemText
                primary={role.name}
                secondary={
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={eventRole.optional}
                        onChange={() => handleToggleOptional(eventRole.roleTypeId)}
                      />
                    }
                    label="Optional"
                  />
                }
              />
              <ListItemSecondaryAction>
                <IconButton
                  edge="end"
                  size="small"
                  onClick={() => handleRemoveRole(eventRole.roleTypeId)}
                  aria-label={`Remove role ${role.name}`}
                >
                  <DeleteIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          )
        })}
      </List>

      {/* Examples */}
      <Typography variant="subtitle2" component="div" gutterBottom sx={{ mt: 2 }}>Examples</Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
        <TextField
          size="small"
          placeholder="Add example..."
          value={exampleInput}
          onChange={(e) => setExampleInput(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAddExample()
            }
          }}
          fullWidth
        />
        <IconButton onClick={handleAddExample} size="small" aria-label="Add example">
          <AddIcon />
        </IconButton>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {examples.map((example, index) => (
          <Chip
            key={index}
            label={example}
            onDelete={() => handleRemoveExample(index)}
            size="small"
          />
        ))}
      </Box>
    </Box>
  )

  // Source selector for copy mode
  const sourceSelector = mode === 'copy' && (
    <>
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Source Persona</InputLabel>
        <Select
          value={sourcePersonaId}
          onChange={(e) => {
            setSourcePersonaId(e.target.value)
            setSourceEventId('')
          }}
          label="Source Persona"
        >
          {personas.filter(p => p.id !== personaId).map(persona => (
            <MenuItem key={persona.id} value={persona.id}>
              {persona.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {sourcePersonaId && sourceOntology && (
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Source Event Type</InputLabel>
          <Select
            value={sourceEventId}
            onChange={(e) => setSourceEventId(e.target.value)}
            label="Source Event Type"
          >
            {sourceOntology.events.map(event => (
              <MenuItem key={event.id} value={event.id}>
                {event.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
    </>
  )

  return (
    <BaseTypeEditor
      open={open}
      onClose={onClose}
      typeCategory="event"
      personaId={personaId}
      name={name}
      setName={setName}
      gloss={gloss}
      setGloss={setGloss}
      mode={mode}
      setMode={setMode}
      sourcePersonaId={sourcePersonaId}
      setSourcePersonaId={setSourcePersonaId}
      targetPersonaIds={targetPersonaIds}
      setTargetPersonaIds={setTargetPersonaIds}
      wikidataId={wikidataId}
      wikidataUrl={wikidataUrl}
      importedAt={importedAt}
      onSave={handleSave}
      onDelete={event ? handleDelete : undefined}
      title={event ? 'Edit Event Type' : 'Create Event Type'}
      icon={<EventTypeIcon />}
      additionalFields={additionalFields}
      sourceSelector={sourceSelector}
      isEditing={!!event}
      availablePersonas={personas}
    />
  )
}